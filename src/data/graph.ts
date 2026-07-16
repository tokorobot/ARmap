// ============================================================
// 校内ナビ：経路グラフ定義（延岡工業高校）
//
// 配置データは layout.json（既定値）を元に、この端末の
// localStorage（配置エディタ #/edit で保存したもの）があれば
// そちらを優先して読み込む。
//
// 模式図の座標系: x = 図の右がプラス, y = 図の下がプラス
// 実方位との対応: rotationDeg = 「模式図の上」が実際に向いている方位角
//   （北=0°・東=90°・時計回り。Googleマップ実測で約100°＝ほぼ東）
//   コンパス矢印の計算時のみ実方位に変換する。模式図の描画はそのまま。
//
// 確認済みの配置（2026-07-16 ユーザー確認）:
//   - 教室は廊下の片側（図の右側）に並ぶ
//   - 渡り廊下は各棟の端（図の下側）で接続
// ※まだ仮定のまま（現地確認・エディタで修正）:
//   - 各階の部屋の並び順 / 1号館の階段位置 / QRのfacing実測値
// ============================================================

import defaultLayoutJson from "./layout.json";

export type NodeKind = "room" | "junction" | "stair";

export interface NavNode {
  id: string;
  label: string;
  buildingId: string;
  buildingName: string;
  floor: number;
  x: number;
  y: number;
  kind: NodeKind;
  isDestination: boolean;
  /** このノードにQRを貼る場合の設定。facingは実方位（北=0°） */
  qr?: { facing: number; place: string };
}

export interface NavEdge {
  from: string;
  to: string;
  kind: "corridor" | "bridge" | "stair";
  w: number;
}

export type StairPos = "north" | "center" | "south";
export type BridgeAt = "north" | "south";

export interface BuildingDef {
  id: string;
  name: string;
  x: number; // 廊下中心線のX座標（模式図）
  yTop: number;
  yBottom: number;
  stairs: StairPos[];
  roomsByFloor: Record<string, string[]>; // 階番号 → 図の上→下の順の部屋名
}

export interface BridgeDef {
  west: string; // 図の左側の棟ID
  east: string; // 図の右側の棟ID
  floors: number[];
  at: BridgeAt; // 接続位置（north=図の上端 / south=図の下端）
}

export interface QrPointDef {
  nodeId: string;
  facing: number; // QRを正面に見たときにユーザーが向く実方位
  place: string;
}

export interface LayoutConfig {
  rotationDeg: number;
  buildings: BuildingDef[];
  bridges: BridgeDef[];
  qrPoints: QrPointDef[];
  /** 階段ノードID → facing実測値の上書き */
  stairFacings: Record<string, number>;
}

export interface GraphData {
  nodes: Map<string, NavNode>;
  adj: Map<string, { to: string; kind: NavEdge["kind"]; w: number }[]>;
  destinations: NavNode[];
  qrNodes: NavNode[];
  mapBuildings: { id: string; name: string; x: number; yTop: number; yBottom: number; floors: number[] }[];
  mapBridges: { x1: number; x2: number; y: number; floors: number[] }[];
  rotationDeg: number;
}

export const DEFAULT_LAYOUT = defaultLayoutJson as unknown as LayoutConfig;
export const LAYOUT_LS_KEY = "nav.layout";

/** 既定レイアウト＋この端末の上書き（エディタで保存したもの）を読む */
export function loadLayout(): LayoutConfig {
  try {
    const raw = localStorage.getItem(LAYOUT_LS_KEY);
    if (raw) {
      const cfg = JSON.parse(raw) as LayoutConfig;
      if (cfg && Array.isArray(cfg.buildings) && Array.isArray(cfg.bridges)) return cfg;
    }
  } catch {
    // 壊れたデータは無視して既定値へ
  }
  return DEFAULT_LAYOUT;
}

const posLabelMap: Record<StairPos, string> = { north: "上", center: "中央", south: "下" };

function stairY(b: BuildingDef, pos: StairPos): number {
  if (pos === "north") return b.yTop + 18;
  if (pos === "south") return b.yBottom - 12;
  return (b.yTop + b.yBottom) / 2;
}

/** 踊り場QRのfacing初期値（模式図の向き＋方位補正。実測までの仮値） */
function stairDefaultFacing(pos: StairPos, rotationDeg: number): number {
  const schematic = pos === "north" ? 180 : pos === "south" ? 0 : 90;
  return Math.round((schematic + rotationDeg) % 360);
}

/** 配置データから経路グラフ一式を組み立てる */
export function buildGraph(cfg: LayoutConfig): GraphData {
  const nodes = new Map<string, NavNode>();
  const edges: NavEdge[] = [];
  const addEdge = (from: string, to: string, kind: NavEdge["kind"], w: number) =>
    edges.push({ from, to, kind, w: Math.max(1, w) });

  for (const b of cfg.buildings) {
    const floors = Object.keys(b.roomsByFloor)
      .map(Number)
      .sort((a, z) => a - z);

    for (const f of floors) {
      const floorNodes: NavNode[] = [];
      const base = { buildingId: b.id, buildingName: b.name, floor: f };

      // 部屋ノード（廊下中心線上に等間隔で配置）
      const rooms = b.roomsByFloor[String(f)] ?? [];
      const y0 = b.yTop + 45;
      const y1 = b.yBottom - 25;
      rooms.forEach((name, i) => {
        const y = rooms.length === 1 ? (y0 + y1) / 2 : y0 + (i * (y1 - y0)) / (rooms.length - 1);
        floorNodes.push({
          id: `${b.id}-${f}f-${name}`,
          label: name,
          ...base,
          x: b.x,
          y,
          kind: "room",
          isDestination: true,
        });
      });

      // 階段ノード（各階の踊り場。QRポイントを兼ねる）
      for (const pos of b.stairs) {
        const id = `${b.id}-${f}f-stair-${pos}`;
        floorNodes.push({
          id,
          label: `${b.name}${posLabelMap[pos]}側階段 ${f}F`,
          ...base,
          x: b.x,
          y: stairY(b, pos),
          kind: "stair",
          isDestination: false,
          qr: {
            facing: cfg.stairFacings[id] ?? stairDefaultFacing(pos, cfg.rotationDeg),
            place: `${b.name} ${posLabelMap[pos]}側階段 ${f}階踊り場`,
          },
        });
      }

      // 渡り廊下の接続ノード（接続位置ごとに1つ）
      const ats = new Set<BridgeAt>();
      for (const br of cfg.bridges) {
        if ((br.west === b.id || br.east === b.id) && br.floors.includes(f)) ats.add(br.at);
      }
      for (const at of ats) {
        floorNodes.push({
          id: `${b.id}-${f}f-jn-${at}`,
          label: `${b.name}${f}F ${at === "south" ? "下" : "上"}側廊下`,
          ...base,
          x: b.x,
          y: at === "south" ? b.yBottom : b.yTop,
          kind: "junction",
          isDestination: false,
        });
      }

      // 廊下エッジ: 図の上→下に並べて隣同士をつなぐ
      floorNodes.sort((a, z) => a.y - z.y);
      for (const n of floorNodes) nodes.set(n.id, n);
      for (let i = 0; i < floorNodes.length - 1; i++) {
        addEdge(floorNodes[i].id, floorNodes[i + 1].id, "corridor", floorNodes[i + 1].y - floorNodes[i].y);
      }
    }

    // 階段エッジ: 同じ階段の上下階をつなぐ（重み大きめ＝無駄な階移動を避ける）
    for (const pos of b.stairs) {
      for (let i = 0; i < floors.length - 1; i++) {
        addEdge(`${b.id}-${floors[i]}f-stair-${pos}`, `${b.id}-${floors[i + 1]}f-stair-${pos}`, "stair", 40);
      }
    }
  }

  // 渡り廊下エッジ
  for (const br of cfg.bridges) {
    for (const f of br.floors) {
      const a = `${br.west}-${f}f-jn-${br.at}`;
      const z = `${br.east}-${f}f-jn-${br.at}`;
      const na = nodes.get(a);
      const nz = nodes.get(z);
      if (na && nz) addEdge(a, z, "bridge", Math.abs(nz.x - na.x));
    }
  }

  // QRの追加指定（起点など）
  for (const q of cfg.qrPoints) {
    const n = nodes.get(q.nodeId);
    if (n) n.qr = { facing: q.facing, place: q.place };
  }

  // 隣接リスト（双方向）
  const adj = new Map<string, { to: string; kind: NavEdge["kind"]; w: number }[]>();
  const push = (a: string, b: string, kind: NavEdge["kind"], w: number) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push({ to: b, kind, w });
  };
  for (const e of edges) {
    push(e.from, e.to, e.kind, e.w);
    push(e.to, e.from, e.kind, e.w);
  }

  return {
    nodes,
    adj,
    destinations: [...nodes.values()].filter((n) => n.isDestination),
    qrNodes: [...nodes.values()].filter((n) => n.qr),
    mapBuildings: cfg.buildings.map((b) => ({
      id: b.id,
      name: b.name,
      x: b.x,
      yTop: b.yTop,
      yBottom: b.yBottom,
      floors: Object.keys(b.roomsByFloor).map(Number),
    })),
    mapBridges: cfg.bridges.map((br) => {
      const w = cfg.buildings.find((b) => b.id === br.west)!;
      const e = cfg.buildings.find((b) => b.id === br.east)!;
      return { x1: w.x, x2: e.x, y: br.at === "south" ? w.yBottom : w.yTop, floors: br.floors };
    }),
    rotationDeg: cfg.rotationDeg,
  };
}

// ------------------------------------------------------------
// アクティブなグラフ（アプリ全体で共有）
// ------------------------------------------------------------

export const ACTIVE_GRAPH: GraphData = buildGraph(loadLayout());

export const NODES = ACTIVE_GRAPH.nodes;
export const ADJ = ACTIVE_GRAPH.adj;
export const DESTINATIONS = ACTIVE_GRAPH.destinations;
export const QR_NODES = ACTIVE_GRAPH.qrNodes;
export const MAP_BUILDINGS = ACTIVE_GRAPH.mapBuildings;
export const MAP_BRIDGES = ACTIVE_GRAPH.mapBridges;
export const ROTATION_DEG = ACTIVE_GRAPH.rotationDeg;

// ------------------------------------------------------------
// ARラベル用の説明文（QRにかざしたとき表示される。自由に編集してよい）
// ------------------------------------------------------------
const ROOM_INFO: Record<string, string> = {
  職員室: "先生方の執務室です",
  校長室: "校長室です",
  事務室: "受付・各種手続きはこちら",
  保健室: "体調不良・けがの際はこちらへ",
  進路室: "進路指導・相談の部屋です",
  視聴覚室: "説明会や上映会で使う教室です",
  図書館: "本の貸出・自習スペースです",
  会議室: "会議室です",
  製図室: "製図の実習を行う教室です",
  CAI: "コンピュータ実習室です",
  放送室: "校内放送を行う部屋です",
  化学室: "化学の実験を行う教室です",
  物理室: "物理の実験を行う教室です",
  音楽室: "音楽の授業で使う教室です",
  美術室: "美術の授業で使う教室です",
  礼法室: "礼法・作法の授業で使う和室です",
  生徒会室: "生徒会の活動場所です",
};

/** ARラベルに表示する説明文 */
export function nodeInfo(n: NavNode): string {
  if (n.kind === "stair") return "ここでQRを読むと現在地が更新されます";
  return ROOM_INFO[n.label] ?? `${n.buildingName}${n.floor}階の教室です`;
}

/** QRの中身（URLまたはノードID）からノードIDを取り出す */
export function parseQrPayload(data: string): string | null {
  const m = data.match(/#\/qr\/([^/?&]+)/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (NODES.has(id)) return id;
  }
  if (NODES.has(data)) return data;
  return null;
}
