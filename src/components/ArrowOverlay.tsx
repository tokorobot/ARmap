// ============================================================
// 方位連動の矢印（疑似AR）
//
// 端末が向いている方位と、進むべき方位の差だけ矢印を回す。
// 端末を進行方向へ向けると矢印が真上を向き、色が変わる。
//
// 方位センサーが使えない場合は、QRを正面に見て立っている前提で
// QRの facing を基準にする。それも無ければ方位を文字で示すだけにする。
// ============================================================

import { angleDiff, compassLabel } from "../lib/geo";

interface Props {
  /** 進むべき実方位（北=0度） */
  bearing: number;
  /** 端末が向いている実方位。取得できないときは null */
  heading: number | null;
  /** センサーが無いときの基準方位（QRを正面に見た向き） */
  fallbackBase?: number | null;
  /** 到着ステップでは矢印ではなくチェックマークを出す */
  arrived?: boolean;
}

/** この範囲内を向いていれば「正しい方向」とみなす */
const MATCH_DEG = 25;

export default function ArrowOverlay({
  bearing,
  heading,
  fallbackBase,
  arrived = false,
}: Props) {
  const base = heading ?? fallbackBase ?? null;
  const rotation = base === null ? 0 : angleDiff(base, bearing);
  const matched = heading !== null && Math.abs(rotation) < MATCH_DEG;

  if (arrived) {
    return (
      <div className="ar-arrow ar-arrow-arrived" aria-label="到着">
        <svg viewBox="0 0 100 100" width="140" height="140">
          <circle cx="50" cy="50" r="44" className="ar-disc ar-disc-ok" />
          <path
            d="M30 52 L44 66 L71 37"
            fill="none"
            stroke="#fff"
            strokeWidth="9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className="ar-arrow">
      <svg
        viewBox="0 0 100 100"
        width="150"
        height="150"
        style={{ transform: `rotate(${rotation}deg)` }}
        aria-label={`${compassLabel(bearing)}へ進む`}
      >
        <circle
          cx="50"
          cy="50"
          r="44"
          className={matched ? "ar-disc ar-disc-ok" : "ar-disc"}
        />
        {/* 上向きの矢印。回転はこのSVG全体にかける */}
        <path
          d="M50 20 L72 58 L50 48 L28 58 Z"
          fill="#fff"
          stroke="#fff"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <rect x="45" y="52" width="10" height="24" rx="4" fill="#fff" />
      </svg>

      <p className="ar-arrow-label">
        {base === null ? (
          <>
            <strong>{compassLabel(bearing)}</strong>
            {"の方向へ"}
          </>
        ) : matched ? (
          <strong>この方向へ進んでください</strong>
        ) : (
          <>矢印の向きに体を回してください</>
        )}
      </p>
    </div>
  );
}
