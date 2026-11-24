/** 照片矫正共享算法的最小数据类型（纯数据，无 DOM / Node 依赖）。 */
export interface PRPoint {
  x: number;
  y: number;
}

export interface PRSize {
  width: number;
  height: number;
}

export interface PRImage extends PRSize {
  /** RGBA 像素，长度 = width * height * 4。 */
  data: Uint8ClampedArray | Uint8Array;
}

export interface PRDetection {
  ok: boolean;
  /** 左上、右上、右下、左下；失败为 null。 */
  corners: PRPoint[] | null;
  warn: boolean;
  maxDeviation: number;
  areaFrac: number;
  status: 'ok' | 'warn' | 'failed';
  reason: string;
}

export interface PRRectifyOptions {
  inset?: number;
  outWidth?: number;
  height?: number;
  ratio?: number;
  interpolation?: 'bilinear' | 'bicubic';
}

export interface PRRectifyResult extends PRSize {
  data: Uint8ClampedArray;
}
