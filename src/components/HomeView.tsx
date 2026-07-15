// ============================================================
// ホーム画面: QR読み取り開始 + 目的地選択
// ============================================================

import { NODES, type NavNode } from "../data/graph";
import DestinationList from "./DestinationList";

interface Props {
  currentId: string | null;
  onScan: () => void;
  onSelectDest: (node: NavNode) => void;
  onDemoStart: () => void;
}

export default function HomeView({ currentId, onScan, onSelectDest, onDemoStart }: Props) {
  const current = currentId ? NODES.get(currentId) : undefined;

  return (
    <div className="home">
      <div className="card">
        {current ? (
          <p className="current-chip">
            📍 現在地: <strong>{current.label}</strong>（{current.buildingName} {current.floor}F）
          </p>
        ) : (
          <p className="home-lead">
            校内に掲示されたQRコードを読み取ると、現在地から目的地まで道案内します。
          </p>
        )}
        <button className="btn btn-primary btn-lg" onClick={onScan}>
          📷 QRコードを読み取る
        </button>
      </div>

      <h2 className="section-title">目的地を選ぶ</h2>
      {!current && (
        <p className="note">
          ※目的地を選んでからQRコードを読み取ると、そこから案内を開始します
        </p>
      )}
      <DestinationList onSelect={onSelectDest} />

      <footer className="home-footer">
        <a href="#/print">QRコード印刷（管理用）</a>
        <button className="link-btn" onClick={onDemoStart}>
          （テスト用）事務室前を現在地にする
        </button>
      </footer>
    </div>
  );
}
