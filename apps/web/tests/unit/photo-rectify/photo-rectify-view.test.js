import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PhotoRectifyView from '../../../src/features/photo-rectify/PhotoRectifyView.vue';
import { makeTrapezoidRgba } from './synthetic.js';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('PhotoRectifyView 选图流程', () => {
  it('通过 2D context 读取像素（而非 canvas 元素）并完成自动矫正', async () => {
    const W = 480, H = 320;
    vi.stubGlobal('createImageBitmap', async () => ({ width: W, height: H, close() {} }));
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:test', revokeObjectURL() {} });
    vi.stubGlobal('ImageData', class {
      constructor(data, width, height) { this.data = data; this.width = width; this.height = height; }
    });
    const ctx = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => {
        const img = makeTrapezoidRgba(W, H);
        return { width: W, height: H, data: img.data, colorSpace: 'srgb' };
      }),
      clearRect: vi.fn(),
      putImageData: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);

    const wrapper = mount(PhotoRectifyView);
    const input = wrapper.find('input[type=file]').element;
    Object.defineProperty(input, 'files', {
      value: [{ name: 'id-card.png', type: 'image/png', size: 1000 }],
      configurable: true,
    });
    input.dispatchEvent(new Event('change'));
    await flushPromises();
    await flushPromises();

    expect(ctx.getImageData).toHaveBeenCalledWith(0, 0, W, H);
    expect(ctx.putImageData).toHaveBeenCalledTimes(1);
    expect(wrapper.find('.pr-notice').exists()).toBe(false);
    expect(wrapper.text()).toContain('已自动识别四角');
    expect(wrapper.text()).toContain('1024 × 645 PNG');
    expect(wrapper.text()).toContain('下载 PNG');
    expect(wrapper.text()).not.toContain('确认并提交');
    wrapper.unmount();
  });

  it('拖拽上传：进入时显示落点遮罩，松手后走同一处理流程', async () => {
    const W = 480, H = 320;
    vi.stubGlobal('createImageBitmap', async () => ({ width: W, height: H, close() {} }));
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:test', revokeObjectURL() {} });
    vi.stubGlobal('ImageData', class {
      constructor(data, width, height) { this.data = data; this.width = width; this.height = height; }
    });
    const ctx = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => {
        const img = makeTrapezoidRgba(W, H);
        return { width: W, height: H, data: img.data, colorSpace: 'srgb' };
      }),
      clearRect: vi.fn(),
      putImageData: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);

    const wrapper = mount(PhotoRectifyView);
    const root = wrapper.find('.pr').element;
    const file = { name: 'dropped.png', type: 'image/png', size: 1000 };
    const dragEvent = (type) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', {
        value: { types: ['Files'], files: type === 'drop' ? [file] : [] },
      });
      return event;
    };

    root.dispatchEvent(dragEvent('dragenter'));
    await flushPromises();
    expect(wrapper.find('.pr-dropzone').exists()).toBe(true);

    root.dispatchEvent(dragEvent('drop'));
    await flushPromises();
    await flushPromises();

    expect(wrapper.find('.pr-dropzone').exists()).toBe(false);
    expect(ctx.getImageData).toHaveBeenCalledWith(0, 0, W, H);
    expect(ctx.putImageData).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('已自动识别四角');
    wrapper.unmount();
  });
});
