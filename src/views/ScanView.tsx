// ============================================================
// QRスキャン画面（現在地の確定）
//
// カメラが使えない端末のために、手で現在地を選ぶ導線も残しておく。
// ============================================================

import { useState } from "react";
import { qrNodes } from "../data/campus";
import CameraCanvas from "../components/CameraCanvas";

interface Props {
  onDetected: (nodeId: string) => void;
  onClose: () => void;
  /** 目的地を選んだ状態で来た場合に表示する */
  pendingLabel?: string | null;
}

export default function ScanView({ onDetected, onClose, pendingLabel }: Props) {
  const [cameraError, setCameraError] = useState<string | null>(null);

  if (cameraError) {
    return (
      <>
        <div className="notice">
          {cameraError}。
          <br />
          お手数ですが、いま立っている場所を下から選んでください。
        </div>
        <div className="card">
          <h2>現在地を選ぶ</h2>
          <div className="dest-list">
            {qrNodes().map((n) => (
              <button
                key={n.id}
                className="btn"
                onClick={() => onDetected(n.id)}
              >
                <span className="dest-name">{n.label}</span>
              </button>
            ))}
          </div>
        </div>
        <button className="btn btn-primary" onClick={onClose}>
          ホームへ戻る
        </button>
      </>
    );
  }

  return (
    <CameraCanvas
      onQrDetected={onDetected}
      onCameraError={(msg) => setCameraError(msg)}
    >
      <div className="ar-top">
        <button className="ar-close" onClick={onClose} aria-label="閉じる">
          ×
        </button>
      </div>

      <div className="ar-card">
        <p className="step-text">QRコードにカメラをかざしてください</p>
        <p className="step-detail">
          {pendingLabel
            ? `「${pendingLabel}」への案内を開始します。`
            : "校内に掲示されたQRコードを読み取ると、現在地が確定します。"}
        </p>
      </div>
    </CameraCanvas>
  );
}
