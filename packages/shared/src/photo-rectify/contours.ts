/**
 * 轮廓工具：8 邻域连通域 + Moore 外轮廓追踪（对应 cv2.findContours RETR_EXTERNAL）
 * + CHAIN_APPROX_SIMPLE + approxPolyDP + 凸四边形判定。
 */
import type { PRPoint } from './types';

const DIRS: [number, number][] = [
  [-1, 0], [-1, -1], [0, -1], [1, -1],
  [1, 0], [1, 1], [0, 1], [-1, 1],
];

export interface PRContour {
  points: PRPoint[];
  pixelCount: number;
  area: number;
  perimeter: number;
}

export function prCross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

export function prSignedArea(poly: PRPoint[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function prPerimeter(poly: PRPoint[]): number {
  let p = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    p += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return p;
}

/** 删除共线中间点（cv2.CHAIN_APPROX_SIMPLE），保留拐角。 */
function simplifyChain(points: PRPoint[]): PRPoint[] {
  if (points.length <= 2) return points;
  const out: PRPoint[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[(i - 1 + n) % n], b = points[i], c = points[(i + 1) % n];
    if (Math.abs(prCross(b.x - a.x, b.y - a.y, c.x - b.x, c.y - b.y)) > 1e-6) out.push(b);
  }
  return out.length >= 3 ? out : points;
}

/**
 * 提取二值图中所有外轮廓，按面积降序。
 * 每个连通域只追踪一次外边界（其内部的孔洞不输出，等同 RETR_EXTERNAL）。
 */
export function prFindContours(binary: Uint8Array, width: number, height: number, minBBoxArea = 0): PRContour[] {
  const n = width * height;
  const visited = new Uint8Array(n);
  const stamp = new Uint32Array(n);
  const queue = new Int32Array(n);
  const contours: PRContour[] = [];
  let generation = 0;

  for (let seed = 0; seed < n; seed++) {
    if (!binary[seed] || visited[seed]) continue;
    generation++;
    let head = 0, tail = 0;
    queue[tail++] = seed;
    visited[seed] = 1;
    const comp: number[] = [];
    let start = seed, startY = (seed / width) | 0, startX = seed % width;
    let minX = startX, maxX = startX, minY = startY, maxY = startY;
    while (head < tail) {
      const i = queue[head++];
      comp.push(i);
      stamp[i] = generation;
      const x = i % width, y = (i / width) | 0;
      if (y < startY || (y === startY && x < startX)) { start = i; startX = x; startY = y; }
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const x0 = x > 0 ? x - 1 : 0, x1 = x < width - 1 ? x + 1 : width - 1;
      const y0 = y > 0 ? y - 1 : 0, y1 = y < height - 1 ? y + 1 : height - 1;
      for (let ny = y0; ny <= y1; ny++) {
        for (let nx = x0; nx <= x1; nx++) {
          const j = ny * width + nx;
          if (binary[j] && !visited[j]) { visited[j] = 1; queue[tail++] = j; }
        }
      }
    }
    if (comp.length < 4) continue;
    if ((maxX - minX + 1) * (maxY - minY + 1) < minBBoxArea) continue;

    const foreground = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < width && y < height && stamp[y * width + x] === generation;

    let bx = startX, by = startY;
    let cx = startX - 1, cy = startY; // 反向像素（起点左侧背景）
    const traced: PRPoint[] = [{ x: bx, y: by }];
    const limit = comp.length * 8 + 32;
    for (let step = 0; step < limit; step++) {
      let di = 0;
      for (let k = 0; k < 8; k++) if (DIRS[k][0] === cx - bx && DIRS[k][1] === cy - by) { di = k; break; }
      let found = -1;
      for (let k = 1; k <= 8; k++) {
        const idx = (di + k) % 8;
        const nx = bx + DIRS[idx][0], ny = by + DIRS[idx][1];
        if (foreground(nx, ny)) { found = idx; break; }
      }
      if (found < 0) break;
      const prev = (found + 7) % 8;
      cx = bx + DIRS[prev][0]; cy = by + DIRS[prev][1];
      bx += DIRS[found][0]; by += DIRS[found][1];
      if (bx === startX && by === startY) break;
      traced.push({ x: bx, y: by });
    }
    const points = simplifyChain(traced);
    if (points.length < 3) continue;
    contours.push({
      points,
      pixelCount: comp.length,
      area: Math.abs(prSignedArea(points)),
      perimeter: prPerimeter(points),
    });
  }
  contours.sort((a, b) => b.area - a.area);
  return contours;
}

function distToLine(p: PRPoint, a: PRPoint, b: PRPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(prCross(dx, dy, p.x - a.x, p.y - a.y)) / len;
}

/** Douglas-Peucker（闭合折线：先按最远点对切成两条开链）。 */
export function prApproxPolyDP(poly: PRPoint[], eps: number): PRPoint[] {
  if (poly.length <= 4) return poly.slice();
  let far = 1, best = -1;
  for (let i = 1; i < poly.length; i++) {
    const d = Math.hypot(poly[i].x - poly[0].x, poly[i].y - poly[0].y);
    if (d > best) { best = d; far = i; }
  }
  if (far === poly.length - 1) return poly.slice();
  const keep = (pts: PRPoint[]): PRPoint[] => {
    const mark = new Uint8Array(pts.length);
    mark[0] = mark[pts.length - 1] = 1;
    const stack: [number, number][] = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop()!;
      let mx = -1, idx = -1;
      for (let i = a + 1; i < b; i++) {
        const d = distToLine(pts[i], pts[a], pts[b]);
        if (d > mx) { mx = d; idx = i; }
      }
      if (mx > eps && idx > 0) { mark[idx] = 1; stack.push([a, idx], [idx, b]); }
    }
    return pts.filter((_, i) => mark[i]);
  };
  const a = keep(poly.slice(0, far + 1));
  const b = keep(poly.slice(far).concat([poly[0]]));
  return a.slice(0, -1).concat(b.slice(0, -1));
}

/**
 * 圆角/低对比度会让 Canny 轮廓在拐角处断裂，approxPolyDP 于是得到 5 点：
 * 真实四边 + 缺口两端之间的一条虚假短边。删掉这条短边的两个端点，用相邻
 * 两条长边求交，把被吃掉的角点补回来。非 5 点原样返回。
 */
export function prMergeGapCorner(poly: PRPoint[]): PRPoint[] {
  if (poly.length !== 5) return poly.slice();
  let gap = 0, minLen = Infinity;
  for (let i = 0; i < 5; i++) {
    const a = poly[i], b = poly[(i + 1) % 5];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < minLen) { minLen = len; gap = i; }
  }
  const pPrev = poly[(gap + 4) % 5], pA = poly[gap];
  const pB = poly[(gap + 1) % 5], pNext = poly[(gap + 2) % 5];
  const d1x = pA.x - pPrev.x, d1y = pA.y - pPrev.y;
  const d2x = pNext.x - pB.x, d2y = pNext.y - pB.y;
  const den = prCross(d1x, d1y, d2x, d2y);
  if (Math.abs(den) < 1e-9) return poly.slice();
  const t = prCross(pB.x - pPrev.x, pB.y - pPrev.y, d2x, d2y) / den;
  const corner = { x: pPrev.x + d1x * t, y: pPrev.y + d1y * t };
  if (!Number.isFinite(corner.x) || !Number.isFinite(corner.y)) return poly.slice();
  // 交点必须落在缺口附近；过远说明这 5 点不是"缺口"而是真实多边形，不能硬并。
  if (Math.hypot(corner.x - pA.x, corner.y - pA.y) > minLen * 6 ||
      Math.hypot(corner.x - pB.x, corner.y - pB.y) > minLen * 6) return poly.slice();
  return [poly[(gap + 2) % 5], poly[(gap + 3) % 5], pPrev, corner];
}

export function prIsConvexQuad(poly: PRPoint[]): boolean {
  if (poly.length !== 4) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = poly[i], b = poly[(i + 1) % 4], c = poly[(i + 2) % 4];
    const z = prCross(b.x - a.x, b.y - a.y, c.x - b.x, c.y - b.y);
    if (Math.abs(z) < 1e-6) return false;
    const s = z > 0 ? 1 : -1;
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

/** 任意顺序 4 点 → 左上、右上、右下、左下（与 Python order_corners 一致）。 */
export function prOrderCorners(pts: PRPoint[]): PRPoint[] {
  const p = pts.slice();
  const s = p.map((v) => v.x + v.y);
  const d = p.map((v) => v.y - v.x);
  const argmin = (a: number[]) => a.indexOf(Math.min(...a));
  const argmax = (a: number[]) => a.indexOf(Math.max(...a));
  const ordered = [p[argmin(s)], p[argmin(d)], p[argmax(s)], p[argmax(d)]];
  // x+y / y-x 对接近轴对齐的证件足够；倾斜较大时会把角点配错，
  // 用质心象限自检，失败则按极角重排（y 向下，atan2 升序正好是 左上→右上→右下→左下）。
  const cx = p.reduce((v, q) => v + q.x, 0) / 4;
  const cy = p.reduce((v, q) => v + q.y, 0) / 4;
  const quadrantOk = ordered.every((q, i) => {
    const sx = i === 0 || i === 3 ? -1 : 1;
    const sy = i < 2 ? -1 : 1;
    return (q.x - cx) * sx > 0 && (q.y - cy) * sy > 0;
  });
  if (quadrantOk) return ordered;
  return p.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
}

/** 返回 (面积, 最大内角偏差)，对应 Python quad_metrics。 */
export function prQuadMetrics(quad: PRPoint[]): { area: number, dev: number } {
  const area = Math.abs(prSignedArea(quad));
  let dev = 0;
  for (let i = 0; i < 4; i++) {
    const p0 = quad[(i + 3) % 4], p1 = quad[i], p2 = quad[(i + 1) % 4];
    const ax = p0.x - p1.x, ay = p0.y - p1.y;
    const bx = p2.x - p1.x, by = p2.y - p1.y;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    const cos = (ax * bx + ay * by) / (la * lb + 1e-9);
    const angle = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
    dev = Math.max(dev, Math.abs(90 - angle));
  }
  return { area, dev };
}
