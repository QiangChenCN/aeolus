/**
 * Worker 封装：统一 detect / rectify 的 Promise 接口。
 * 浏览器缺少 Worker（如 SSR / 测试环境）时自动回落到主线程同步算法，页面仍可用。
 */
import { detectCorners } from './detect';
import { rectifyImage } from './rectify';
import type { DetectionResult, Point, RectifyOutput, RgbaImage } from './types';

export interface RectifyEngine {
  init(img: RgbaImage): Promise<void>;
  detect(): Promise<DetectionResult>;
  rectify(corners: Point[]): Promise<RectifyOutput>;
  dispose(): void;
}

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };

function inlineEngine(): RectifyEngine {
  let cache: RgbaImage | null = null;
  return {
    async init(img) { cache = img; },
    async detect() { return cache ? detectCorners(cache, true) : fail('未初始化'); },
    async rectify(corners) { return cache ? rectifyImage(cache, corners) : fail('未初始化'); },
    dispose() { cache = null; },
  };
}

function fail(reason: string): DetectionResult {
  return { ok: false, corners: null, warn: false, maxDeviation: 0, score: 0, reason };
}

export function createRectifyEngine(): RectifyEngine {
  if (typeof Worker === 'undefined') return inlineEngine();
  let worker: Worker;
  try {
    worker = new Worker(new URL('./rectify.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return inlineEngine();
  }
  let seq = 0;
  const pending = new Map<number, Pending>();
  worker.onmessage = (event: MessageEvent) => {
    const msg = event.data;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok || 'corners' in msg) {
      if ('buffer' in msg) p.resolve({ width: msg.width, height: msg.height, data: new Uint8ClampedArray(msg.buffer) });
      else p.resolve(msg);
    } else p.reject(new Error(msg.reason || '矫正计算失败'));
  };
  worker.onerror = (event) => {
    for (const p of pending.values()) p.reject(new Error(event.message || 'Worker 运行异常'));
    pending.clear();
  };
  const send = (payload: object, transfer: Transferable[] = []) => new Promise<any>((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, ...payload }, transfer);
  });
  return {
    async init(img) {
      const buffer = img.data.buffer as ArrayBuffer;
      await send({ type: 'init', width: img.width, height: img.height, buffer }, [buffer]);
    },
    detect() { return send({ type: 'detect' }); },
    rectify(corners) { return send({ type: 'rectify', corners }); },
    dispose() { worker.terminate(); pending.clear(); },
  };
}
