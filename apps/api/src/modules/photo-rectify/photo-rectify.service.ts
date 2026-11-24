import { Injectable } from '@nestjs/common';
import { deflateSync, inflateSync } from 'node:zlib';
import {
  prDetectQuad, prRectify, prOrderCorners, PR_OUTPUT_WIDTH, PR_OUTPUT_HEIGHT,
  type PRImage, type PRPoint,
} from '@aeolus/shared';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** 只支持 8bit RGB/RGBA 非隔行 PNG（前端 canvas.toBlob('image/png') 的产物）。 */
function decodePng(buf: Buffer): PRImage {
  if (buf.length < 24 || buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('不支持的图片格式，请上传 PNG');
  }
  let pos = 8, width = 0, height = 0, colorType = 6;
  const idat: Buffer[] = [];
  while (pos + 12 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    if (pos + 12 + len > buf.length) break;
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || (data[9] !== 6 && data[9] !== 2) || data[12] !== 0) {
        throw new Error('仅支持 8bit RGB/RGBA 非隔行 PNG');
      }
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    pos += len + 12;
  }
  if (!width || !height || !idat.length) throw new Error('PNG 数据不完整');
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * height) throw new Error('PNG 像素数据不完整');
  const out = new Uint8ClampedArray(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      if (filter === 1) line[x] = (line[x] + a) & 0xff;
      else if (filter === 2) line[x] = (line[x] + b) & 0xff;
      else if (filter === 3) line[x] = (line[x] + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      } else if (filter !== 0) throw new Error('不支持的 PNG 行过滤器');
    }
    for (let x = 0; x < width; x++) {
      const si = x * bpp, di = (y * width + x) * 4;
      out[di] = line[si];
      out[di + 1] = line[si + 1];
      out[di + 2] = line[si + 2];
      out[di + 3] = 255;
    }
    prev = line;
  }
  return { width, height, data: out };
}

function encodePng(width: number, height: number, rgba: Uint8ClampedArray): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export interface PhotoRectifyRequest {
  image: string;
  corners?: Array<{ x: number, y: number } | [number, number]>;
  ratio?: number;
  outWidth?: number;
  height?: number;
  inset?: number;
  interpolation?: 'bilinear' | 'bicubic';
}

export interface PhotoRectifyResponse {
  status: 'ok' | 'warn' | 'manual' | 'failed';
  message: string;
  corners: PRPoint[] | null;
  areaFrac: number;
  maxDeviation: number;
  width: number;
  height: number;
  /** data:image/png;base64,... */
  png: string | null;
}

@Injectable()
export class PhotoRectifyService {
  rectify(body: PhotoRectifyRequest): PhotoRectifyResponse {
    const base64 = String(body?.image || '').replace(/^data:image\/[^;]+;base64,/, '');
    if (!base64) return this.failed('缺少 image（base64 PNG 或 data URL）');
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 25 * 1024 * 1024) return this.failed('图片不能超过 25MB');
    let img: PRImage;
    try {
      img = decodePng(buffer);
    } catch (e) {
      return this.failed(e instanceof Error ? e.message : '图片解码失败');
    }

    let corners: PRPoint[] | null = null;
    let status: PhotoRectifyResponse['status'] = 'ok';
    let message = '自动检测成功';
    let detection = { areaFrac: 0, maxDeviation: 0 };
    if (Array.isArray(body.corners) && body.corners.length === 4) {
      corners = prOrderCorners(body.corners.map((p) =>
        Array.isArray(p) ? { x: Number(p[0]), y: Number(p[1]) } : { x: Number(p.x), y: Number(p.y) }));
      status = 'manual';
      message = '使用手动指定四角';
    } else {
      const detected = prDetectQuad(img);
      if (!detected.ok) {
        return {
          status: 'failed', message: detected.reason, corners: null,
          areaFrac: 0, maxDeviation: 0, width: 0, height: 0, png: null,
        };
      }
      corners = detected.corners;
      status = detected.warn ? 'warn' : 'ok';
      message = detected.warn ? '内角偏差较大，建议人工复核' : '自动检测成功';
      detection = { areaFrac: detected.areaFrac, maxDeviation: detected.maxDeviation };
    }

    try {
      const out = prRectify(img, corners!, {
        outWidth: body.outWidth ?? PR_OUTPUT_WIDTH,
        height: body.height,
        ratio: body.ratio,
        inset: body.inset,
        // 与 Python 参考脚本 INTER_CUBIC 及前端默认一致；调用方可显式指定 bilinear
        interpolation: body.interpolation ?? 'bicubic',
      });
      return {
        status,
        message,
        corners,
        areaFrac: detection.areaFrac,
        maxDeviation: detection.maxDeviation,
        width: out.width,
        height: out.height,
        png: `data:image/png;base64,${encodePng(out.width, out.height, out.data).toString('base64')}`,
      };
    } catch (e) {
      return this.failed(e instanceof Error ? e.message : '透视矫正失败');
    }
  }

  private failed(message: string): PhotoRectifyResponse {
    return {
      status: 'failed', message, corners: null, areaFrac: 0, maxDeviation: 0,
      width: 0, height: 0, png: null,
    };
  }
}
