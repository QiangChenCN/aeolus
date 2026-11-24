// 重新生成照片矫正单测用的 3 张合成 PNG：node apps/web/scripts/generate-photo-rectify-fixtures.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from '../tests/unit/photo-rectify/png.js';
import { makeTrapezoidRgba, makeSolidRgba, makeNoiseRgba } from '../tests/unit/photo-rectify/synthetic.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../tests/unit/photo-rectify/fixtures');
mkdirSync(OUT, { recursive: true });

const W = 480, H = 320;
const fixtures = [
  ['trapezoid-clean.png', makeTrapezoidRgba(W, H)],
  ['noise.png', makeNoiseRgba(W, H)],
  ['solid.png', makeSolidRgba(W, H)],
];
for (const [name, img] of fixtures) {
  writeFileSync(resolve(OUT, name), encodePng(img.width, img.height, img.data));
  console.log('generated', name);
}
