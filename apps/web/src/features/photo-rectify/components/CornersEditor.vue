<template>
  <div
    ref="stage"
    class="ce"
    :style="{ aspectRatio: `${imageWidth} / ${imageHeight}` }"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
  >
    <img class="ce-img" :src="imageUrl" alt="待矫正的原图" draggable="false" />
    <svg class="ce-svg" :viewBox="`0 0 ${imageWidth} ${imageHeight}`" preserveAspectRatio="none" aria-hidden="true">
      <polygon :points="polygonPoints" class="ce-poly" />
      <line
        v-for="(p, i) in corners"
        :key="`cross-${i}`"
        :x1="p.x - crossSize" :y1="p.y"
        :x2="p.x + crossSize" :y2="p.y"
        class="ce-cross"
      />
      <line
        v-for="(p, i) in corners"
        :key="`crossv-${i}`"
        :x1="p.x" :y1="p.y - crossSize"
        :x2="p.x" :y2="p.y + crossSize"
        class="ce-cross"
      />
    </svg>
    <button
      v-for="(p, i) in corners"
      :key="`handle-${i}`"
      class="ce-handle"
      :class="{ 'is-active': dragging === i }"
      :style="{ left: `${p.x / imageWidth * 100}%`, top: `${p.y / imageHeight * 100}%` }"
      :aria-label="`拖动${labels[i]}`"
      type="button"
      @pointerdown="startDrag($event, i)"
      @keydown="nudge($event, i)"
    >{{ i + 1 }}</button>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { moveCorner } from '../algorithms/corners.ts';

const props = defineProps({
  imageUrl: { type: String, required: true },
  imageWidth: { type: Number, required: true },
  imageHeight: { type: Number, required: true },
  corners: { type: Array, required: true },
});
const emit = defineEmits(['update:corners']);

const labels = ['左上角', '右上角', '右下角', '左下角'];
const stage = ref(null);
const dragging = ref(-1);
const size = { width: props.imageWidth, height: props.imageHeight };
const crossSize = Math.max(props.imageWidth, props.imageHeight) * 0.012;
const polygonPoints = computed(() => props.corners.map((p) => `${p.x},${p.y}`).join(' '));

function clientToImage(event) {
  const rect = stage.value.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / rect.width * props.imageWidth,
    y: (event.clientY - rect.top) / rect.height * props.imageHeight,
  };
}

function startDrag(event, index) {
  event.preventDefault();
  dragging.value = index;
  try { stage.value?.setPointerCapture(event.pointerId); } catch { /* jsdom / 老浏览器忽略 */ }
}

function onMove(event) {
  if (dragging.value < 0) return;
  const next = moveCorner(props.corners, dragging.value, clientToImage(event), size);
  emit('update:corners', next);
}

function onUp() { dragging.value = -1; }

function nudge(event, index) {
  const step = event.shiftKey ? 10 : 2;
  const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
  if (!delta) return;
  event.preventDefault();
  const p = props.corners[index];
  emit('update:corners', moveCorner(props.corners, index, { x: p.x + delta[0], y: p.y + delta[1] }, size));
}
</script>

<style scoped>
.ce {
  position: relative;
  width: 100%;
  max-height: 62vh;
  margin: 0 auto;
  overflow: hidden;
  border-radius: 12px;
  background: #14161A;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .06);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.ce-img, .ce-svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.ce-img { object-fit: fill; pointer-events: none; }
.ce-svg { pointer-events: none; }
.ce-poly {
  fill: rgba(255, 80, 0, .1);
  stroke: var(--c-brand);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
  stroke-dasharray: 7 5;
  stroke-linejoin: round;
}
.ce-cross {
  stroke: rgba(255, 255, 255, .75);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.ce-handle {
  position: absolute;
  width: 28px; height: 28px;
  margin: -14px 0 0 -14px;
  border: 2px solid #fff;
  border-radius: 50%;
  padding: 0;
  background: var(--c-brand);
  color: #fff;
  font-size: 12px;
  font-weight: var(--fw-bold);
  line-height: 24px;
  text-align: center;
  cursor: grab;
  touch-action: none;
  box-shadow: 0 2px 10px rgba(0, 0, 0, .5), 0 0 0 3px rgba(255, 80, 0, .28);
  transition: transform var(--dur-fast) var(--ease-apple), background var(--dur-fast) var(--ease-apple), box-shadow var(--dur-fast) var(--ease-apple);
}
.ce-handle:hover { transform: scale(1.1); box-shadow: 0 3px 14px rgba(0, 0, 0, .55), 0 0 0 5px rgba(255, 80, 0, .34); }
.ce-handle.is-active {
  cursor: grabbing;
  background: var(--c-brand-dark);
  transform: scale(1.18);
  box-shadow: 0 4px 16px rgba(0, 0, 0, .6), 0 0 0 6px rgba(255, 80, 0, .4);
}
.ce-handle:focus-visible { outline: 3px solid #fff; outline-offset: 3px; }

/* 移动端：放大手柄与命中区域，保证手指可精确拖动 */
@media (max-width: 760px) {
  .ce-handle { width: 36px; height: 36px; margin: -18px 0 0 -18px; line-height: 32px; font-size: 14px; }
}
@media (prefers-reduced-motion: reduce) {
  .ce-handle { transition: none; }
}
</style>
