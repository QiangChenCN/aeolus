import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { detectCorners } from '../../../src/features/photo-rectify/algorithms/detect.ts';
import { prMergeGapCorner, prOrderCorners } from '@aeolus/shared';
import { makeQuad, makeWarnQuad, makeTrapezoidRgba, makeNoiseRgba, makeSolidRgba } from './synthetic.js';
import { decodePng } from './png.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const W = 480, H = 320;
const expectedQuad = makeQuad(W, H);
const loadFixture = (name) => decodePng(readFileSync(resolve(HERE, 'fixtures', name)));

function expectCornersClose(result, expected, tolerance = 3) {
  expect(result.ok).toBe(true);
  expect(result.corners).toHaveLength(4);
  result.corners.forEach((p, i) => {
    expect(Math.abs(p.x - expected[i].x), `角点 ${i} 的 x 误差`).toBeLessThan(tolerance);
    expect(Math.abs(p.y - expected[i].y), `角点 ${i} 的 y 误差`).toBeLessThan(tolerance);
  });
}

function makeLowContrastCard(texture = false) {
  const w = 640, h = 480;
  const quad = [{ x: 150, y: 80 }, { x: 470, y: 95 }, { x: 500, y: 400 }, { x: 130, y: 380 }];
  const data = new Uint8ClampedArray(w * h * 4);
  const inside = (x, y) => {
    let hit = false;
    for (let i = 0, j = 3; i < 4; j = i++) {
      const a = quad[i], b = quad[j];
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) hit = !hit;
    }
    return hit;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let v = 235;
      if (texture) v += ((x * 13 + y * 7) % 17) - 8;
      if (inside(x, y)) v = 246;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { img: { width: w, height: h, data }, quad };
}

describe('detectCorners 自动四角检测', () => {
  it('合成梯形：四角误差 < 3px，且不误报 warn', () => {
    const result = detectCorners(makeTrapezoidRgba(W, H));
    expectCornersClose(result, expectedQuad);
    expect(result.warn).toBe(false);
  });

  it('从合成 PNG 文件读取的梯形：四角误差 < 3px', () => {
    expectCornersClose(detectCorners(loadFixture('trapezoid-clean.png')), expectedQuad);
  });

  it('内角偏差 > 15° 时标记 warn，但仍给出可用四角', () => {
    const result = detectCorners(makeTrapezoidRgba(W, H, makeWarnQuad(W, H)));
    expectCornersClose(result, makeWarnQuad(W, H));
    expect(result.warn).toBe(true);
    expect(result.maxDeviation).toBeGreaterThan(15);
    expect(result.maxDeviation).toBeLessThanOrEqual(30);
  });

  it('纯噪声图：检测失败，不输出任何角点', () => {
    for (const img of [makeNoiseRgba(W, H), loadFixture('noise.png')]) {
      const result = detectCorners(img);
      expect(result.ok).toBe(false);
      expect(result.corners).toBeNull();
      expect(result.reason).toBeTruthy();
    }
  });

  it('纯色图：检测失败，不输出任何角点', () => {
    for (const img of [makeSolidRgba(W, H), loadFixture('solid.png')]) {
      const result = detectCorners(img);
      expect(result.ok).toBe(false);
      expect(result.corners).toBeNull();
    }
  });

  it('低对比度证件（灰度差 11）仍可识别，四角误差 < 3px', () => {
    const { img, quad } = makeLowContrastCard();
    expectCornersClose(detectCorners(img), quad);
  });

  it('纹理背景不会把整幅图像边界误判为证件', () => {
    const { img } = makeLowContrastCard(true);
    const result = detectCorners(img);
    if (result.ok) {
      const xs = result.corners.map((p) => p.x), ys = result.corners.map((p) => p.y);
      expect(Math.min(...xs)).toBeGreaterThan(6);
      expect(Math.max(...xs)).toBeLessThan(634);
      expect(Math.min(...ys)).toBeGreaterThan(4);
      expect(Math.max(...ys)).toBeLessThan(476);
    } else {
      expect(result.corners).toBeNull();
    }
  });

  it('证件底边与背景横线粘连到画面边缘时，仍能回退到正确四角', () => {
    const w = 480, h = 320;
    const quad = [{ x: 120, y: 60 }, { x: 360, y: 70 }, { x: 380, y: 260 }, { x: 100, y: 250 }];
    const data = new Uint8ClampedArray(w * h * 4);
    const inside = (x, y) => {
      let hit = false;
      for (let i = 0, j = 3; i < 4; j = i++) {
        const a = quad[i], b = quad[j];
        if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) hit = !hit;
      }
      return hit;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        // 木纹横线贴着证件底边一直连到画面左缘，Canny 轮廓会粘成贴边伪矩形
        const grain = y >= 249 && y <= 251 && x < 120;
        let v = 235;
        if (grain || inside(x, y)) v = 35;
        data[i] = data[i + 1] = data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    // 粘连场景下允许内缩几像素，但必须找到卡片区域，不能退化成贴边伪矩形或失败
    const result = detectCorners({ width: w, height: h, data });
    expect(result.ok).toBe(true);
    expectCornersClose(result, quad, 30);
  });

  it('贴着画面边界的伪矩形被剔除，绝不作为证件输出', () => {
    const w = 480, h = 320;
    const quad = [{ x: 0, y: 60 }, { x: 360, y: 70 }, { x: 380, y: 260 }, { x: 0, y: 250 }];
    const data = new Uint8ClampedArray(w * h * 4);
    const inside = (x, y) => {
      let hit = false;
      for (let i = 0, j = 3; i < 4; j = i++) {
        const a = quad[i], b = quad[j];
        if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) hit = !hit;
      }
      return hit;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const v = inside(x, y) ? 35 : 255;
        data[i] = data[i + 1] = data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    const result = detectCorners({ width: w, height: h, data });
    if (result.ok) {
      expect(Math.min(...result.corners.map((p) => p.x))).toBeGreaterThan(4);
      expect(Math.max(...result.corners.map((p) => p.x))).toBeLessThan(w - 4);
    } else {
      expect(result.corners).toBeNull();
    }
  });

  it('圆角断裂的 5 点轮廓补回真实角点，避免左上角被裁掉一块', () => {
    // 来自真实证件照：上边缘起点 (214,119) 与左边缘末端 (162,148) 之间是
    // 圆角处 Canny 断裂形成的缺口。旧实现放大 eps 把 (214,119) 当左上角，
    // 框向内缩约 50px，导致输出裁多了。
    const five = [
      { x: 214, y: 119 }, { x: 733, y: 125 }, { x: 763, y: 489 },
      { x: 152, y: 513 }, { x: 162, y: 148 },
    ];
    const quad = prOrderCorners(prMergeGapCorner(five));
    expect(quad).toHaveLength(4);
    expect(Math.abs(quad[0].x - 163)).toBeLessThan(8);
    expect(Math.abs(quad[0].y - 130)).toBeLessThan(20);
  });

  it('高分辨率大图：降采样后检测精度与小图一致，角点映射回原图坐标', () => {
    const sw = 480, sh = 320;
    const quad = makeQuad(sw, sh);
    const small = makeTrapezoidRgba(sw, sh);
    const smallResult = detectCorners(small);

    // 把同一张合成图放大 4 倍，模拟手机 4K 原图（此前 4K 直检 dev 会从 5° 恶化到 11°）
    const scale = 4;
    const bw = sw * scale, bh = sh * scale;
    const data = new Uint8ClampedArray(bw * bh * 4);
    for (let y = 0; y < bh; y++) {
      const sy = Math.min(sh - 1, Math.floor(y / scale));
      for (let x = 0; x < bw; x++) {
        const sx = Math.min(sw - 1, Math.floor(x / scale));
        const si = (sy * sw + sx) * 4, di = (y * bw + x) * 4;
        data[di] = small.data[si]; data[di + 1] = small.data[si + 1];
        data[di + 2] = small.data[si + 2]; data[di + 3] = small.data[si + 3];
      }
    }
    const bigResult = detectCorners({ width: bw, height: bh, data });

    expect(smallResult.ok).toBe(true);
    expect(bigResult.ok).toBe(true);
    expect(bigResult.maxDeviation).toBeLessThan(15);
    // 角点必须映射回原图坐标系（接近放大 4 倍后的真值），而不是留在 1600 降采样坐标系。
    // 入口的原图局部精修把 4K 级误差压到约 2px，故容差收紧到 6px 锁定精度。
    const expected = quad.map((p) => ({ x: p.x * scale, y: p.y * scale }));
    expectCornersClose(bigResult, expected, 6);
  });

  it('证件边缘有一圈低对比过渡带时，法线精修把框推到真实明暗边界', () => {
    const w = 640, h = 480;
    // 真实证件四角（外侧）：识别时 Canny 容易贴到内侧一圈（内缩 INSET px）
    const trueQuad = [{ x: 120, y: 80 }, { x: 500, y: 90 }, { x: 520, y: 400 }, { x: 100, y: 390 }];
    const INSET = 14;
    const innerQuad = trueQuad.map((p, i) => {
      const c = trueQuad.reduce((s, q) => ({ x: s.x + q.x / 4, y: s.y + q.y / 4 }), { x: 0, y: 0 });
      const dx = c.x - p.x, dy = c.y - p.y, len = Math.hypot(dx, dy);
      return { x: p.x + dx / len * INSET, y: p.y + dy / len * INSET };
    });
    const inQuad = (q, x, y) => {
      let hit = false;
      for (let i = 0, j = 3; i < 4; j = i++) {
        const a = q[i], b = q[j];
        if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) hit = !hit;
      }
      return hit;
    };
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        // 真实证件内是蓝色底纹（B-R 明显为正），木纹背景 B-R 为负。
        // 内侧一圈也铺成证件色，模拟"检测框贴内边"——法线精修应把它推到外侧真边。
        const isCard = inQuad(trueQuad, x, y);
        const v = isCard ? 200 : 120;
        data[i] = isCard ? 150 : 110;
        data[i + 1] = v;
        data[i + 2] = isCard ? 240 : 90;
        data[i + 3] = 255;
      }
    }
    const result = detectCorners({ width: w, height: h, data });
    expect(result.ok).toBe(true);
    // 法线精修后四角应接近真实外边界，而不是停在内缩圈上
    expectCornersClose(result, trueQuad, 20);
  });

  it('尺寸过小的图直接失败，不进行后续计算', () => {
    const result = detectCorners(makeSolidRgba(20, 20));
    expect(result.ok).toBe(false);
    expect(result.corners).toBeNull();
  });
});
