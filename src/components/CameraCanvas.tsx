// ============================================================
// カメラ映像の全画面表示とQRコードの検出
//
// 疑似ARの土台。カメラ映像を背景に敷き、その上にオーバーレイ（矢印・カード）を重ねる。
// 空間に固定するAR（WebXR）は iPhone Safari が非対応のため使わない。
//
// jsQR は毎フレーム走らせると発熱するので、3フレームに1回・640px幅に縮小して解析する。
// ============================================================

import { useEffect, useRef, useState, type ReactNode } from "react";
import jsQR from "jsqr";
import { NODES, parseQrPayload } from "../data/campus";

/** QRの上に貼り付けるラベルの表示情報（画面座標） */
export interface QrPin {
  x: number;
  y: number;
  label: string;
}

interface Props {
  /** QRを認識したとき。同じQRでは一度しか呼ばれない */
  onQrDetected?: (nodeId: string) => void;
  /** カメラが使えないとき。呼び出し側でフォールバック表示に切り替える */
  onCameraError?: (message: string) => void;
  /** 認識したQRの上にラベルを出すか */
  showPin?: boolean;
  /** 映像の上に重ねる内容 */
  children?: ReactNode;
}

export default function CameraCanvas({
  onQrDetected,
  onCameraError,
  showPin = true,
  children,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [pin, setPin] = useState<QrPin | null>(null);
  const [ready, setReady] = useState(false);

  // コールバックは ref に逃がし、カメラ初期化の effect を再実行させない
  const cbRef = useRef({ onQrDetected, onCameraError });
  cbRef.current = { onQrDetected, onCameraError };

  useEffect(() => {
    let alive = true;
    let stream: MediaStream | null = null;
    let raf = 0;
    let frame = 0;
    let lastSeen = 0;
    const fired = new Set<string>(); // 同じQRで多重発火させない
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const tick = () => {
      if (!alive) return;
      raf = requestAnimationFrame(tick);
      frame++;
      if (frame % 3 !== 0) return; // 発熱・負荷対策
      if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

      // 解析用に縮小（横640pxまで）
      const s = Math.min(1, 640 / vw);
      canvas.width = vw * s;
      canvas.height = vh * s;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, img.width, img.height, {
        inversionAttempts: "dontInvert",
      });
      const now = performance.now();

      if (code) {
        const id = parseQrPayload(code.data);
        const node = id ? NODES.get(id) : undefined;
        if (node && id) {
          lastSeen = now;

          if (showPin) {
            // QR上端の中央を画面座標へ（object-fit: cover のクロップを補正）
            const cw = rootRef.current?.clientWidth ?? 0;
            const ch = rootRef.current?.clientHeight ?? 0;
            const disp = Math.max(cw / vw, ch / vh);
            const offX = (cw - vw * disp) / 2;
            const offY = (ch - vh * disp) / 2;
            const tl = code.location.topLeftCorner;
            const tr = code.location.topRightCorner;
            const px = ((tl.x + tr.x) / 2 / s) * disp + offX;
            const py = ((tl.y + tr.y) / 2 / s) * disp + offY;
            setPin({ x: px, y: py, label: node.label });
          }

          if (!fired.has(id)) {
            fired.add(id);
            navigator.vibrate?.(80);
            // ラベルが出た演出を見せてから通知する
            window.setTimeout(() => {
              if (alive) cbRef.current.onQrDetected?.(id);
            }, 900);
          }
        }
      } else if (now - lastSeen > 1500) {
        setPin(null); // 1.5秒見失ったらラベルを外す
      }
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        setReady(true);
        raf = requestAnimationFrame(tick);
      } catch (err) {
        const msg =
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "カメラの使用が許可されていません"
            : "カメラを利用できません";
        cbRef.current.onCameraError?.(msg);
      }
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };
  }, [showPin]);

  return (
    <div className="cam" ref={rootRef}>
      <video ref={videoRef} className="cam-video" playsInline muted />
      {!ready && <div className="cam-loading">カメラを起動しています…</div>}
      {pin && (
        <div
          className="cam-pin"
          style={{ left: pin.x, top: pin.y }}
          aria-hidden="true"
        >
          {pin.label}
        </div>
      )}
      <div className="cam-overlay">{children}</div>
    </div>
  );
}
