// ============================================================
// ARカメラモード
//  - カメラ映像を全画面表示し、その上にオーバーレイを重ねる疑似AR
//  - jsQRが返すQRコードの四隅座標を使い、QRの真上に
//    「教室名＋説明」のラベルを貼り付ける（カメラを向けている間追従）
//  - 案内中は方位センサー連動の矢印を表示（進むべき方向）
//
// mode:
//   "locate" … 現在地確定用（ホーム/目的地選択後のQR読み取り）
//   "guide"  … 道案内中（矢印＋ステップカードを重ねる）
// ============================================================

import { useEffect, useRef, useState, type ReactNode } from "react";
import jsQR from "jsqr";
import { NODES, nodeInfo, parseQrPayload } from "../data/graph";
import { useCompass } from "../lib/compass";

/** QRに貼り付けるラベルの表示情報（画面座標） */
interface Pin {
  x: number;
  y: number;
  label: string;
  info: string;
}

interface Props {
  mode: "locate" | "guide";
  /** 矢印が指す方位（北=0°）。未指定なら矢印非表示 */
  arrowBearing?: number;
  /** センサー未許可時の基準方位（QRを正面に見た向き） */
  qrFacing?: number;
  /** ナビ用QRを認識したとき（ラベルを見せてから約1.2秒後に呼ばれる） */
  onQrDetected: (nodeId: string) => void;
  onClose: () => void;
  /** カメラが使えないとき（親側でフォールバック表示に切り替える用） */
  onCameraError?: () => void;
  /** 画面下部に重ねる内容（ステップカードなど） */
  children?: ReactNode;
}

export default function ARView({
  mode,
  arrowBearing,
  qrFacing,
  onQrDetected,
  onClose,
  onCameraError,
  children,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [pin, setPin] = useState<Pin | null>(null);
  const [cameraError, setCameraError] = useState(false);
  const { heading, status, start } = useCompass();

  // コールバックはrefに逃がし、カメラ初期化effectを再実行させない
  const cbRef = useRef({ onQrDetected, onCameraError });
  cbRef.current = { onQrDetected, onCameraError };

  useEffect(() => {
    let alive = true;
    let stream: MediaStream | null = null;
    let raf = 0;
    let frame = 0;
    let lastSeen = 0;
    const fired = new Set<string>(); // 同じQRで多重発火させない
    const video = videoRef.current!;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    const tick = () => {
      if (!alive) return;
      raf = requestAnimationFrame(tick);
      frame++;
      if (frame % 3 !== 0) return; // 3フレームに1回だけ解析（発熱・負荷対策）
      if (video.readyState !== video.HAVE_ENOUGH_DATA) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

      // 解析用に縮小（640px幅まで）
      const s = Math.min(1, 640 / vw);
      canvas.width = vw * s;
      canvas.height = vh * s;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
      const now = performance.now();

      if (code) {
        const id = parseQrPayload(code.data);
        const node = id ? NODES.get(id) : undefined;
        if (node && id) {
          lastSeen = now;
          // QR上端の中央 → 画面座標へ変換（object-fit: cover のクロップを補正）
          const cw = rootRef.current?.clientWidth ?? 0;
          const ch = rootRef.current?.clientHeight ?? 0;
          const disp = Math.max(cw / vw, ch / vh);
          const offX = (cw - vw * disp) / 2;
          const offY = (ch - vh * disp) / 2;
          const tl = code.location.topLeftCorner;
          const tr = code.location.topRightCorner;
          const px = (((tl.x + tr.x) / 2) / s) * disp + offX;
          const py = (((tl.y + tr.y) / 2) / s) * disp + offY;
          setPin({ x: px, y: py, label: node.label, info: nodeInfo(node) });

          if (!fired.has(id)) {
            fired.add(id);
            navigator.vibrate?.(80);
            // ラベルが貼り付いた演出を見せてから親へ通知
            setTimeout(() => {
              if (alive) cbRef.current.onQrDetected(id);
            }, 1200);
          }
        }
      } else if (now - lastSeen > 1500) {
        setPin(null); // 1.5秒見失ったらラベルを外す
      }
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((st) => {
        if (!alive) {
          st.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = st;
        video.srcObject = st;
        video.play().then(() => tick());
      })
      .catch(() => {
        setCameraError(true);
        cbRef.current.onCameraError?.();
      });

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // 矢印の回転角: 進むべき方位 −（端末の向き or QR基準の向き）
  const base = heading ?? qrFacing ?? 0;
  const rotation =
    arrowBearing !== undefined ? (((arrowBearing - base) % 360) + 360) % 360 : 0;

  if (cameraError) {
    return (
      <div className="ar-root ar-fallback">
        <div className="ar-card">
          <p>
            カメラを起動できませんでした。ブラウザのカメラ許可を確認してください
            （HTTPSでのアクセスが必要です）
          </p>
          <button className="btn btn-primary" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ar-root" ref={rootRef}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video className="ar-video" ref={videoRef} playsInline muted />

      <button className="ar-close" onClick={onClose} aria-label="閉じる">
        ✕
      </button>

      {status !== "active" && (
        <button className="ar-compass-btn" onClick={start}>
          🧭 端末の向きに連動
        </button>
      )}

      {/* QR貼り付きラベル */}
      {pin && (
        <div className="ar-pin" style={{ left: pin.x, top: pin.y }}>
          <strong>{pin.label}</strong>
          <span>{pin.info}</span>
        </div>
      )}

      {/* 進行方向の矢印 */}
      {arrowBearing !== undefined && (
        <div className="ar-arrow" aria-label="進行方向">
          <svg
            viewBox="0 0 120 120"
            style={{ transform: `rotate(${rotation}deg)`, transition: "transform 0.25s ease" }}
          >
            <path
              d="M60 10 L92 78 L60 60 L28 78 Z"
              fill="var(--accent)"
              stroke="#ffffff"
              strokeWidth={5}
              strokeLinejoin="round"
            />
          </svg>
          {status !== "active" && mode === "guide" && (
            <p className="ar-arrow-note">QRを正面に見た向きが基準</p>
          )}
        </div>
      )}

      <div className="ar-bottom">{children}</div>
    </div>
  );
}
