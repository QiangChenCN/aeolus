/**
 * 照片矫正底层算子（纯 TS 复刻 correct_cards.py 依赖的 OpenCV 行为）。
 * 输入统一为 RGBA 像素数组；不依赖 DOM / Node，可在浏览器 Worker 与 NestJS 中复用。
 */
import type { PRImage } from './types';

/**
 * 盒式降采样：把大图缩到 maxDim 以内用于检测。
 * 纯 TS 算法在 4K 图上逐像素跑多档 Canny/轮廓会到 4 秒，phone 照片先缩到 1600
 * 再检测可降到约 0.6 秒；角点按比例映射回原图后矫正仍用原图，精度不变。
 * 返回 scale = 新坐标 / 原坐标，调用方用它把角点映射回原图。
 */
export function prDownsample(img: PRImage, maxDim: number): { img: PRImage, scale: number } {
  const longest = Math.max(img.width, img.height);
  const scale = Math.min(1, maxDim / longest);
  if (scale >= 1) return { img, scale: 1 };
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y / scale), y1 = Math.min(img.height, Math.ceil((y + 1) / scale));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x / scale), x1 = Math.min(img.width, Math.ceil((x + 1) / scale));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * img.width + xx) * 4;
          r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; a += img.data[i + 3]; n++;
        }
      }
      const o = (y * w + x) * 4;
      data[o] = r / n; data[o + 1] = g / n; data[o + 2] = b / n; data[o + 3] = a / n;
    }
  }
  return { img: { width: w, height: h, data }, scale };
}

export function prToGray(img: PRImage): Uint8Array {
  const { data, width, height } = img;
  const out = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
  }
  return out;
}

/** OpenCV GaussianBlur(5,5) 的可分离实现：[1,4,6,4,1]/16 两次卷积。 */
export function prGaussianBlur5(gray: Uint8Array, width: number, height: number): Uint8Array {
  const tmp = new Uint8Array(gray.length);
  const out = new Uint8Array(gray.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const a = gray[row + (x < 2 ? 0 : x - 2)];
      const b = gray[row + (x < 1 ? 0 : x - 1)];
      const c = gray[row + x];
      const d = gray[row + (x > width - 2 ? width - 1 : x + 1)];
      const e = gray[row + (x > width - 3 ? width - 1 : x + 2)];
      tmp[row + x] = (a + 4 * b + 6 * c + 4 * d + e) >> 4;
    }
  }
  for (let y = 0; y < height; y++) {
    const u2 = (y < 2 ? 0 : y - 2) * width;
    const u1 = (y < 1 ? 0 : y - 1) * width;
    const m = y * width;
    const d1 = (y > height - 2 ? height - 1 : y + 1) * width;
    const d2 = (y > height - 3 ? height - 1 : y + 2) * width;
    for (let x = 0; x < width; x++) {
      out[m + x] = (tmp[u2 + x] + 4 * tmp[u1 + x] + 6 * tmp[m + x] + 4 * tmp[d1 + x] + tmp[d2 + x]) >> 4;
    }
  }
  return out;
}

/** 5%~95% 分位灰度拉伸：低对比度照片兜底，让固定 Canny 阈值仍可用。 */
export function prNormalizeContrast(gray: Uint8Array, histogram?: Uint32Array): Uint8Array {
  const hist = histogram || new Uint32Array(256);
  if (!histogram) for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.05) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.05) { hi = v; break; } }
  if (hi - lo < 8) return gray;
  const scale = 255 / (hi - lo);
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    const v = (gray[i] - lo) * scale;
    out[i] = v < 0 ? 0 : (v > 255 ? 255 : v);
  }
  return out;
}

/** Canny：Sobel → 梯度方向插值非极大值抑制 → 双阈值滞回。 */
export function prCanny(gray: Uint8Array, width: number, height: number, low: number, high: number): Uint8Array {
  const n = width * height;
  const mag = new Float32Array(n);
  const ax = new Float32Array(n);
  const ay = new Float32Array(n);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const tl = gray[i - width - 1], tc = gray[i - width], tr = gray[i - width + 1];
      const ml = gray[i - 1], mr = gray[i + 1];
      const bl = gray[i + width - 1], bc = gray[i + width], br = gray[i + width + 1];
      const gx = tr + 2 * mr + br - tl - 2 * ml - bl;
      const gy = bl + 2 * bc + br - tl - 2 * tc - tr;
      ax[i] = gx; ay[i] = gy;
      mag[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  const nms = new Uint8Array(n);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const m = mag[i];
      if (m === 0) continue;
      const gx = ax[i], gy = ay[i];
      const hx = gx < 0 ? -gx : gx;
      const hy = gy < 0 ? -gy : gy;
      const sx = gx > 0 ? 1 : -1, sy = gy > 0 ? 1 : -1;
      let neighbor: number;
      if (hy >= hx) {
        const w = hx / (hy + 1e-9);
        neighbor = mag[i + sy * width] * (1 - w) + mag[i + sy * width + sx] * w;
      } else {
        const w = hy / (hx + 1e-9);
        neighbor = mag[i + sx] * (1 - w) + mag[i + sx + sy * width] * w;
      }
      if (m >= neighbor) nms[i] = 1;
    }
  }
  const out = new Uint8Array(n);
  const stack = new Int32Array(n);
  let sp = 0;
  for (let i = 0; i < n; i++) if (nms[i] && mag[i] >= high) { out[i] = 1; stack[sp++] = i; }
  while (sp > 0) {
    const i = stack[--sp];
    const x = i % width, y = (i / width) | 0;
    const x0 = x > 0 ? x - 1 : 0, x1 = x < width - 1 ? x + 1 : width - 1;
    const y0 = y > 0 ? y - 1 : 0, y1 = y < height - 1 ? y + 1 : height - 1;
    for (let ny = y0; ny <= y1; ny++) {
      for (let nx = x0; nx <= x1; nx++) {
        const j = ny * width + nx;
        if (!out[j] && nms[j] && mag[j] >= low) { out[j] = 1; stack[sp++] = j; }
      }
    }
  }
  return out;
}

/** 3×3 膨胀（对应 cv2.dilate 3×3 ones）。 */
export function prDilate3(binary: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(binary.length);
  for (let y = 0; y < height; y++) {
    const y0 = y > 0 ? y - 1 : 0, y1 = y < height - 1 ? y + 1 : height - 1;
    for (let x = 0; x < width; x++) {
      const x0 = x > 0 ? x - 1 : 0, x1 = x < width - 1 ? x + 1 : width - 1;
      let v = 0;
      for (let ny = y0; ny <= y1 && !v; ny++) {
        for (let nx = x0; nx <= x1; nx++) if (binary[ny * width + nx]) { v = 1; break; }
      }
      out[y * width + x] = v;
    }
  }
  return out;
}

/**
 * cv2.adaptiveThreshold(ADAPTIVE_THRESH_GAUSSIAN_C, block=51, C=10) 的等价近似：
 * 用积分图求窗口均值（盒式窗口代替高斯权重），再减 C。复杂度 O(n)。
 */
export function prAdaptiveThreshold(gray: Uint8Array, width: number, height: number, block = 51, c = 10): Uint8Array {
  const half = (block - 1) >> 1;
  const iw = width + 1;
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x];
      integral[(y + 1) * iw + x + 1] = integral[y * iw + x + 1] + rowSum;
    }
  }
  const out = new Uint8Array(gray.length);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half), y1 = Math.min(height - 1, y + half);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half), x1 = Math.min(width - 1, x + half);
      const sum = integral[(y1 + 1) * iw + x1 + 1] - integral[y0 * iw + x1 + 1]
        - integral[(y1 + 1) * iw + x0] + integral[y0 * iw + x0];
      const mean = sum / ((y1 - y0 + 1) * (x1 - x0 + 1));
      out[y * width + x] = gray[y * width + x] > mean - c ? 1 : 0;
    }
  }
  return out;
}

/** Otsu 全局阈值（cv2.THRESH_BINARY + THRESH_OTSU）。 */
export function prOtsuThreshold(gray: Uint8Array): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];
  let wB = 0, sumB = 0, best = 0, threshold = 0;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}
