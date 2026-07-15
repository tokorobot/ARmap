// ============================================================
// 校内ナビ：経路グラフ定義（延岡工業高校）
// 「学校見取り図.pdf」を元にした模式データ。
//
// 座標系: x = 東がプラス, y = 南がプラス（SVGと同じ・北が画面上）
// 方位角: 北=0°, 東=90°, 南=180°, 西=270°
//
// ※図面から読み取れない部分は仮定を置いている（現地確認で要修正）:
//   - 各棟の部屋の並び順（北→南と仮定）
//   - 渡り廊下の位置（各棟の北端で接続と仮定）
//   - 1号館の階段位置（WCと事務室の間 → 廊下中央付近と仮定）
//   - QRの facing（QRを正面に見たときにユーザーが向く方位。現地で実測）
// 修正はこのファイルの BUILDINGS / BRIDGES / QR_OVERRIDES だけ直せばよい。
// ============================================================

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
  /** このノードにQRを貼る場合の設定 */
  qr?: { facing: number; place: string };
}

export interface NavEdge {
  from: string;
  to: string;
  kind: "corridor" | "bridge" | "stair";
  w: number;
}

type StairPos = "north" | "center" | "south";

interface BuildingDef {
  id: string;
  name: string;
  x: number; // 廊下中心線のX座標
  yTop: number; // 北端
  yBottom: number; // 南端
  stairs: StairPos[];
  roomsByFloor: Record<number, string[]>; // 北→南の順に列挙
}

// ------------------------------------------------------------
// 棟の定義（部屋名を書き換えれば地図・目的地一覧に反映される）
// ------------------------------------------------------------
const BUILDINGS: BuildingDef[] = [
  {
    id: "b1",
    name: "1号館",
    x: 110,
    yTop: 70,
    yBottom: 350,
    stairs: ["center"], // WCと事務室の間（位置は要調整）
    roomsByFloor: {
      1: ["職員室", "校長室", "事務室", "保健室", "印刷室", "進路室", "視聴覚室"],
      2: ["生活3", "化学3", "土木3", "情報", "図書館"],
      3: ["CAI", "選択6", "電気電子3", "機械3", "選択7", "放送室", "会議室", "製図室"],
    },
  },
  {
    id: "b2",
    name: "2号館",
    x: 260,
    yTop: 70,
    yBottom: 350,
    stairs: ["north", "south"],
    roomsByFloor: {
      1: ["選択5", "生活2", "化学2", "土木2"],
      2: ["情報2", "電気電子2", "機械2", "選択4"],
      3: ["化学室", "物理室"],
    },
  },
  {
    id: "b3",
    name: "3号館",
    x: 410,
    yTop: 70,
    yBottom: 350,
    stairs: ["north", "south"],
    roomsByFloor: {
      1: ["礼法室", "生活1", "化学1", "土木1"],
      2: ["情報1", "電気電子1", "機械1", "選択3"],
      3: ["生徒会室", "生徒指導室", "選択1", "選択2"],
      4: ["音楽室", "美術室"],
    },
  },
];

// 渡り廊下: 西側の棟 → 東側の棟、接続する階
const BRIDGES: { west: string; east: string; floors: number[] }[] = [
  { west: "b1", east: "b2", floors: [1, 2, 3] },
  { west: "b2", east: "b3", floors: [1, 2, 3] },
];

// 階段以外でQRを貼る場所（起点など）。facing は現地で実測して修正する
const QR_OVERRIDES: { nodeId: string; facing: number; place: string }[] = [
  { nodeId: "b1-1f-事務室", facing: 270, place: "事務室前（来校者受付・起点）" },
];

// ------------------------------------------------------------
// 以下、グラフの自動生成（通常は触らなくてよい）
// ------------------------------------------------------------

const posLabelMap: Record<StairPos, string> = { north: "北", center: "中央", south: "南" };

function stairY(b: BuildingDef, pos: StairPos): number {
  if (pos === "north") return b.yTop + 18;
  if (pos === "south") return b.yBottom - 12;
  return (b.yTop + b.yBottom) / 2;
}

// 踊り場でQRを読むとき、ユーザーが向いていそうな方位の初期値
// （北側階段なら廊下は南向きに伸びる…という程度の仮置き。要実測）
function stairDefaultFacing(pos: StairPos): number {
  if (pos === "north") return 180;
  if (pos === "south") return 0;
  return 90;
}

const nodeMap = new Map<string, NavNode>();
const edgeList: NavEdge[] = [];

function addEdge(from: string, to: string, kind: NavEdge["kind"], w: number) {
  edgeList.push({ from, to, kind, w });
}

for (const b of BUILDINGS) {
  const floors = Object.keys(b.roomsByFloor)
    .map(Number)
    .sort((a, z) => a - z);

  for (const f of floors) {
    const floorNodes: NavNode[] = [];
    const base = { buildingId: b.id, buildingName: b.name, floor: f };

    // 部屋ノード（廊下中心線上に等間隔で配置）
    const rooms = b.roomsByFloor[f];
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
      floorNodes.push({
        id: `${b.id}-${f}f-stair-${pos}`,
        label: `${b.name}${posLabelMap[pos]}階段 ${f}F`,
        ...base,
        x: b.x,
        y: stairY(b, pos),
        kind: "stair",
        isDestination: false,
        qr: {
          facing: stairDefaultFacing(pos),
          place: `${b.name} ${posLabelMap[pos]}階段 ${f}階踊り場`,
        },
      });
    }

    // 渡り廊下の接続ノード（棟の北端）
    const hasBridge = BRIDGES.some(
      (br) => (br.west === b.id || br.east === b.id) && br.floors.includes(f)
    );
    if (hasBridge) {
      floorNodes.push({
        id: `${b.id}-${f}f-jn`,
        label: `${b.name}${f}F 北側廊下`,
        ...base,
        x: b.x,
        y: b.yTop,
        kind: "junction",
        isDestination: false,
      });
    }

    // 廊下エッジ: 北→南に並べて隣同士をつなぐ
    floorNodes.sort((a, z) => a.y - z.y);
    for (const n of floorNodes) nodeMap.set(n.id, n);
    for (let i = 0; i < floorNodes.length - 1; i++) {
      addEdge(
        floorNodes[i].id,
        floorNodes[i + 1].id,
        "corridor",
        Math.max(1, floorNodes[i + 1].y - floorNodes[i].y)
      );
    }
  }

  // 階段エッジ: 同じ階段の上下階をつなぐ（重み大きめ＝無駄な階移動を避ける）
  for (const pos of b.stairs) {
    for (let i = 0; i < floors.length - 1; i++) {
      addEdge(
        `${b.id}-${floors[i]}f-stair-${pos}`,
        `${b.id}-${floors[i + 1]}f-stair-${pos}`,
        "stair",
        40
      );
    }
  }
}

// 渡り廊下エッジ
for (const br of BRIDGES) {
  for (const f of br.floors) {
    const a = `${br.west}-${f}f-jn`;
    const z = `${br.east}-${f}f-jn`;
    const na = nodeMap.get(a);
    const nz = nodeMap.get(z);
    if (na && nz) addEdge(a, z, "bridge", Math.abs(nz.x - na.x));
  }
}

// QRの追加指定（起点など）
for (const q of QR_OVERRIDES) {
  const n = nodeMap.get(q.nodeId);
  if (n) n.qr = { facing: q.facing, place: q.place };
}

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
    if (nodeMap.has(id)) return id;
  }
  if (nodeMap.has(data)) return data;
  return null;
}

// ------------------------------------------------------------
// エクスポート
// ------------------------------------------------------------

export const NODES: ReadonlyMap<string, NavNode> = nodeMap;
export const EDGES: readonly NavEdge[] = edgeList;

/** 隣接リスト（双方向） */
export const ADJ: ReadonlyMap<string, { to: string; kind: NavEdge["kind"]; w: number }[]> =
  (() => {
    const m = new Map<string, { to: string; kind: NavEdge["kind"]; w: number }[]>();
    const push = (a: string, b: string, kind: NavEdge["kind"], w: number) => {
      if (!m.has(a)) m.set(a, []);
      m.get(a)!.push({ to: b, kind, w });
    };
    for (const e of edgeList) {
      push(e.from, e.to, e.kind, e.w);
      push(e.to, e.from, e.kind, e.w);
    }
    return m;
  })();

/** 目的地として選べるノード（定義順） */
export const DESTINATIONS: readonly NavNode[] = [...nodeMap.values()].filter(
  (n) => n.isDestination
);

/** QRを貼るノード一覧（印刷ページ用） */
export const QR_NODES: readonly NavNode[] = [...nodeMap.values()].filter((n) => n.qr);

/** 地図描画用の棟情報 */
export const MAP_BUILDINGS = BUILDINGS.map((b) => ({
  id: b.id,
  name: b.name,
  x: b.x,
  yTop: b.yTop,
  yBottom: b.yBottom,
  floors: Object.keys(b.roomsByFloor).map(Number),
}));

/** 地図描画用の渡り廊下情報 */
export const MAP_BRIDGES = BRIDGES.map((br) => {
  const w = BUILDINGS.find((b) => b.id === br.west)!;
  const e = BUILDINGS.find((b) => b.id === br.east)!;
  return { x1: w.x, x2: e.x, y: w.yTop, floors: br.floors };
});
