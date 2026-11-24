/**
 * 透视矫正：correct_cards.py::correct 的纯 TS 复刻。
 * 单应矩阵用 8 元线性方程组 + 高斯消元；采样支持双线性与双三次（Catmull-Rom）。
 */
import type { PRImage, PRPoint, PRRectifyOptions, PRRectifyResult } from './types';

export const PR_OUTPUT_WIDTH = 1024;
export const PR_OUTPUT_HEIGHT = 645;
export const PR_IDCARD_RATIO = 85.6 / 54;

export function prInsetCorners(corners: PRPoint[], pixels = 6): PRPoint[] {
  if (pixels <= 0) return corners.map((p) => ({ x: p.x, y: p.y }));
  const cx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4;
  const cy = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4;
  return corners.map((p) => {
    const dx = cx - p.x, dy = cy - p.y;
    const len = Math.hypot(dx, dy);
    return len < 1e-9 ? { x: p.x, y: p.y } : { x: p.x + dx / len * pixels, y: p.y + dy / len * pixels };
  });
}

export function prPerspectiveMatrix(src: PRPoint[], dst: PRPoint[]): number[] {
  if (src.length !== 4 || dst.length !== 4) throw new Error('透视变换需要 4 组对应点');
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], u = dst[i].x, v = dst[i].y;
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-12) throw new Error('角点退化，无法求解透视变换');
    if (pivot !== col) { const t = a[pivot]; a[pivot] = a[col]; a[col] = t; }
    for (let r = col + 1; r < 8; r++) {
      const f = a[r][col] / a[col][col];
      if (!f) continue;
      for (let c = col; c <= 8; c++) a[r][c] -= f * a[col][c];
    }
  }
  const h = new Array<number>(9).fill(0);
  h[8] = 1;
  for (let r = 7; r >= 0; r--) {
    let s = a[r][8];
    for (let c = r + 1; c < 8; c++) s -= a[r][c] * h[c];
    h[r] = s / a[r][r];
  }
  return h;
}

export function prInvert3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = c * h - b * i, C = b * f - c * e;
  const D = f * g - d * i, E = a * i - c * g, F = c * d - a * f;
  const G = d * h - e * g, H = b * g - a * h, I = a * e - b * d;
  const det = a * A + b * D + c * G;
  if (Math.abs(det) < 1e-12) throw new Error('单应矩阵不可逆');
  return [A / det, B / det, C / det, D / det, E / det, F / det, G / det, H / det, I / det];
}

export function prProjectPoints(h: number[], points: PRPoint[]): PRPoint[] {
  return points.map(({ x, y }) => {
    const w = h[6] * x + h[7] * y + h[8];
    return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w };
  });
}

export function prOutputCorners(width: number, height: number): PRPoint[] {
  return [{ x: 0, y: 0 }, { x: width - 1, y: 0 }, { x: width - 1, y: height - 1 }, { x: 0, y: height - 1 }];
}

function cubic(p0: number, p1: number, p2: number, p3: number, t: number): number {
  // Catmull-Rom
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
}

function sample(data: Uint8ClampedArray | Uint8Array, w: number, h: number, x: number, y: number, channel: number, bicubic: boolean): number {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
  const sx = x < 0 ? 0 : (x > w - 1 ? w - 1 : x);
  const sy = y < 0 ? 0 : (y > h - 1 ? h - 1 : y);
  if (!bicubic) {
    const x0 = Math.floor(sx), y0 = Math.floor(sy);
    const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
    const fx = sx - x0, fy = sy - y0;
    const a = data[(y0 * w + x0) * 4 + channel], b = data[(y0 * w + x1) * 4 + channel];
    const c = data[(y1 * w + x0) * 4 + channel], d = data[(y1 * w + x1) * 4 + channel];
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
  }
  const x1 = Math.floor(sx), y1 = Math.floor(sy);
  const tx = sx - x1, ty = sy - y1;
  const xs = [-1, 0, 1, 2].map((k) => Math.max(0, Math.min(w - 1, x1 + k)));
  const ys = [-1, 0, 1, 2].map((k) => Math.max(0, Math.min(h - 1, y1 + k)));
  const rows: number[] = [];
  for (const yy of ys) {
    const v0 = cubic(data[(yy * w + xs[0]) * 4 + channel], data[(yy * w + xs[1]) * 4 + channel],
      data[(yy * w + xs[2]) * 4 + channel], data[(yy * w + xs[3]) * 4 + channel], tx);
    rows.push(v0);
  }
  return cubic(rows[0], rows[1], rows[2], rows[3], ty);
}

/** 输出 RGBA 数据可直接构造 ImageData；默认 1024×645，双线性采样。 */
export function prRectify(img: PRImage, corners: PRPoint[], options: PRRectifyOptions = {}): PRRectifyResult {
  const w = options.outWidth ?? PR_OUTPUT_WIDTH;
  const h = options.height ?? (options.ratio ? Math.round(w / options.ratio) : PR_OUTPUT_HEIGHT);
  const bicubic = options.interpolation === 'bicubic';
  const q = prInsetCorners(corners, options.inset ?? 6);
  const matrix = prPerspectiveMatrix(q, prOutputCorners(w, h));
  const inv = prInvert3(matrix);
  const [a, b, c, d, e, f, g, hh, i] = inv;
  const data = new Uint8ClampedArray(w * h * 4);
  let o = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const den = g * x + hh * y + i;
      const px = Math.abs(den) < 1e-12 ? NaN : (a * x + b * y + c) / den;
      const py = Math.abs(den) < 1e-12 ? NaN : (d * x + e * y + f) / den;
      for (let k = 0; k < 4; k++) data[o + k] = sample(img.data, img.width, img.height, px, py, k, bicubic);
      if (Number.isNaN(px)) data[o + 3] = 255;
      o += 4;
    }
  }
  return { width: w, height: h, data };
}
