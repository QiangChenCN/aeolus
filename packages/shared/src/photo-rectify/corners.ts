/** 手动四角纯逻辑：默认位置、拖拽约束、合法性校验。 */
import type { PRPoint, PRSize } from './types';

export function prDefaultCorners(size: PRSize): PRPoint[] {
  const dx = size.width * 0.1, dy = size.height * 0.1;
  return [
    { x: dx, y: dy },
    { x: size.width - dx, y: dy },
    { x: size.width - dx, y: size.height - dy },
    { x: dx, y: size.height - dy },
  ];
}

export function prMoveCorner(corners: PRPoint[], index: number, next: PRPoint, size: PRSize): PRPoint[] {
  if (index < 0 || index > 3) return corners;
  const out = corners.slice();
  out[index] = {
    x: Math.max(0, Math.min(size.width, next.x)),
    y: Math.max(0, Math.min(size.height, next.y)),
  };
  return out;
}

export function prIsValidQuad(corners: PRPoint[]): boolean {
  if (corners.length !== 4 || corners.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
  const area = Math.abs(corners.reduce((s, p, i) => {
    const q = corners[(i + 1) % 4];
    return s + p.x * q.y - q.x * p.y;
  }, 0) / 2);
  return area > 100;
}
