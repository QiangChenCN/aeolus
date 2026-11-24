/**
 * 计算 Worker：原图 RGBA 通过 init 消息一次性传入（transfer 所有权），
 * 之后 detect / rectify 只传参数，原图始终只存在于 Worker 内存中。
 */
import { detectCorners } from './detect';
import { rectifyImage } from './rectify';
import type { Point, RgbaImage } from './types';

interface RectifyMessage {
  id: number;
  type: 'init' | 'detect' | 'rectify';
  width?: number;
  height?: number;
  buffer?: ArrayBuffer;
  corners?: Point[];
}

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<RectifyMessage>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

let cache: RgbaImage | null = null;

ctx.onmessage = (event) => {
  const msg = event.data;
  try {
    if (msg.type === 'init') {
      if (!msg.buffer || !msg.width || !msg.height) throw new Error('init 缺少图像数据');
      cache = { width: msg.width, height: msg.height, data: new Uint8ClampedArray(msg.buffer) };
      ctx.postMessage({ id: msg.id, ok: true });
      return;
    }
    if (!cache) throw new Error('Worker 尚未收到图像');
    if (msg.type === 'detect') {
      const result = detectCorners(cache, true);
      ctx.postMessage({ id: msg.id, ...result });
      return;
    }
    if (!msg.corners || msg.corners.length !== 4) throw new Error('四角数据不完整');
    const out = rectifyImage(cache, msg.corners);
    ctx.postMessage(
      { id: msg.id, ok: true, width: out.width, height: out.height, buffer: out.data.buffer },
      [out.data.buffer],
    );
  } catch (err) {
    ctx.postMessage({ id: msg.id, ok: false, reason: err instanceof Error ? err.message : String(err) });
  }
};
