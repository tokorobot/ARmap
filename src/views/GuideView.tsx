// ============================================================
// 道案内画面
//
// 既定はARモード（カメラ映像＋方位連動の矢印）。
// カメラが使えない・許可されない場合は自動で手順リストに切り替える。
// 案内中に別のQRを読み取ったら、そこを新しい現在地として経路を引き直す。
// ============================================================

import { useEffect, useState } from "react";
import { NODES } from "../data/campus";
import { compassLabel, formatDistance } from "../lib/geo";
import { buildGuide } from "../lib/route";
import { useCompass } from "../lib/compass";
import CameraCanvas from "../components/CameraCanvas";
import ArrowOverlay from "../components/ArrowOverlay";
import FloorPlan from "../components/FloorPlan";

interface Props {
  fromId: string;
  toId: string;
  onFinish: () => void;
  /** 案内中に別のQRを読んだとき */
  onRelocate?: (nodeId: string) => void;
}

export default function GuideView({
  fromId,
  toId,
  onFinish,
  onRelocate,
}: Props) {
  const guide = buildGuide(fromId, toId);
  const [mode, setMode] = useState<"ar" | "list">("ar");
  const [stepIndex, setStepIndex] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const { heading, status, start } = useCompass();

  // 経路が変わったら最初の手順に戻す
  useEffect(() => {
    setStepIndex(0);
  }, [fromId, toId]);

  if (!guide) {
    const from = NODES.get(fromId);
    const to = NODES.get(toId);
    return (
      <div className="card">
        <p className="lead">
          経路が見つかりませんでした。
          {!from && "（出発地点のデータがありません）"}
          {!to && "（目的地のデータがありません）"}
        </p>
        <button className="btn btn-primary" onClick={onFinish}>
          ホームへ戻る
        </button>
      </div>
    );
  }

  const minutes = Math.max(1, Math.round(guide.totalSeconds / 60));
  const step = guide.steps[Math.min(stepIndex, guide.steps.length - 1)];
  const isLast = stepIndex >= guide.steps.length - 1;
  const qrFacing = guide.from.qr?.facing ?? null;

  const handleQr = (nodeId: string) => {
    if (nodeId === fromId) return; // 出発地点のQRを再度読んだだけ
    if (nodeId === toId) {
      // 目的地に着いた
      setStepIndex(guide.steps.length - 1);
      return;
    }
    onRelocate?.(nodeId);
  };

  // ---------- ARモード ----------
  if (mode === "ar" && !cameraError) {
    return (
      <CameraCanvas
        onQrDetected={handleQr}
        onCameraError={(msg) => setCameraError(msg)}
      >
        <div className="ar-top">
          <button className="ar-close" onClick={onFinish} aria-label="案内を終える">
            ×
          </button>
          <span className="ar-progress">
            {stepIndex + 1} / {guide.steps.length}　{guide.to.label}へ
          </span>
        </div>

        <ArrowOverlay
          bearing={step.bearing}
          heading={heading}
          fallbackBase={qrFacing}
          arrived={step.kind === "arrive"}
        />

        <div className="ar-card">
          <p className="step-text">{step.text}</p>
          {step.detail && <p className="step-detail">{step.detail}</p>}
          {step.distance > 0 && (
            <p className="ar-meta">
              {compassLabel(step.bearing)}（{Math.round(step.bearing)}°）へ{" "}
              {formatDistance(step.distance)}
            </p>
          )}

          {/* 方位センサーの状態に応じた案内 */}
          {status === "idle" && (
            <button
              className="ar-btn ar-btn-primary"
              style={{ marginTop: 10 }}
              onClick={() => void start()}
            >
              端末の向きに矢印を連動させる
            </button>
          )}
          {(status === "denied" || status === "unsupported") && (
            <p className="ar-warn">
              端末の向きが取得できないため、矢印は
              {qrFacing === null
                ? "方位の目安のみ"
                : "QRを正面に見て立っている前提"}
              で表示しています。
            </p>
          )}

          <div className="ar-card-row">
            <button
              className="ar-btn"
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            >
              戻る
            </button>
            {isLast ? (
              <button className="ar-btn ar-btn-primary" onClick={onFinish}>
                案内を終わる
              </button>
            ) : (
              <button
                className="ar-btn ar-btn-primary"
                onClick={() => setStepIndex((i) => i + 1)}
              >
                次へ
              </button>
            )}
          </div>

          <button
            className="ar-btn"
            style={{ marginTop: 8, width: "100%" }}
            onClick={() => setMode("list")}
          >
            手順を一覧で見る
          </button>
        </div>
      </CameraCanvas>
    );
  }

  // ---------- リストモード ----------
  return (
    <>
      {cameraError && (
        <div className="notice">
          {cameraError}。手順と地図で案内します。
          <br />
          カメラを使うと、進む方向を矢印で表示できます。
        </div>
      )}

      <div className="card">
        <span className="chip">
          {guide.from.label} → {guide.to.label}
        </span>
        <div className="route-summary" style={{ marginTop: 12 }}>
          <strong>{formatDistance(guide.totalDistance)}</strong>
          <span>
            徒歩およそ{minutes}分／{guide.steps.length}手順
          </span>
        </div>
        {!cameraError && (
          <button
            className="btn btn-primary"
            style={{ marginTop: 12 }}
            onClick={() => setMode("ar")}
          >
            カメラで案内を見る
          </button>
        )}
      </div>

      <ol className="steps">
        {guide.steps.map((s) => (
          <li
            key={s.index}
            className={s.kind === "arrive" ? "step step-arrive" : "step"}
          >
            <span className="step-no">
              {s.kind === "arrive" ? "✓" : s.index + 1}
            </span>
            <div>
              <p className="step-text">{s.text}</p>
              {s.detail && <p className="step-detail">{s.detail}</p>}
              {s.distance > 0 && (
                <p className="step-meta">
                  {compassLabel(s.bearing)}（{Math.round(s.bearing)}°）へ{" "}
                  {formatDistance(s.distance)}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>経路の平面図</h2>
        <FloorPlan floor={guide.from.floor} path={guide.path} height={460} />
      </div>

      <button className="btn btn-primary" onClick={onFinish}>
        ホームへ戻る
      </button>
    </>
  );
}
