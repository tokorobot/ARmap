// ============================================================
// 端末の方位（北=0°・時計回り）を取得するフック
//  - iOS Safari : DeviceOrientationEvent.requestPermission() が必要
//                 （ユーザー操作から呼ぶこと）。webkitCompassHeading を使う
//  - Android    : deviceorientationabsolute の alpha から算出
// 屋内（鉄骨校舎）では磁気が乱れるため、あくまで補助。
// QRの facing を基準にした固定表示をフォールバックとする。
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";

export type CompassStatus = "idle" | "active" | "denied";

export function useCompass() {
  const [heading, setHeading] = useState<number | null>(null);
  const [status, setStatus] = useState<CompassStatus>("idle");
  const cleanupRef = useRef<(() => void) | null>(null);

  const start = useCallback(async () => {
    // iOS 13+ は明示的な許可が必要
    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    try {
      if (typeof DOE.requestPermission === "function") {
        const res = await DOE.requestPermission();
        if (res !== "granted") {
          setStatus("denied");
          return;
        }
      }
    } catch {
      setStatus("denied");
      return;
    }

    const onEvent = (e: DeviceOrientationEvent) => {
      // iOS: webkitCompassHeading（北=0・時計回り）
      const webkit = (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading;
      if (typeof webkit === "number") {
        setHeading(webkit);
        setStatus("active");
      } else if (e.alpha != null) {
        // Android: alpha は反時計回りなので変換
        setHeading((360 - e.alpha) % 360);
        setStatus("active");
      }
    };
    window.addEventListener("deviceorientationabsolute", onEvent as EventListener);
    window.addEventListener("deviceorientation", onEvent as EventListener);
    cleanupRef.current = () => {
      window.removeEventListener("deviceorientationabsolute", onEvent as EventListener);
      window.removeEventListener("deviceorientation", onEvent as EventListener);
    };
  }, []);

  useEffect(() => () => cleanupRef.current?.(), []);

  return { heading, status, start };
}
