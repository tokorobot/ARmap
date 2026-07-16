// ============================================================
// 案内画面
//  - 標準はARカメラモード（カメラ映像＋矢印＋ステップカード）
//  - 「地図」ボタンでフロア地図＋手順表示に切替
//  - AR中に別のQRを読むと、その場所から経路を引き直す
// ============================================================

import { useMemo, useState } from "react";
import { NODES } from "../data/graph";
import { buildSteps, findPath, bearing, type GuideStep } from "../lib/route";
import ARView from "./ARView";
import CompassArrow from "./CompassArrow";
import FloorMap from "./FloorMap";

interface Props {
  fromId: string;
  toId: string;
  /** AR中に別のQRを読んだとき、その場所から案内し直す */
  onRelocate: (newFromId: string) => void;
  onFinish: () => void;
}

const STEP_ICONS: Record<string, string> = {
  start: "📍",
  walk: "🚶",
  bridge: "🌉",
  stair: "🪜",
  arrive: "🎉",
};

/** このステップで矢印が指すべき方位（階段・到着は矢印なし） */
function stepBearing(step: GuideStep): number | undefined {
  if (step.kind === "stair" || step.kind === "arrive") return undefined;
  if (step.bearing !== undefined) return step.bearing;
  const nodes = step.pathIds.map((id) => NODES.get(id)!);
  const a = nodes[0];
  const b = nodes.find((n) => n.x !== a.x || n.y !== a.y);
  return b ? bearing(a, b) : undefined;
}

export default function GuideView({ fromId, toId, onRelocate, onFinish }: Props) {
  const path = useMemo(() => findPath(fromId, toId), [fromId, toId]);
  const steps = useMemo(() => (path ? buildSteps(path) : []), [path]);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<"ar" | "map">("ar");

  if (!path || steps.length === 0) {
    return (
      <div className="card">
        <p>経路が見つかりませんでした。QRコードを読み直してください。</p>
        <button className="btn btn-primary" onClick={() => setMode("ar")}>
          QRを読み取る
        </button>
      </div>
    );
  }

  const step = steps[index];
  const from = NODES.get(fromId);
  const goal = NODES.get(toId);
  const isLast = index === steps.length - 1;

  const stepNav = (
    <div className="guide-nav">
      <button className="btn btn-ghost" disabled={index === 0} onClick={() => setIndex(index - 1)}>
        ← 前へ
      </button>
      {isLast ? (
        <button className="btn btn-primary" onClick={onFinish}>
          案内を終了
        </button>
      ) : (
        <button className="btn btn-primary" onClick={() => setIndex(index + 1)}>
          次へ →
        </button>
      )}
    </div>
  );

  // ---------- ARカメラモード ----------
  if (mode === "ar") {
    return (
      <ARView
        mode="guide"
        arrowBearing={stepBearing(step)}
        qrFacing={from?.qr?.facing}
        onQrDetected={(id) => {
          if (id !== fromId) onRelocate(id); // 別のQR → そこから案内し直す
        }}
        onClose={() => setMode("map")}
        onCameraError={() => setMode("map")}
      >
        <div className="ar-card">
          <div className="ar-card-head">
            <span className="step-no">
              STEP {index + 1} / {steps.length}　→ {goal?.label}
            </span>
            <span className="ar-head-btns">
              <button className="ar-map-btn" onClick={() => setMode("map")}>
                🗺 地図
              </button>
              <button className="ar-map-btn" onClick={onFinish}>
                ✕ 中止
              </button>
            </span>
          </div>
          <p className="step-text">
            {STEP_ICONS[step.kind]} {step.text}
          </p>
          {step.detail && <p className="step-detail">{step.detail}</p>}
          {stepNav}
        </div>
      </ARView>
    );
  }

  // ---------- 地図・手順モード ----------
  const currentId =
    step.pathIds.find((id) => NODES.get(id)?.floor === step.floor) ?? step.pathIds[0];

  return (
    <div className="guide">
      <div className="guide-dest">
        目的地: <strong>{goal?.label}</strong>
      </div>

      <div className={`card step-card step-${step.kind}`}>
        <div className="step-head">
          <span className="step-no">
            STEP {index + 1} / {steps.length}
          </span>
          <span className="step-icon">{STEP_ICONS[step.kind]}</span>
        </div>
        <p className="step-text">{step.text}</p>
        {step.detail && <p className="step-detail">{step.detail}</p>}
        {step.kind === "start" && step.bearing !== undefined && (
          <CompassArrow bearing={step.bearing} qrFacing={from?.qr?.facing} />
        )}
      </div>

      <FloorMap
        floor={step.floor}
        pathIds={path}
        highlightIds={step.pathIds}
        currentId={currentId}
        goalId={toId}
      />

      {stepNav}

      <button className="btn btn-ghost btn-sm rescan" onClick={() => setMode("ar")}>
        📷 ARカメラモードに戻る
      </button>
      <button className="btn btn-ghost btn-sm rescan" onClick={onFinish}>
        ✕ 案内を中止する
      </button>
    </div>
  );
}
