// ============================================================
// 目的地選択リスト（棟・階ごとにグループ表示）
// ============================================================

import { useMemo } from "react";
import { DESTINATIONS, type NavNode } from "../data/graph";

interface Props {
  onSelect: (node: NavNode) => void;
}

export default function DestinationList({ onSelect }: Props) {
  const groups = useMemo(() => {
    const m = new Map<string, NavNode[]>();
    for (const n of DESTINATIONS) {
      const key = `${n.buildingName} ${n.floor}F`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(n);
    }
    return [...m.entries()];
  }, []);

  return (
    <div className="dest-list">
      {groups.map(([label, nodes]) => (
        <section key={label} className="dest-group">
          <h3 className="dest-group-title">{label}</h3>
          <div className="dest-grid">
            {nodes.map((n) => (
              <button key={n.id} className="dest-btn" onClick={() => onSelect(n)}>
                {n.label}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
