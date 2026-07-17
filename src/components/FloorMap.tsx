// ============================================================
// フロア地図（模式図）: 棟・部屋・階段・渡り廊下と経路を描画
// graph を渡すとそのグラフを描く（配置エディタのプレビュー用）。
// 省略時はアプリ全体で使っているアクティブなグラフを描く。
// ============================================================

import { ACTIVE_GRAPH, type GraphData, type NavNode } from "../data/graph";

interface Props {
  floor: number;
  /** 経路全体のノードID列（薄い線で表示） */
  pathIds: string[];
  /** 現在のステップ区間（太い線で強調） */
  highlightIds: string[];
  currentId?: string;
  goalId?: string;
  graph?: GraphData;
}

/** ノードID列から、指定フロア上の連続区間を取り出す */
function runsOnFloor(g: GraphData, ids: string[], floor: number): NavNode[][] {
  const runs: NavNode[][] = [];
  let cur: NavNode[] = [];
  for (const id of ids) {
    const n = g.nodes.get(id);
    if (n && n.floor === floor) {
      cur.push(n);
    } else {
      if (cur.length > 1) runs.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) runs.push(cur);
  return runs;
}

export default function FloorMap({ floor, pathIds, highlightIds, currentId, goalId, graph }: Props) {
  const g = graph ?? ACTIVE_GRAPH;
  const buildings = g.mapBuildings.filter((b) => b.floors.includes(floor));
  if (buildings.length === 0) return null;

  const minX = Math.min(...buildings.map((b) => b.x)) - 52;
  const maxX = Math.max(...buildings.map((b) => b.x)) + 44;
  const minY = Math.min(...buildings.map((b) => b.yTop)) - 34;
  const maxY = Math.max(...buildings.map((b) => b.yBottom)) + 24;

  const floorNodes = [...g.nodes.values()].filter(
    (n) => n.floor === floor && buildings.some((b) => b.id === n.buildingId)
  );
  const pathRuns = runsOnFloor(g, pathIds, floor);
  const hlRuns = runsOnFloor(g, highlightIds, floor);
  const currentNode = currentId ? g.nodes.get(currentId) : undefined;
  const goalNode = goalId ? g.nodes.get(goalId) : undefined;

  return (
    <svg
      className="floor-map"
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      role="img"
      aria-label={`${floor}階の地図`}
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
        </marker>
      </defs>

      {/* 方位記号（実際の北の向き。模式図は回転して描かれているため） */}
      <g transform={`translate(${maxX - 18}, ${minY + 20})`}>
        <circle r={13} fill="#ffffff" stroke="#c3d0d0" />
        <g transform={`rotate(${-g.rotationDeg})`}>
          <path d="M0 -9 L4 4 L0 1 L-4 4 Z" fill="#c25454" />
          <text y={-11} textAnchor="middle" fontSize={7} fontWeight={700} fill="#c25454">
            N
          </text>
        </g>
      </g>

      {/* 渡り廊下 */}
      {g.mapBridges
        .filter((br) => br.floors.includes(floor))
        .map((br, i) => (
          <g key={`br-${i}`}>
            <line x1={br.x1} y1={br.y1} x2={br.x2} y2={br.y2} stroke="#b9c6c6" strokeWidth={8} strokeLinecap="round" />
            <text
              x={(br.x1 + br.x2) / 2}
              y={(br.y1 + br.y2) / 2 - 8}
              textAnchor="middle"
              fontSize={7}
              fill="#7c8a8a"
            >
              渡り廊下
            </text>
          </g>
        ))}

      {/* 棟 */}
      {buildings.map((b) => (
        <g key={b.id}>
          <rect
            x={b.x - 40}
            y={b.yTop - 12}
            width={80}
            height={b.yBottom - b.yTop + 28}
            rx={8}
            fill="#ffffff"
            stroke="#c3d0d0"
          />
          <text x={b.x} y={b.yTop - 20} textAnchor="middle" fontSize={10} fontWeight={700} fill="#5b6b6b">
            {b.name} {floor}F
          </text>
        </g>
      ))}

      {/* 廊下（帯） */}
      {buildings.map((b) => (
        <line
          key={`co-${b.id}`}
          x1={b.x}
          y1={b.yTop - 4}
          x2={b.x}
          y2={b.yBottom + 8}
          stroke="#e8efee"
          strokeWidth={10}
          strokeLinecap="round"
        />
      ))}

      {/* 部屋（廊下の図右側に並ぶ） */}
      {floorNodes
        .filter((n) => n.kind === "room")
        .map((n) => {
          const isGoal = n.id === goalId;
          return (
            <g key={n.id}>
              <rect
                x={n.x + 8}
                y={n.y - 8}
                width={30}
                height={16}
                rx={3}
                fill={isGoal ? "#fde68a" : "#eef4f4"}
                stroke={isGoal ? "#d97706" : "#d0dcdc"}
              />
              <text x={n.x + 23} y={n.y + 2.5} textAnchor="middle" fontSize={6.5} fill="#3f4f4f">
                {n.label}
              </text>
            </g>
          );
        })}

      {/* 階段（廊下＝図左側） */}
      {floorNodes
        .filter((n) => n.kind === "stair")
        .map((n) => (
          <g key={n.id}>
            <rect x={n.x - 34} y={n.y - 7} width={26} height={14} rx={3} fill="#f5f0df" stroke="#cfc49a" />
            <text x={n.x - 21} y={n.y + 2.5} textAnchor="middle" fontSize={6.5} fill="#7a6f45">
              階段
            </text>
          </g>
        ))}

      {/* QRポイント */}
      {floorNodes
        .filter((n) => n.qr)
        .map((n) => (
          <g key={`qr-${n.id}`}>
            <rect x={n.x - 24} y={n.y - 20} width={16} height={11} rx={2} fill="#0d7a72" />
            <text x={n.x - 16} y={n.y - 12} textAnchor="middle" fontSize={6} fill="#ffffff" fontWeight={700}>
              QR
            </text>
          </g>
        ))}

      {/* 経路全体（薄） */}
      {pathRuns.map((run, i) => (
        <polyline
          key={`p-${i}`}
          points={run.map((n) => `${n.x},${n.y}`).join(" ")}
          fill="none"
          stroke="var(--accent)"
          strokeOpacity={0.25}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {/* 現在ステップ区間（強調） */}
      {hlRuns.map((run, i) => (
        <polyline
          key={`h-${i}`}
          points={run.map((n) => `${n.x},${n.y}`).join(" ")}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={4.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          markerEnd={i === hlRuns.length - 1 ? "url(#arrow)" : undefined}
        />
      ))}

      {/* 現在地 */}
      {currentNode && currentNode.floor === floor && (
        <g>
          <circle cx={currentNode.x} cy={currentNode.y} r={6} fill="var(--accent)" fillOpacity={0.25}>
            <animate attributeName="r" values="6;12;6" dur="1.8s" repeatCount="indefinite" />
          </circle>
          <circle cx={currentNode.x} cy={currentNode.y} r={4} fill="var(--accent)" stroke="#fff" strokeWidth={1.5} />
        </g>
      )}

      {/* 目的地 */}
      {goalNode && goalNode.floor === floor && (
        <text x={goalNode.x + 2} y={goalNode.y - 2} fontSize={13}>
          🚩
        </text>
      )}
    </svg>
  );
}
