import { describe, it, expect } from 'vitest';
import {
  getPerspectiveTransform, invert3, projectPoints, insetCorners, outputCorners,
  rectifyImage, OUTPUT_WIDTH, OUTPUT_HEIGHT,
} from '../../../src/features/photo-rectify/algorithms/rectify.ts';
import { makeQuad, makeTrapezoidRgba } from './synthetic.js';

const SRC = makeQuad(480, 320);
const DST = outputCorners();

function close(actual, expected, tolerance, label) {
  expect(Math.abs(actual - expected), label).toBeLessThanOrEqual(tolerance);
}

describe('rectifyImage 透视矫正', () => {
  it('单位矩形到自身时，单应矩阵为恒等变换', () => {
    const unit = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const h = getPerspectiveTransform(unit, unit);
    const projected = projectPoints(h, unit);
    projected.forEach((p, i) => { close(p.x, unit[i].x, 1e-6, 'x'); close(p.y, unit[i].y, 1e-6, 'y'); });
  });

  it('单应矩阵求逆后逆映射还原原始点', () => {
    const h = getPerspectiveTransform(SRC, DST);
    const inv = invert3(h);
    const projected = projectPoints(h, SRC);
    const back = projectPoints(inv, projected);
    back.forEach((p, i) => { close(p.x, SRC[i].x, 1e-5, 'x'); close(p.y, SRC[i].y, 1e-5, 'y'); });
  });

  it('内缩 6px：每个角点沿指向中心方向移动约 6px', () => {
    const moved = insetCorners(SRC, 6);
    const cx = SRC.reduce((s, p) => s + p.x, 0) / 4;
    const cy = SRC.reduce((s, p) => s + p.y, 0) / 4;
    moved.forEach((p, i) => {
      close(Math.hypot(p.x - SRC[i].x, p.y - SRC[i].y), 6, 1e-6, `角点 ${i} 位移`);
      expect((p.x - cx) * (SRC[i].x - cx) + (p.y - cy) * (SRC[i].y - cy)).toBeGreaterThan(0);
    });
  });

  it('参与变换的四角精确映射到期望位置（±2px）', () => {
    const effective = insetCorners(SRC);
    const h = getPerspectiveTransform(effective, DST);
    const mapped = projectPoints(h, effective);
    mapped.forEach((p, i) => {
      close(p.x, DST[i].x, 2, `角点 ${i} 的 x`);
      close(p.y, DST[i].y, 2, `角点 ${i} 的 y`);
    });
  });

  it('输出为 1024×645 PNG 数据，梯形内部像素被矫正到整幅画布', () => {
    const img = makeTrapezoidRgba(480, 320);
    const out = rectifyImage(img, SRC);
    expect(out.width).toBe(OUTPUT_WIDTH);
    expect(out.height).toBe(OUTPUT_HEIGHT);
    expect(out.data).toBeInstanceOf(Uint8ClampedArray);
    expect(out.data.length).toBe(OUTPUT_WIDTH * OUTPUT_HEIGHT * 4);
    const at = (x, y) => Array.from(out.data.subarray((y * OUTPUT_WIDTH + x) * 4, (y * OUTPUT_WIDTH + x) * 4 + 3));
    for (const [x, y] of [[0, 0], [OUTPUT_WIDTH - 1, 0], [OUTPUT_WIDTH - 1, OUTPUT_HEIGHT - 1], [0, OUTPUT_HEIGHT - 1], [512, 322]]) {
      const [r, g, b] = at(x, y);
      expect(r, `(${x},${y}) 应为证件颜色`).toBeLessThan(100);
      expect(g).toBeLessThan(100);
      expect(b).toBeLessThan(100);
    }
  });
});
