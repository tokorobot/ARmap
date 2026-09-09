// ============================================================
// ホーム画面: QR読み取り開始 + 目的地選択
// ============================================================

import { NODES, type NavNode } from "../data/graph";
import DestinationList from "./DestinationList";

interface Props {
  currentId: string | null;
  pendingId: string | null;
  onScan: () => void;
  onSelectDest: (node: NavNode) => void;
  onClearPending: () => void;
  onClearCurrent: () => void;
  onDemoStart: () => void;
}

export default function HomeView({
  currentId,
  pendingId,
  onScan,
  onSelectDest,
  onClearPending,
  onClearCurrent,
  onDemoStart,
}: Props) {
  const current = currentId ? NODES.get(currentId) : undefined;
  const pending = pendingId ? NODES.get(pendingId) : undefined;

  return (
    <div className="home">
      <div className="card">
        {current ? (
          <div className="pending-row">
            <p className="current-chip">
              📍 現在地: <strong>{current.label}</strong>（{current.buildingName} {current.floor}F）
            </p>
            <button className="clear-btn" onClick={onClearCurrent}>
              解除
            </button>
          </div>
        ) : (
          <p className="home-lead">
            校内に掲示されたQRコードを読み取ると、現在地から目的地まで道案内します。
          </p>
        )}
        {pending && (
          <div className="pending-row">
            <p className="current-chip">
              🎯 目的地: <strong>{pending.label}</strong> を選択中
            </p>
            <button className="clear-btn" onClick={onClearPending}>
              解除
            </button>
          </div>
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
        <a href="#/edit">配置エディタ（管理用）</a>
        <button className="link-btn" onClick={onDemoStart}>
          （テスト用）事務室前を現在地にする
        </button>
      </footer>
    </div>
  );
}
