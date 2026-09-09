// ============================================================
// 疑似ARコンパス矢印
// QRスキャン直後の「最初の一歩の向き」を示す。
//  - 既定: 「QRを正面に見た向き」を基準にした固定表示
//  - ボタンで方位センサーに連動（iOSは許可ダイアログが出る）
// ============================================================

import { useCompass } from "../lib/compass";

interface Props {
  /** 進むべき方位（北=0°・時計回り） */
  bearing: number;
  /** QRを正面に見たときにユーザーが向く方位（センサー未許可時の基準） */
  qrFacing?: number;
}

export default function CompassArrow({ bearing, qrFacing }: Props) {
  const { heading, status, start } = useCompass();

  // 画面上向き = ユーザーの正面 として、矢印を相対回転させる
  const base = heading ?? qrFacing ?? 0;
  const rotation = (bearing - base + 360) % 360;

  return (
    <div className="compass">
      <svg viewBox="0 0 120 120" className="compass-svg" role="img" aria-label="進行方向">
        <circle cx={60} cy={60} r={54} fill="#ffffff" stroke="#c3d0d0" strokeWidth={2} />
        <circle cx={60} cy={60} r={46} fill="none" stroke="#e4ecec" strokeWidth={1} />
        <g style={{ transform: `rotate(${rotation}deg)`, transformOrigin: "60px 60px", transition: "transform 0.3s ease" }}>
          <path d="M60 18 L78 66 L60 56 L42 66 Z" fill="var(--accent)" />
          <circle cx={60} cy={60} r={5} fill="var(--accent)" />
        </g>
      </svg>
      {status === "active" ? (
        <p className="compass-note">端末の向きに連動中</p>
      ) : status === "denied" ? (
        <p className="compass-note">センサー不許可のため、QRコードを正面に見た向きが基準です</p>
      ) : (
        <>
          <p className="compass-note">QRコードを正面に見た向きが基準です</p>
          <button className="btn btn-ghost btn-sm" onClick={start}>
            端末の向きに連動させる
          </button>
        </>
      )}
    </div>
  );
}
