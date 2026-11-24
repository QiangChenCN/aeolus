import { describe, it, expect } from 'vitest';
import { createRectifyEngine } from '../../../src/features/photo-rectify/algorithms/engine.ts';
import { makeQuad, makeTrapezoidRgba } from './synthetic.js';

describe('createRectifyEngine', () => {
  it('无 Worker 环境自动回退主线程，接口仍可用', async () => {
    const engine = createRectifyEngine();
    const img = makeTrapezoidRgba(480, 320);
    await engine.init(img);
    const detected = await engine.detect();
    expect(detected.ok).toBe(true);
    const out = await engine.rectify(detected.corners || makeQuad(480, 320));
    expect(out.width).toBe(1024);
    expect(out.height).toBe(645);
    expect(out.data.length).toBe(1024 * 645 * 4);
    engine.dispose();
  });

  it('未初始化时 detect 返回失败而不是抛错', async () => {
    const engine = createRectifyEngine();
    const result = await engine.detect();
    expect(result.ok).toBe(false);
    expect(result.corners).toBeNull();
    engine.dispose();
  });
});
