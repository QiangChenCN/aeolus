/**
 * 与业务原有提交通道的唯一挂载点。
 * 本组件只产出成品 PNG（1024×645），不新增后端接口：宿主页面注册一个 handler，
 * 把 Blob 塞进它原本用的 FormData / API 即可（见 README.md）。
 */
export interface RectifySubmitMeta {
  sourceName: string;
  corners: { x: number, y: number }[];
  width: number;
  height: number;
}

type SubmitHandler = (png: Blob, meta: RectifySubmitMeta) => void | Promise<void>;

let handler: SubmitHandler | null = null;

export function registerRectifySubmit(fn: SubmitHandler | null): void {
  handler = fn;
}

export function hasRectifySubmit(): boolean {
  return handler !== null;
}

export async function submitRectifiedPng(png: Blob, meta: RectifySubmitMeta): Promise<boolean> {
  if (!handler) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aeolus:rectified-png', { detail: { png, meta } }));
    }
    return false;
  }
  await handler(png, meta);
  return true;
}
