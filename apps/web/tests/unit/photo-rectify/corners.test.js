import { describe, it, expect } from 'vitest';
import {
  defaultCorners, moveCorner, isValidQuad,
} from '../../../src/features/photo-rectify/algorithms/corners.ts';

describe('手动四角', () => {
  it('默认位置为图像四角向内缩 10%', () => {
    expect(defaultCorners({ width: 1000, height: 600 })).toEqual([
      { x: 100, y: 60 }, { x: 900, y: 60 }, { x: 900, y: 540 }, { x: 100, y: 540 },
    ]);
  });

  it('拖动一个角点只改变该角点，并限制在图幅内', () => {
    const corners = defaultCorners({ width: 1000, height: 600 });
    const moved = moveCorner(corners, 0, { x: -50, y: 700 }, { width: 1000, height: 600 });
    expect(moved[0]).toEqual({ x: 0, y: 600 });
    expect(moved.slice(1)).toEqual(corners.slice(1));
    expect(corners[0]).toEqual({ x: 100, y: 60 });
  });

  it('非法索引不改变四角', () => {
    const corners = defaultCorners({ width: 100, height: 100 });
    expect(moveCorner(corners, 7, { x: 1, y: 1 }, { width: 100, height: 100 })).toEqual(corners);
  });

  it('拒绝退化或自交的四边形', () => {
    expect(isValidQuad(defaultCorners({ width: 1000, height: 600 }))).toBe(true);
    expect(isValidQuad([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }])).toBe(false);
    expect(isValidQuad([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }])).toBe(false);
    expect(isValidQuad([])).toBe(false);
  });
});
