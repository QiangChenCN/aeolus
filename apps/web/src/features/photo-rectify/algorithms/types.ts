/** 照片矫正三模块共享的最小类型定义（无第三方依赖，纯数据）。 */
export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface RgbaImage extends Size {
  data: Uint8ClampedArray | Uint8Array;
}

export interface DetectionResult {
  ok: boolean;
  /** 四角顺序恒为 左上 → 右上 → 右下 → 左下；失败时为 null。 */
  corners: Point[] | null;
  /** 最大内角偏差 > 15° 时为 true，提示用户复核或手动调整。 */
  warn: boolean;
  maxDeviation: number;
  score: number;
  reason: string;
}

export interface RectifyOutput extends Size {
  data: Uint8ClampedArray;
}
