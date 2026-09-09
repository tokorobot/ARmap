// ============================================================
// 図面座標から方位・距離を計算する
//
// 実方位は「北=0度、東=90度、時計回り」で統一する。
// 図面座標は x=図面の右, y=図面の下（メートル）。
//
// 図面の上方向が実際に向いている方位を planUpBearing として持ち、
// 図面上の角度に足すことで実方位に変換する。
//   延岡工業高校の場合: 方位記号が右上45度を指す → planUpBearing = 315（北西）
// ============================================================

export interface Point {
  x: number;
  y: number;
}

/** 0〜359 に正規化する */
export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * 2つの角度の差を -180〜180 で返す。
 * 正なら b は a より時計回り（右）側。
 */
export function angleDiff(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}

/**
 * 図面上での角度（図面の上を0度とし、時計回り）。
 * y が下向きなので -dy を使う。
 */
export function planAngle(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return normalizeDeg((Math.atan2(dx, -dy) * 180) / Math.PI);
}

/** a から b へ進むときの実方位（北=0度） */
export function bearingOf(a: Point, b: Point, planUpBearing: number): number {
  return normalizeDeg(planAngle(a, b) + planUpBearing);
}

/** 水平距離（メートル） */
export function distanceOf(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * 実測方位を建物の主軸4方向へスナップする。
 * 校舎は直交グリッドなので、廊下の向きは主軸から 0/90/180/270 のいずれか。
 * 45度の許容幅があるため、磁気が多少乱れても誤判定しにくい。
 *
 * deviation（スナップ前後の差）は、そのまま方位センサーの誤差データになる。
 */
export function snapToAxis(
  measured: number,
  axisBearing: number,
): { snapped: number; deviation: number } {
  const candidates = [0, 90, 180, 270].map((d) => normalizeDeg(axisBearing + d));
  let best = candidates[0];
  let minDiff = 360;
  for (const c of candidates) {
    const diff = Math.abs(angleDiff(c, measured));
    if (diff < minDiff) {
      minDiff = diff;
      best = c;
    }
  }
  return { snapped: best, deviation: minDiff };
}

/**
 * 角度の中央値。
 * 方位は円環データなので単純平均は使えない（359度と1度の平均が180度になってしまう）。
 * 先頭の値を基準に ±180 へ正規化してから中央値を取る。
 */
export function circularMedian(degrees: number[]): number {
  if (degrees.length === 0) return 0;
  const base = degrees[0];
  const norm = degrees.map((d) => angleDiff(base, d)).sort((a, b) => a - b);
  const mid =
    norm.length % 2 === 1
      ? norm[(norm.length - 1) / 2]
      : (norm[norm.length / 2 - 1] + norm[norm.length / 2]) / 2;
  return normalizeDeg(base + mid);
}

/** 標準偏差（センサー誤差の評価に使う） */
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

const COMPASS_LABELS = [
  "北",
  "北東",
  "東",
  "南東",
  "南",
  "南西",
  "西",
  "北西",
] as const;

/** 方位角を「北東」などの日本語ラベルにする */
export function compassLabel(bearing: number): string {
  const i = Math.round(normalizeDeg(bearing) / 45) % 8;
  return COMPASS_LABELS[i];
}

/**
 * 前の区間の方位と次の区間の方位から、曲がる方向の案内文を作る。
 * 20度未満は直進とみなす（廊下のわずかな振れを「曲がる」と言わないため）。
 */
export function turnInstruction(prev: number, next: number): string {
  const diff = angleDiff(prev, next);
  if (Math.abs(diff) < 20) return "そのまま直進";
  if (diff >= 20 && diff < 160) return "右に曲がる";
  if (diff <= -20 && diff > -160) return "左に曲がる";
  return "後ろに戻る";
}

/** 「右手」「左手」の判定。到着時の案内に使う */
export function sideOf(prev: number, target: number): "右手" | "左手" | "正面" {
  const diff = angleDiff(prev, target);
  if (Math.abs(diff) < 30) return "正面";
  return diff > 0 ? "右手" : "左手";
}

/** 歩行の所要秒数。分速80m（不慣れな場所なので遅めに見積もる） */
export function walkSeconds(meters: number): number {
  return Math.round((meters / 80) * 60);
}

/** 距離の表示文字列 */
export function formatDistance(meters: number): string {
  if (meters < 10) return `約${Math.round(meters)}m`;
  return `約${Math.round(meters / 5) * 5}m`;
}
