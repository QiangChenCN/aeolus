// 合成测试图生成器（无第三方依赖）：在内存里按像素绘制梯形 / 纯色 / 噪声图。
// fixtures/*.png 也由 scripts/generate-photo-rectify-fixtures.mjs 用同一套逻辑生成。

export function makeQuad(width, height, scale = 1) {
  const sx = width / 480 * scale, sy = height / 320 * scale;
  return [
    { x: 120 * sx, y: 60 * sy },
    { x: 360 * sx, y: 70 * sy },
    { x: 380 * sx, y: 260 * sy },
    { x: 100 * sx, y: 250 * sy },
  ];
}

export function makeWarnQuad(width, height) {
  const sx = width / 480, sy = height / 320;
  return [
    { x: 170 * sx, y: 60 * sy },
    { x: 310 * sx, y: 60 * sy },
    { x: 420 * sx, y: 260 * sy },
    { x: 60 * sx, y: 260 * sy },
  ];
}

function inside(px, py, poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > py) !== (b.y > py) && px < (b.x - a.x) * (py - a.y) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

export function makeSolidRgba(width, height, color = [255, 255, 255, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(color, i);
  return { width, height, data };
}

export function makeTrapezoidRgba(width, height, quad = makeQuad(width, height), fg = [35, 35, 40, 255]) {
  const out = makeSolidRgba(width, height);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of quad) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(height - 1, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(width - 1, Math.ceil(x1)); x++) {
      if (inside(x, y, quad)) out.data.set(fg, (y * width + x) * 4);
    }
  }
  return out;
}

export function makeNoiseRgba(width, height, seed = 12345) {
  const out = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  let s = seed >>> 0;
  for (let i = 0; i < out.data.length; i += 4) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const v = s >>> 24;
    out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
    out.data[i + 3] = 255;
  }
  return out;
}
