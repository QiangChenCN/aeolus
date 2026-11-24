import { deflateSync } from 'node:zlib';
import { PhotoRectifyService } from './photo-rectify.service';

const CRC: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, 'ascii');
  data.copy(out, 8);
  let c = 0xffffffff;
  for (const b of out.subarray(4, 8 + data.length)) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  out.writeUInt32BE((c ^ 0xffffffff) >>> 0, 8 + data.length);
  return out;
}

function png(width: number, height: number, painter: (x: number, y: number) => number): string {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = painter(x, y);
      const i = y * (width * 4 + 1) + 1 + x * 4;
      raw[i] = raw[i + 1] = raw[i + 2] = v;
      raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return `data:image/png;base64,${Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64')}`;
}

function inside(x: number, y: number): boolean {
  const q = [[120, 60], [360, 70], [380, 260], [100, 250]];
  let hit = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const a = q[i], b = q[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}

describe('PhotoRectifyService', () => {
  const service = new PhotoRectifyService();
  const card = png(480, 320, (x, y) => (inside(x, y) ? 35 : 255));
  const solid = png(480, 320, () => 255);

  it('PNG 梯形图自动检测并输出成品 PNG', () => {
    const out = service.rectify({ image: card });
    expect(out.status).toBe('ok');
    expect(out.png).toMatch(/^data:image\/png;base64,/);
    expect(out.width).toBe(1024);
    expect(out.height).toBe(645);
    expect(out.corners).toHaveLength(4);
  });

  it('纯色图检测失败，不输出图片', () => {
    const out = service.rectify({ image: solid });
    expect(out.status).toBe('failed');
    expect(out.png).toBeNull();
  });

  it('指定四角时走手动模式并跳过检测', () => {
    const out = service.rectify({
      image: solid,
      corners: [{ x: 100, y: 60 }, { x: 900, y: 60 }, { x: 900, y: 540 }, { x: 100, y: 540 }],
    });
    expect(out.status).toBe('manual');
    expect(out.png).toMatch(/^data:image\/png;base64,/);
  });

  it('缺少 image 时返回失败而不是抛错', () => {
    const out = service.rectify({ image: '' });
    expect(out.status).toBe('failed');
    expect(out.message).toContain('缺少 image');
  });
});
