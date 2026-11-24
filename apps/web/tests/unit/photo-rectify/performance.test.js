import { describe, it, expect } from 'vitest';
import { detectCorners } from '../../../src/features/photo-rectify/algorithms/detect.ts';
import { rectifyImage } from '../../../src/features/photo-rectify/algorithms/rectify.ts';
import { makeQuad, makeTrapezoidRgba } from './synthetic.js';

describe('1920×1080 端到端性能', () => {
  it('自动检测 + 矫正输出相对基准不退化（跨机器/并发稳定）', () => {
    const W = 1920, H = 1080;
    const img = makeTrapezoidRgba(W, H);
    const quad = makeQuad(W, H);
    // 预热 JIT，避免把首次编译计入耗时
    const warm = makeTrapezoidRgba(480, 320);
    detectCorners(warm);
    rectifyImage(warm, makeQuad(480, 320));

    // 3 次取最小值；用同进程、同 CPU 争抢环境下的 rectify 作基准取比值，
    // 消除本地隔离 / CI 多 worker 之间的机器差异（CI 墙钟可能到 1400ms+，但比值稳定）。
    const bench = (fn) => {
      let best = Infinity;
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        fn();
        best = Math.min(best, performance.now() - t0);
      }
      return best;
    };
    const base = bench(() => rectifyImage(img, quad));
    let detected = null;
    const total = bench(() => {
      detected = detectCorners(img, true);
      rectifyImage(img, detected.corners || quad);
    });
    expect(detected.ok).toBe(true);
    const ratio = total / base;
    console.log(`[photo-rectify] 检测+矫正 ${total.toFixed(1)}ms / 单次矫正基准 ${base.toFixed(1)}ms = ${ratio.toFixed(1)}x`);
    // 本地隔离约 4x，GitHub Actions 多 worker 争抢时约 7x。
    // 若回退到 4K 全分辨率逐像素跑多档 Canny 会到 20x 以上，故用 12x 作数量级护栏。
    expect(ratio).toBeLessThan(12);
  });

  it('手动模式单次矫正计算 < 500ms（bicubic 采样，拖动实时刷新预算）', () => {
    const img = makeTrapezoidRgba(1920, 1080);
    const quad = makeQuad(1920, 1080);
    rectifyImage(img, quad);
    const t0 = performance.now();
    rectifyImage(img, quad);
    const elapsed = performance.now() - t0;
    console.log(`[photo-rectify] 单次矫正耗时 ${elapsed.toFixed(1)}ms`);
    // 默认 bicubic（对齐 Python INTER_CUBIC）本地约 170ms，CI 多 worker 争抢约 200ms+；
    // 用 500ms 作护栏，只防数量级退化（如回退到逐像素 O(n²) 实现的秒级耗时）。
    expect(elapsed).toBeLessThan(500);
  });
});
