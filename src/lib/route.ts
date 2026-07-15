// ============================================================
// 経路探索とターンバイターン案内文の生成
// ============================================================

import { ADJ, NODES, type NavNode } from "../data/graph";

/** ダイクストラ法で最短経路を求める（ノードID列を返す。到達不能ならnull） */
export function findPath(from: string, to: string): string[] | null {
  if (!NODES.has(from) || !NODES.has(to)) return null;
  if (from === to) return [from];

  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const visited = new Set<string>();

  // 小規模グラフ（100ノード程度）なので線形探索で十分
  for (;;) {
    let u: string | null = null;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (!visited.has(id) && d < best) {
        best = d;
        u = id;
      }
    }
    if (u === null) return null; // 到達不能
    if (u === to) break;
    visited.add(u);
    for (const e of ADJ.get(u) ?? []) {
      const nd = best + e.w;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, u);
      }
    }
  }

  const path = [to];
  while (path[0] !== from) {
    const p = prev.get(path[0]);
    if (!p) return null;
    path.unshift(p);
  }
  return path;
}

/** ノードaからbへの方位角（北=0°・東=90°・時計回り） */
export function bearing(a: NavNode, b: NavNode): number {
  // 座標系はyが南向きプラスなので反転して計算
  const deg = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI;
  return (deg + 360) % 360;
}

export type StepKind = "start" | "walk" | "bridge" | "stair" | "arrive";

export interface GuideStep {
  kind: StepKind;
  text: string;
  detail?: string;
  /** このステップで地図に表示するフロア */
  floor: number;
  /** 地図で強調するノードID列 */
  pathIds: string[];
  /** startステップ: 進むべき方位（コンパス矢印用） */
  bearing?: number;
}

type Run = { kind: "corridor" | "bridge" | "stair"; nodes: NavNode[] };

/** 直前の進行方向と次の進行方向から「右に/左に曲がり」の語を返す */
function turnWord(prevRun: Run, curRun: Run): string {
  if (prevRun.kind === "stair") return "階段を出て";
  const p1 = prevRun.nodes[prevRun.nodes.length - 2];
  const p2 = prevRun.nodes[prevRun.nodes.length - 1];
  const c1 = curRun.nodes[0];
  const c2 = curRun.nodes[1];
  const inV = { x: p2.x - p1.x, y: p2.y - p1.y };
  const outV = { x: c2.x - c1.x, y: c2.y - c1.y };
  const cross = inV.x * outV.y - inV.y * outV.x;
  const dot = inV.x * outV.x + inV.y * outV.y;
  if (Math.abs(cross) < 1e-6) return dot >= 0 ? "" : "折り返して";
  return cross > 0 ? "右に曲がり、" : "左に曲がり、";
}

/** 経路（ノードID列）から案内ステップ列を生成する */
export function buildSteps(pathIds: string[]): GuideStep[] {
  const path = pathIds.map((id) => NODES.get(id)!);
  const goal = path[path.length - 1];
  const start = path[0];

  // 連続する同種エッジを「ラン」にまとめる
  const runs: Run[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const kind: Run["kind"] =
      a.floor !== b.floor ? "stair" : a.buildingId !== b.buildingId ? "bridge" : "corridor";
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) last.nodes.push(b);
    else runs.push({ kind, nodes: [a, b] });
  }

  const steps: GuideStep[] = [];

  // スタート
  steps.push({
    kind: "start",
    text: `「${goal.label}」へ案内します`,
    detail: `${start.label} 付近から出発。矢印の方向へ進んでください`,
    floor: start.floor,
    pathIds: runs.length ? runs[0].nodes.map((n) => n.id) : [start.id],
    bearing: path.length > 1 ? bearing(path[0], path[1]) : undefined,
  });

  runs.forEach((run, i) => {
    const prefix = i > 0 ? turnWord(runs[i - 1], run) : "";
    const first = run.nodes[0];
    const last = run.nodes[run.nodes.length - 1];
    const ids = run.nodes.map((n) => n.id);

    if (run.kind === "corridor") {
      const passed = run.nodes
        .slice(1, -1)
        .filter((n) => n.kind === "room")
        .map((n) => n.label);
      steps.push({
        kind: "walk",
        text: `${prefix}廊下を直進`,
        detail: passed.length ? `${passed.join("・")}の前を通ります` : undefined,
        floor: first.floor,
        pathIds: ids,
      });
    } else if (run.kind === "bridge") {
      steps.push({
        kind: "bridge",
        text: `${prefix}渡り廊下で${last.buildingName}へ`,
        floor: first.floor,
        pathIds: ids,
      });
    } else {
      const up = last.floor > first.floor;
      steps.push({
        kind: "stair",
        text: `階段で${last.floor}階へ${up ? "上がる" : "下りる"}`,
        detail: "踊り場のQRを読み取ると、案内が現在地に合わせて更新されます",
        floor: last.floor,
        pathIds: ids,
      });
    }
  });

  // 到着
  steps.push({
    kind: "arrive",
    text: `「${goal.label}」に到着`,
    detail: "案内は以上です",
    floor: goal.floor,
    pathIds: [goal.id],
  });

  return steps;
}
