// ============================================================
// 方位センサー
//
// iOS と Android で取得方法が違ううえ、権限の扱いも異なる。
//   iOS 13+  : DeviceOrientationEvent.requestPermission() をユーザー操作起点で呼ぶ必要がある
//              webkitCompassHeading が真北基準の方位をそのまま返す
//   Android  : deviceorientationabsolute の alpha を使う（360 - alpha が方位）
//
// 鉄骨校舎では磁気が乱れるため、この値は「補助」として扱う。
// 取得できない場合でも案内が成立するよう、必ず null を返せるようにしておく。
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";

export type CompassStatus =
  | "idle" // まだ開始していない
  | "granted" // 取得できている
  | "denied" // ユーザーが拒否した
  | "unsupported"; // 端末・ブラウザが対応していない

interface DeviceOrientationEventIOS extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}

interface PermissionRequestable {
  requestPermission?: () => Promise<"granted" | "denied">;
}

export interface CompassState {
  /** 端末が向いている実方位（北=0度）。取れないときは null */
  heading: number | null;
  status: CompassStatus;
  /** センサーの精度（iOSのみ）。負の値は較正が必要 */
  accuracy: number | null;
  /** ユーザー操作の中から呼ぶこと（iOSの権限要求のため） */
  start: () => Promise<void>;
  stop: () => void;
}

export function useCompass(): CompassState {
  const [heading, setHeading] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [status, setStatus] = useState<CompassStatus>("idle");
  const handlerRef = useRef<EventListener | null>(null);
  const eventNameRef = useRef<string>("deviceorientationabsolute");

  const stop = useCallback(() => {
    if (handlerRef.current) {
      window.removeEventListener(eventNameRef.current, handlerRef.current);
      window.removeEventListener("deviceorientation", handlerRef.current);
      handlerRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
      setStatus("unsupported");
      return;
    }

    // iOS 13+ は明示的な許可が要る
    const DOE = window.DeviceOrientationEvent as unknown as PermissionRequestable;
    if (typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res !== "granted") {
          setStatus("denied");
          return;
        }
      } catch {
        // ユーザー操作の外から呼ぶと例外になる
        setStatus("denied");
        return;
      }
    }

    // deviceorientationabsolute は WindowEventMap に無いため Event で受けてキャストする
    const onOrient: EventListener = (e) => {
      const ev = e as DeviceOrientationEventIOS;

      // iOS: 真北基準の方位がそのまま得られる
      if (typeof ev.webkitCompassHeading === "number") {
        setHeading(ev.webkitCompassHeading);
        setAccuracy(ev.webkitCompassAccuracy ?? null);
        setStatus("granted");
        return;
      }

      // Android: absolute な alpha から方位を作る
      if (ev.alpha !== null && ev.alpha !== undefined) {
        // absolute でないイベントは相対値なので信用できないが、
        // 何もないよりはましなので暫定的に使う
        setHeading((360 - ev.alpha) % 360);
        setStatus("granted");
      }
    };

    handlerRef.current = onOrient;

    // absolute（真北基準）が使えるならそちらを優先する
    const hasAbsolute =
      "ondeviceorientationabsolute" in
      (window as unknown as Record<string, unknown>);
    eventNameRef.current = hasAbsolute
      ? "deviceorientationabsolute"
      : "deviceorientation";
    window.addEventListener(eventNameRef.current, onOrient);

    // 一定時間まったくイベントが来なければ非対応とみなす
    window.setTimeout(() => {
      setStatus((s) => (s === "idle" ? "unsupported" : s));
    }, 2500);
  }, []);

  useEffect(() => stop, [stop]);

  return { heading, status, accuracy, start, stop };
}
