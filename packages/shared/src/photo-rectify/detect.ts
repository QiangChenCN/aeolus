/**
 * 自动四角检测：correct_cards.py::detect_quad 的纯 TS 复刻。
 * 差异仅在底层算子实现（无 OpenCV），判定路径、阈值、顺序与评分保持一致。
 */
import {
  prToGray, prGaussianBlur5, prNormalizeContrast, prCanny, prDilate3,
  prAdaptiveThreshold, prOtsuThreshold, prDownsample,
} from './image';
import {
  prFindContours, prApproxPolyDP, prMergeGapCorner, prIsConvexQuad, prOrderCorners, prQuadMetrics, prSignedArea, prCross,
} from './contours';
import type { PRDetection, PRImage, PRPoint } from './types';

const CANNY_THRESHOLDS: [number, number][] = [[60, 180], [30, 120], [90, 220]];
const EPS_RATIOS = [0.02, 0.035, 0.05];
const RING_PX = 15;
// 降采样分辨率：检测阶段降到 1600 保证实时（4K 全分辨率多档 Canny 要 4 秒）。
// 降采样带来的角点偏差由入口处的原图局部精修补回，二者组合精度≈全分辨率、耗时≈降采样。
const DETECT_MAX_DIM = 1600;

export interface PRDetectOptions {
  minAreaFrac?: number;
  maxAreaFrac?: number;
  maxAngleDev?: number;
  /** 保留兼容字段；现在所有阶段统一收集评分，性能由入口降采样保证。 */
  fast?: boolean;
  /** 检测前把长边缩到该尺寸以内，默认 1600；设更大或 false 可关闭降采样。 */
  detectMaxDim?: number | false;
}

type Candidate = { score: number, quad: PRPoint[], frac: number, dev: number, binary: Uint8Array };

function fail(reason: string): PRDetection {
  return {
    ok: false, corners: null, warn: false, maxDeviation: 0,
    areaFrac: 0, status: 'failed', reason,
  };
}

type FittedLine = { px: number, py: number, dx: number, dy: number };

function fitLine(points: PRPoint[]): FittedLine {
  const n = points.length;
  let mx = 0, my = 0;
  for (const p of points) { mx += p.x; my += p.y; }
  mx /= n; my /= n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of points) {
    const dx = p.x - mx, dy = p.y - my;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  const t = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { px: mx, py: my, dx: Math.cos(t), dy: Math.sin(t) };
}

/** 相邻两边拟合直线求交，得到亚像素角点。边缘不足时保持原 quad。 */
function refineCorners(edges: Uint8Array, width: number, height: number, quad: PRPoint[]): PRPoint[] {
  const lines: FittedLine[] = [];
  for (let k = 0; k < 4; k++) {
    const a = quad[k], b = quad[(k + 1) % 4];
    const ex = b.x - a.x, ey = b.y - a.y;
    const len = Math.hypot(ex, ey) || 1;
    const ux = ex / len, uy = ey / len;
    const band = Math.max(2.5, len * 0.012);
    const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - band - 2));
    const x1 = Math.min(width - 1, Math.ceil(Math.max(a.x, b.x) + band + 2));
    const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - band - 2));
    const y1 = Math.min(height - 1, Math.ceil(Math.max(a.y, b.y) + band + 2));
    const pts: PRPoint[] = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!edges[y * width + x]) continue;
        const t = (x - a.x) * ux + (y - a.y) * uy;
        if (t < -band || t > len + band) continue;
        if (Math.abs((x - a.x) * uy - (y - a.y) * ux) > band) continue;
        pts.push({ x, y });
      }
    }
    lines.push(pts.length >= 5 ? fitLine(pts) : { px: a.x, py: a.y, dx: ux, dy: uy });
  }
  const refined = lines.map((ln, i) => {
    const prev = lines[(i + 3) % 4];
    const den = prCross(prev.dx, prev.dy, ln.dx, ln.dy);
    if (Math.abs(den) < 1e-6) return { x: ln.px, y: ln.py };
    const t = prCross(ln.px - prev.px, ln.py - prev.py, ln.dx, ln.dy) / den;
    return { x: prev.px + prev.dx * t, y: prev.py + prev.dy * t };
  });
  if (refined.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return quad;
  const before = Math.abs(prSignedArea(quad)), after = Math.abs(prSignedArea(refined));
  return after > before * 0.85 && after < before * 1.15 ? refined : quad;
}

/**
 * 原图分辨率的法线梯度精修：Canny/自适应轮廓常贴着证件内侧的纹理边，
 * 比真实明暗边界内缩几像素到几十像素。沿每条边法线做大范围梯度搜索，
 * 用「多数采样点偏移一致」约束把整条边推到真实边界，再求交得角点。
 * 一致性约束避免把边误扩到背景纹理（杂乱处偏移分散，不会被采纳）。
 */
function refineByNormalGradient(gray: Uint8Array, width: number, height: number, quad: PRPoint[]): PRPoint[] {
  const at = (x: number, y: number) => gray[
    Math.min(height - 1, Math.max(0, y | 0)) * width + Math.min(width - 1, Math.max(0, x | 0))
  ];
  const SEARCH = 120, STEP = 3, SAMPLES = 24, GRAD_MIN = 30;
  const lines: FittedLine[] = [];
  for (let k = 0; k < 4; k++) {
    const a = quad[k], b = quad[(k + 1) % 4];
    const ex = b.x - a.x, ey = b.y - a.y, len = Math.hypot(ex, ey) || 1;
    const ux = ex / len, uy = ey / len;
    const nx = uy, ny = -ux; // 外法线
    const offsets: { o: number, g: number }[] = [];
    for (let s = 0; s < SAMPLES; s++) {
      const t = len * (0.08 + 0.84 * s / (SAMPLES - 1));
      const bx = a.x + ux * t, by = a.y + uy * t;
      let best = 0, bo = 0;
      for (let o = -SEARCH; o <= SEARCH; o += STEP) {
        const x = bx + nx * o, y = by + ny * o;
        const g = Math.abs(at(x + nx * STEP, y + ny * STEP) - at(x - nx * STEP, y - ny * STEP));
        if (g > best) { best = g; bo = o; }
      }
      offsets.push({ o: bo, g: best });
    }
    const strong = offsets.filter((v) => v.g >= GRAD_MIN).map((v) => v.o).sort((x, y) => x - y);
    const median = strong.length ? strong[Math.floor(strong.length / 2)] : 0;
    const good = strong.filter((o) => Math.abs(o - median) <= 25);
    const off = good.length ? good.reduce((sum, o) => sum + o, 0) / good.length : 0;
    // 把整条边平移 off，方向仍用原边方向（保持矩形几何）
    let mx = 0, my = 0;
    for (let s = 0; s < SAMPLES; s++) {
      const t = len * (0.08 + 0.84 * s / (SAMPLES - 1));
      mx += a.x + ux * t + nx * off;
      my += a.y + uy * t + ny * off;
    }
    mx /= SAMPLES; my /= SAMPLES;
    lines.push({ px: mx, py: my, dx: ux, dy: uy });
  }
  const refined = lines.map((ln, i) => {
    const prev = lines[(i + 3) % 4];
    const den = prCross(prev.dx, prev.dy, ln.dx, ln.dy);
    if (Math.abs(den) < 1e-6) return { x: ln.px, y: ln.py };
    const t = prCross(ln.px - prev.px, ln.py - prev.py, ln.dx, ln.dy) / den;
    return { x: prev.px + prev.dx * t, y: prev.py + prev.dy * t };
  });
  if (refined.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return quad;
  const before = Math.abs(prSignedArea(quad)), after = Math.abs(prSignedArea(refined));
  // 外扩后面积应更大但不能离谱（防止误扩到背景）；通常增幅 < 60%
  return after > before && after < before * 1.8 ? refined : quad;
}

function pointInConvex(p: PRPoint, poly: PRPoint[]): boolean {
  const sign = prSignedArea(poly) >= 0 ? 1 : -1;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (prCross(b.x - a.x, b.y - a.y, p.x - a.x, p.y - a.y) * sign < 0) return false;
  }
  return true;
}

/** 对应 Python _is_background：整图边界 + 内外灰度差过滤。 */
function isBackground(gray: Uint8Array, width: number, height: number, quad: PRPoint[], areaFrac: number, maxAreaFrac: number): boolean {
  if (areaFrac > maxAreaFrac) return true;
  const xs = quad.map((p) => p.x), ys = quad.map((p) => p.y);
  // 贴边伪矩形：角点落在画面边界上（或 1% 内）时，通常是桌面/背景的一条边与证件边缘
  // 连成的巨大连通域，而不是证件本身。真实证件照四周必然能看到一点背景。
  const mx = width * 0.01, my = height * 0.01;
  if (Math.min(...xs) <= mx || Math.max(...xs) >= width - mx ||
      Math.min(...ys) <= my || Math.max(...ys) >= height - my) return true;
  const x = Math.floor(Math.min(...xs)), y = Math.floor(Math.min(...ys));
  const x1 = Math.ceil(Math.max(...xs)), y1 = Math.ceil(Math.max(...ys));
  const bx0 = Math.max(0, x - RING_PX), by0 = Math.max(0, y - RING_PX);
  const bx1 = Math.min(width, x1 + RING_PX), by1 = Math.min(height, y1 + RING_PX);
  let innerSum = 0, innerN = 0, ringSum = 0, ringN = 0;
  for (let py = by0; py < by1; py++) {
    for (let px = bx0; px < bx1; px++) {
      const v = gray[py * width + px];
      if (pointInConvex({ x: px, y: py }, quad)) { innerSum += v; innerN++; }
      else { ringSum += v; ringN++; }
    }
  }
  if (innerN > 100 && ringN > 100) {
    return Math.abs(innerSum / innerN - ringSum / ringN) < 2.5;
  }
  return false;
}

function detectCore(img: PRImage, options: PRDetectOptions = {}): PRDetection {
  const minAreaFrac = options.minAreaFrac ?? 0.08;
  const maxAreaFrac = options.maxAreaFrac ?? 0.97;
  const maxAngleDev = options.maxAngleDev ?? 30;
  const { width, height } = img;
  if (width < 40 || height < 40) return fail('图片尺寸过小');
  const gray = prToGray(img);
  const blur = prGaussianBlur5(gray, width, height);
  const imgArea = width * height;
  const candidates: Candidate[] = [];

  const collect = (binary: Uint8Array) => {
    const contours = prFindContours(binary, width, height, minAreaFrac * imgArea);
    for (const c of contours.slice(0, 8)) {
      if (c.area < minAreaFrac * imgArea) continue;
      for (const ratio of EPS_RATIOS) {
        const approx = prApproxPolyDP(c.points, ratio * c.perimeter);
        // 圆角/低对比度边缘会让 Canny 在拐角处断裂，近似出 5 点（真实四边 + 缺口短边）。
        // 必须先把缺口两端的短边合并、用相邻长边求交补回角点，否则只能靠放大 eps
        // 把缺口内侧点当成角点，框会向内缩一截（左上角最明显）。
        const quad4 = prMergeGapCorner(approx);
        if (quad4.length !== 4 || !prIsConvexQuad(quad4)) continue;
        const quad = prOrderCorners(quad4);
        const { area, dev } = prQuadMetrics(quad);
        const frac = area / imgArea;
        candidates.push({ score: frac * Math.max(0, 1 - dev / 60), quad, frac, dev, binary });
        break;
      }
    }
  };

  // 每档收集后检查是否已有"强候选"：面积占比大且角偏差小（score 高）。
  // 旧实现只看 dev<=30 + 非背景就停，高分辨率照片上 Canny 会先给出一个
  // 左下角被木纹粘连带偏、但 dev 仍 <30 的伪四边形（score≈0.27），挡住了
  // 后面 Otsu 的真正正确候选（score≈0.34）。改用 score 阈值：弱候选继续下一档，
  // 强候选才提前收敛，兼顾精度与实时性。
  const strongEnough = () => candidates.some((c) =>
    c.score >= 0.30 && !isBackground(gray, width, height, c.quad, c.frac, maxAreaFrac));

  for (const [lo, hi] of CANNY_THRESHOLDS) {
    collect(prDilate3(prCanny(blur, width, height, lo, hi), width, height));
    if (strongEnough()) break;
  }
  // Python 脚本没有这一步：白证件放在浅色桌面时三档 Canny 与自适应阈值都会失效。
  if (!strongEnough()) {
    const stretched = prNormalizeContrast(blur);
    for (const [lo, hi] of CANNY_THRESHOLDS) {
      collect(prDilate3(prCanny(stretched, width, height, lo, hi), width, height));
      if (strongEnough()) break;
    }
  }
  if (!strongEnough()) {
    const adaptive = prAdaptiveThreshold(blur, width, height);
    const invA = new Uint8Array(adaptive.length);
    for (let i = 0; i < adaptive.length; i++) invA[i] = adaptive[i] ? 0 : 1;
    collect(invA);
    collect(adaptive);
  }
  if (!strongEnough()) {
    const t = prOtsuThreshold(blur);
    const bw = new Uint8Array(blur.length);
    for (let i = 0; i < blur.length; i++) bw[i] = blur[i] > t ? 1 : 0;
    const invO = new Uint8Array(bw.length);
    for (let i = 0; i < bw.length; i++) invO[i] = bw[i] ? 0 : 1;
    collect(invO);
    collect(bw);
  }

  const backgroundFree = candidates.filter((c) => !isBackground(gray, width, height, c.quad, c.frac, maxAreaFrac));
  if (!backgroundFree.length) return fail('未找到符合要求的四边形，请手动定位四角');
  // 先按角度门槛筛掉不像矩形的候选，再按面积×角度评分取最高。
  // 旧实现「先取最高分再查角度」会在所有候选偏差都 >60°（score=0）时挑到最差的一个。
  const usable = backgroundFree.filter((c) => c.dev <= maxAngleDev);
  if (!usable.length) {
    const worst = backgroundFree.reduce((a, b) => (b.dev > a.dev ? b : a));
    return {
      ...fail(`检出的形状偏离矩形过多（最大角偏差 ${worst.dev.toFixed(1)}°，面积占比 ${(worst.frac * 100).toFixed(1)}%，四角 ${worst.quad.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(' ')}）`),
      areaFrac: worst.frac,
      maxDeviation: worst.dev,
    };
  }
  const best = usable.reduce((a, b) => (b.score > a.score ? b : a));
  const corners = refineCorners(best.binary, width, height, best.quad);
  const metrics = prQuadMetrics(corners);
  const dev = metrics.dev;
  const areaFrac = metrics.area / imgArea;
  if (dev > maxAngleDev) {
    return {
      ...fail(`细化后形状偏离矩形过多（最大角偏差 ${dev.toFixed(1)}°，面积占比 ${(areaFrac * 100).toFixed(1)}%，四角 ${corners.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(' ')}）`),
      areaFrac,
      maxDeviation: dev,
    };
  }
  return {
    ok: true,
    corners,
    warn: dev > 15,
    maxDeviation: dev,
    areaFrac,
    status: dev > 15 ? 'warn' : 'ok',
    reason: 'ok',
  };
}

/**
 * 自动四角检测入口。大图先降采样再检测，角点按比例映射回原图坐标。
 * 面积占比与角度在图缩放后不变，可直接沿用；矫正始终用原图保证清晰度。
 */
export function prDetectQuad(img: PRImage, options: PRDetectOptions = {}): PRDetection {
  const maxDim = options.detectMaxDim === undefined ? DETECT_MAX_DIM : options.detectMaxDim;
  if (maxDim === false || maxDim <= 0) return detectCore(img, options);
  const { img: small, scale } = prDownsample(img, maxDim);
  const result = detectCore(small, options);
  if (result.corners) {
    // 先把角点映射回原图坐标系
    result.corners = result.corners.map((p) => ({ x: p.x / scale, y: p.y / scale }));
    // 再用原图分辨率做边缘精修：Canny/自适应轮廓常贴着证件内侧纹理边，
    // 真实明暗边界在其外侧几像素到几十像素。沿法线搜索最强梯度把每条边推到
    // 真实边界，解决"框比证件小一圈/没贴边"。实测两张 4K 原图左边分别外扩
    // 约 56px / 12px，与颜色剖面测得的真实边界吻合。
    const grayFull = prToGray(img);
    const refined = refineByNormalGradient(grayFull, img.width, img.height, result.corners);
    const m = prQuadMetrics(refined);
    if (m.dev <= (options.maxAngleDev ?? 30)) {
      result.corners = refined;
      result.maxDeviation = m.dev;
      result.areaFrac = m.area / (img.width * img.height);
      result.warn = m.dev > 15;
      result.status = m.dev > 15 ? 'warn' : 'ok';
    }
  }
  return result;
}
