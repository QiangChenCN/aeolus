import { describe, it, expect } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import CornersEditor from '../../../src/features/photo-rectify/components/CornersEditor.vue';
import { defaultCorners } from '../../../src/features/photo-rectify/algorithms/corners.ts';

const SIZE = { width: 1000, height: 600 };

function mountEditor() {
  return mount(CornersEditor, {
    props: {
      imageUrl: 'data:image/png;base64,',
      imageWidth: SIZE.width,
      imageHeight: SIZE.height,
      corners: defaultCorners(SIZE),
    },
  });
}

function firePointer(el, type, clientX, clientY) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'clientX', { value: clientX });
  Object.defineProperty(event, 'clientY', { value: clientY });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  el.dispatchEvent(event);
}

describe('CornersEditor 手动四角组件', () => {
  it('渲染 4 个角点与闭合四边形', () => {
    const wrapper = mountEditor();
    expect(wrapper.findAll('.ce-handle')).toHaveLength(4);
    expect(wrapper.find('polygon').attributes('points')).toBe('100,60 900,60 900,540 100,540');
  });

  it('拖动左上角会按显示比例换算成原图坐标并实时 emit', async () => {
    const wrapper = mountEditor();
    const stage = wrapper.find('.ce');
    stage.element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 300, right: 500, bottom: 300 });
    firePointer(wrapper.findAll('.ce-handle')[0].element, 'pointerdown', 100, 60);
    await nextTick();
    firePointer(stage.element, 'pointermove', 150, 90);
    await nextTick();
    const emitted = wrapper.emitted('update:corners');
    expect(emitted).toBeTruthy();
    expect(emitted[0][0][0]).toEqual({ x: 300, y: 180 });
    expect(emitted[0][0][1]).toEqual({ x: 900, y: 60 });
  });

  it('方向键可微调角点', async () => {
    const wrapper = mountEditor();
    await wrapper.findAll('.ce-handle')[2].trigger('keydown', { key: 'ArrowLeft', shiftKey: true });
    expect(wrapper.emitted('update:corners')[0][0][2]).toEqual({ x: 890, y: 540 });
  });
});
