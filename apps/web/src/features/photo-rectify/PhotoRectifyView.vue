<template>
  <div
    class="pr"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!-- 顶部：品牌色横幅 + 主操作，建立"本地处理、一步到位"的第一层级 -->
    <header class="pr-hero">
      <span class="pr-hero-glow" aria-hidden="true"></span>
      <div class="pr-hero-main">
        <div class="pr-eyebrow"><span class="pr-eyebrow-dot"></span>LOCAL · PRIVATE · INSTANT</div>
        <h1>照片矫正</h1>
        <p>身份证等证件照透视矫正，输出 1024×645 标准 PNG。原图全程只在浏览器本地处理，不上传、不落盘、不进日志。</p>
        <ul class="pr-features" aria-label="处理特性">
          <li><el-icon><MagicStick /></el-icon>自动识别四角</li>
          <li><el-icon><Aim /></el-icon>拖动即时微调</li>
          <li><el-icon><Download /></el-icon>标准 PNG 导出</li>
        </ul>
      </div>
      <div class="pr-hero-act">
        <input ref="fileInput" class="pr-hidden" type="file" accept="image/*" capture="environment" @change="onFileChange" />
        <el-button class="pr-upload" type="primary" :icon="Upload" @click="pickFile">选择 / 拍摄照片</el-button>
        <span class="pr-drop-hint">或将图片拖拽到页面任意位置</span>
        <span v-if="sourceName" class="pr-fname" :title="sourceName">
          <el-icon><Document /></el-icon>{{ sourceName }}
        </span>
      </div>
    </header>

    <!-- 分区标签：把横幅与下方内容在语义和视觉上切开 -->
    <div class="pr-section">
      <span class="pr-section-mark" aria-hidden="true"></span>
      <span class="pr-section-title">{{ ready ? 'WORKSPACE' : 'HOW IT WORKS' }}</span>
      <span class="pr-section-desc">{{ ready ? '识别 · 微调 · 导出' : '三步完成证件矫正' }}</span>
    </div>

    <el-alert v-if="notice" :title="notice" :type="noticeType" :closable="false" show-icon class="pr-notice" />

    <!-- 未选图：三步引导，填充空白并建立流程预期 -->
    <div v-if="!ready" class="pr-empty" aria-label="使用步骤">
      <div class="pr-empty-item">
        <span class="pr-empty-num">01</span>
        <div><strong>选择照片</strong><p>拍摄或选择一张证件照，支持常见图片格式</p></div>
      </div>
      <div class="pr-empty-item">
        <span class="pr-empty-num">02</span>
        <div><strong>核对四角</strong><p>自动识别后拖动圆点对齐证件边缘</p></div>
      </div>
      <div class="pr-empty-item">
        <span class="pr-empty-num">03</span>
        <div><strong>导出成品</strong><p>实时预览，一键下载标准尺寸 PNG</p></div>
      </div>
    </div>

    <div v-if="ready" class="pr-grid">
      <!-- 处理中：覆盖工作区的扫描/进度状态，让异步等待可感知 -->
      <div v-if="processing" class="pr-processing" role="status" aria-live="polite">
        <div class="pr-processing-card">
          <span class="pr-processing-scan" aria-hidden="true"></span>
          <span class="pr-processing-icon"><el-icon><MagicStick /></el-icon></span>
          <strong>{{ processingText }}</strong>
          <div class="pr-progress" aria-hidden="true"><i></i></div>
          <p>图像仅在浏览器本地处理，不会上传</p>
        </div>
      </div>

      <!-- 左：识别与调整 -->
      <section class="pr-card">
        <div class="pr-head">
          <span class="pr-step">01</span>
          <div class="pr-head-title">
            <h2>原图与四角</h2>
            <p>拖动圆点对齐证件边缘</p>
          </div>
          <span class="pr-head-badge"><el-icon><EditPen /></el-icon>可调整</span>
        </div>
        <CornersEditor
          :image-url="previewUrl"
          :image-width="imageWidth"
          :image-height="imageHeight"
          :corners="corners"
          @update:corners="onCorners"
        />
        <div class="pr-meta">
          <el-tag v-if="detectResult" size="small" :type="detectResult.ok ? (detectResult.warn ? 'warning' : 'success') : 'info'">
            {{ detectLabel }}
          </el-tag>
          <span class="pr-meta-sep" aria-hidden="true"></span>
          <span v-if="detectResult?.ok" class="pr-metric">最大内角偏差 <b>{{ detectResult.maxDeviation.toFixed(1) }}°</b></span>
          <span class="pr-metric">原图 <b>{{ imageWidth }}×{{ imageHeight }}</b></span>
        </div>
        <p class="pr-tip">
          <el-icon><InfoFilled /></el-icon>
          <span>已自动识别四角，可直接拖动微调（顺序 1 左上 → 2 右上 → 3 右下 → 4 左下），也可用方向键微调。</span>
        </p>
      </section>

      <!-- 右：矫正预览与导出 -->
      <section class="pr-card">
        <div class="pr-head">
          <span class="pr-step">02</span>
          <div class="pr-head-title">
            <h2>矫正预览</h2>
            <p>实时反映四角调整结果</p>
          </div>
          <el-tag size="small" type="success" class="pr-spec">1024 × 645 PNG</el-tag>
        </div>
        <div class="pr-canvas-wrap" :class="{ 'is-busy': !rectified }">
          <canvas ref="outputCanvas" class="pr-canvas" width="1024" height="645"></canvas>
          <span v-if="!rectified" class="pr-canvas-shine" aria-hidden="true"></span>
          <div v-if="!rectified" class="pr-canvas-empty">
            <el-icon><Picture /></el-icon>
            <span>调整四角后在此显示矫正结果</span>
          </div>
        </div>
        <div class="pr-actions">
          <span class="pr-cost"><el-icon><Timer /></el-icon>{{ rectified ? `本次计算 ${lastCost.toFixed(0)} ms` : '等待计算' }}</span>
          <el-button size="small" type="primary" :icon="Download" :disabled="!rectified" @click="download">下载 PNG</el-button>
          <el-button v-if="canSubmit" size="small" type="success" :disabled="!rectified" @click="confirm">确认并提交</el-button>
        </div>
      </section>
    </div>

    <!-- 拖拽上传：全页玻璃态遮罩，明确"松手即上传"的落点 -->
    <div v-if="dragOver" class="pr-dropzone" role="status">
      <div class="pr-dropzone-inner">
        <span class="pr-dropzone-icon"><el-icon><Upload /></el-icon></span>
        <strong>松开即可上传</strong>
        <p>支持 JPG / PNG / WebP · 最大 25MB · 仅在本地处理</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  Upload, Picture, Aim, EditPen, Download, InfoFilled, Timer, Document, MagicStick,
} from '@element-plus/icons-vue';
import CornersEditor from './components/CornersEditor.vue';
import {
  createRectifyEngine, defaultCorners, isValidQuad, OUTPUT_WIDTH, OUTPUT_HEIGHT,
} from './algorithms/index.ts';
import { hasRectifySubmit, submitRectifiedPng } from './submit.ts';

const fileInput = ref(null);
const outputCanvas = ref(null);
const engine = createRectifyEngine();

const sourceName = ref('');
const previewUrl = ref('');
const imageWidth = ref(0);
const imageHeight = ref(0);
const corners = ref([]);
const detectResult = ref(null);
const ready = ref(false);
const rectified = ref(false);
const lastCost = ref(0);
const notice = ref('');
const noticeType = ref('info');
const canSubmit = ref(hasRectifySubmit());
const dragOver = ref(false);
const processing = ref(false);
const processingText = ref('');

let bitmap = null;
let raf = 0;
let requestSeq = 0;
let dragDepth = 0;

const detectLabel = computed(() => {
  const r = detectResult.value;
  if (!r) return '尚未检测';
  if (!r.ok) return '检测失败，请手动定位';
  return r.warn ? '已检测，角度偏差较大请复核' : '已自动识别四角（圆角修复版）';
});

function pickFile() { fileInput.value?.click(); }

function resetState() {
  cancelAnimationFrame(raf);
  requestSeq++;
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  bitmap?.close?.();
  bitmap = null;
  previewUrl.value = '';
  sourceName.value = '';
  imageWidth.value = 0;
  imageHeight.value = 0;
  corners.value = [];
  detectResult.value = null;
  ready.value = false;
  rectified.value = false;
  lastCost.value = 0;
  notice.value = '';
  const ctx = outputCanvas.value?.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
}

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function onFileChange(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (file) void handleFile(file);
}

// 选图与拖放共用的入口：校验 → 解码 → 检测 → 矫正，全程驱动处理中状态。
async function handleFile(file) {
  if (!file.type.startsWith('image/')) { ElMessage.error('请选择图片文件'); return; }
  if (file.size > 25 * 1024 * 1024) { ElMessage.error('图片不能超过 25MB'); return; }
  processing.value = true;
  processingText.value = '正在读取图片…';
  resetState();
  try {
    bitmap = await decodeImage(file);
    const w = bitmap.width, h = bitmap.height;
    imageWidth.value = w; imageHeight.value = h;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('浏览器不支持 Canvas 2D');
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, w, h);
    previewUrl.value = URL.createObjectURL(file);
    sourceName.value = file.name;
    processingText.value = '正在识别证件四角…';
    await engine.init(imageData);
    ready.value = true;

    const detected = await engine.detect();
    detectResult.value = detected;
    corners.value = detected.ok ? detected.corners : defaultCorners({ width: w, height: h });
    if (!detected.ok) {
      notice.value = `${detected.reason}。已显示初始四角，请拖动到证件四角后确认。`;
      noticeType.value = 'warning';
    } else if (detected.warn) {
      notice.value = `已识别四角，但最大内角偏差 ${detected.maxDeviation.toFixed(1)}°，请拖动微调。`;
      noticeType.value = 'warning';
    }
    // 检测失败时绝不输出默认四角的矫正图（会是一张错误结果），等用户调整四角后再刷新。
    if (detected.ok) {
      processingText.value = '正在生成矫正结果…';
      await doRectify();
    }
  } catch (err) {
    notice.value = `图片处理失败：${err?.message || err}`;
    noticeType.value = 'error';
    ready.value = false;
  } finally {
    processing.value = false;
  }
}

function onDragEnter(event) {
  const types = event.dataTransfer?.types;
  if (types && !Array.from(types).includes('Files')) return;
  dragDepth++;
  dragOver.value = true;
}

function onDragOver(event) {
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dragOver.value = false;
}

function onDrop(event) {
  dragDepth = 0;
  dragOver.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (file) void handleFile(file);
}

function onCorners(next) {
  corners.value = next;
  scheduleRectify();
}

function scheduleRectify() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => { void doRectify(); });
}

async function doRectify() {
  if (!ready.value || corners.value.length !== 4 || !isValidQuad(corners.value)) return;
  const seq = ++requestSeq;
  const t0 = performance.now();
  try {
    const out = await engine.rectify(corners.value.map((p) => ({ x: p.x, y: p.y })));
    if (seq !== requestSeq || !outputCanvas.value) return;
    const ctx = outputCanvas.value.getContext('2d');
    ctx.putImageData(new ImageData(new Uint8ClampedArray(out.data), out.width, out.height), 0, 0);
    rectified.value = true;
    canSubmit.value = hasRectifySubmit();
    lastCost.value = performance.now() - t0;
  } catch (err) {
    if (seq !== requestSeq) return;
    rectified.value = false;
    notice.value = `矫正失败：${err?.message || err}`;
    noticeType.value = 'error';
  }
}

function toPngBlob() {
  return new Promise((resolve) => outputCanvas.value?.toBlob(resolve, 'image/png'));
}

function download() {
  toPngBlob().then((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `photo-rectified-${Date.now()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

async function confirm() {
  const blob = await toPngBlob();
  if (!blob) return;
  const handled = await submitRectifiedPng(blob, {
    sourceName: sourceName.value,
    corners: corners.value.map((p) => ({ x: p.x, y: p.y })),
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
  });
  if (handled) ElMessage.success('矫正结果已提交');
  else ElMessage.warning('提交通道已失效，请使用「下载 PNG」保存成品');
}

onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  engine.dispose();
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  bitmap?.close?.();
});
</script>

<style scoped>
.pr {
  width: 100%;
  padding: var(--sp-24);
  display: flex;
  flex-direction: column;
  gap: var(--sp-20);
  color: var(--el-text-color-primary);
}

/* ── 顶部品牌横幅：本地/私密/即时 的第一视觉层级 ───────────── */
.pr-hero {
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-24);
  padding: var(--sp-32) var(--sp-34);
  border-radius: 18px;
  overflow: hidden;
  background: linear-gradient(118deg, #FF7A2F 0%, var(--c-brand) 42%, var(--c-brand-dark) 100%);
  box-shadow: 0 14px 34px -12px rgba(255, 80, 0, .5);
  color: #fff;
  animation: pr-rise .5s var(--ease-apple) backwards;
}
/* 细网格纹理：科技质感但不抢文字，靠遮罩从右向左淡出 */
.pr-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  background-image:
    linear-gradient(rgba(255, 255, 255, .07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, .07) 1px, transparent 1px);
  background-size: 26px 26px;
  -webkit-mask-image: linear-gradient(90deg, #000, transparent 78%);
  mask-image: linear-gradient(90deg, #000, transparent 78%);
  pointer-events: none;
}
.pr-hero-glow {
  position: absolute;
  z-index: -1;
  top: -60%; right: -10%;
  width: 520px; height: 520px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, .42), rgba(255, 255, 255, 0) 68%);
  filter: blur(6px);
  pointer-events: none;
}
.pr-hero-main { min-width: 0; }
.pr-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-8);
  margin-bottom: var(--sp-10);
  padding: var(--sp-4) var(--sp-10);
  border: 1px solid rgba(255, 255, 255, .32);
  border-radius: var(--r-pill);
  background: rgba(255, 255, 255, .12);
  font-size: 11px;
  font-weight: var(--fw-semibold);
  letter-spacing: .12em;
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
}
.pr-eyebrow-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(255, 255, 255, .25);
}
.pr-hero h1 {
  margin: 0 0 var(--sp-10);
  font-size: 28px;
  line-height: var(--lh-tight);
  font-weight: var(--fw-bold);
  letter-spacing: .02em;
}
.pr-hero p {
  margin: 0;
  max-width: 660px;
  font-size: var(--el-font-size-base);
  line-height: var(--lh-relaxed);
  color: rgba(255, 255, 255, .88);
}
.pr-features {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-8);
  margin: var(--sp-18) 0 0;
  padding: 0;
  list-style: none;
}
.pr-features li {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-6);
  padding: var(--sp-6) var(--sp-12);
  border-radius: var(--r-pill);
  background: rgba(255, 255, 255, .16);
  font-size: 12px;
  font-weight: var(--fw-medium);
}
.pr-features .el-icon { font-size: 14px; }
.pr-hero-act {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--sp-10);
  flex: 0 0 auto;
}
.pr-hero :deep(.pr-upload) {
  --el-button-bg-color: #fff;
  --el-button-text-color: var(--c-brand);
  --el-button-border-color: #fff;
  --el-button-hover-bg-color: var(--c-brand-soft);
  --el-button-hover-text-color: var(--c-brand-dark);
  --el-button-hover-border-color: var(--c-brand-soft);
  min-height: var(--tap-min);
  padding: var(--sp-10) var(--sp-20);
  font-weight: var(--fw-semibold);
  box-shadow: 0 8px 20px -6px rgba(0, 0, 0, .35);
}
.pr-fname {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-6);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: rgba(255, 255, 255, .9);
}
.pr-drop-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, .82);
  letter-spacing: .02em;
}
.pr-hidden { display: none; }

/* ── 分区标签：横幅与工作区之间的视觉断点 ───────────────────── */
.pr-section {
  display: flex;
  align-items: center;
  gap: var(--sp-10);
  animation: pr-rise .5s var(--ease-apple) .06s backwards;
}
.pr-section-mark {
  width: 24px; height: 2px;
  border-radius: 2px;
  background: var(--c-brand);
}
.pr-section-title {
  font-size: 11px;
  font-weight: var(--fw-bold);
  letter-spacing: .16em;
  color: var(--c-brand);
}
.pr-section-desc {
  font-size: var(--el-font-size-extra-small);
  color: var(--el-text-color-secondary);
}

/* ── 进场动画 ───────────────────────────────────────────────── */
@keyframes pr-rise {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ── 提示条 ─────────────────────────────────────────────────── */
.pr-notice { border-radius: 12px; box-shadow: var(--el-box-shadow-light); }

/* ── 未选图：三步引导建立流程预期 ───────────────────────────── */
.pr-empty {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-16);
}
.pr-empty-item {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: flex-start;
  gap: var(--sp-16);
  padding: var(--sp-22);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 14px;
  background: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-light);
  transition: transform var(--dur-slow) var(--ease-apple), box-shadow var(--dur-slow) var(--ease-apple);
  animation: pr-rise .5s var(--ease-apple) backwards;
}
.pr-empty-item:nth-child(2) { animation-delay: .08s; }
.pr-empty-item:nth-child(3) { animation-delay: .16s; }
.pr-empty-item::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, var(--c-brand), var(--el-color-primary-light-3));
}
.pr-empty-item:hover {
  transform: translateY(-3px);
  box-shadow: 0 12px 28px -10px rgba(255, 80, 0, .28);
}
.pr-empty-num {
  flex: 0 0 auto;
  font-size: 40px;
  line-height: 1;
  font-weight: var(--fw-bold);
  letter-spacing: -.04em;
  color: var(--c-brand);
  opacity: .22;
}
.pr-empty-item strong {
  display: block;
  margin-bottom: var(--sp-6);
  font-size: var(--el-font-size-medium);
  font-weight: var(--fw-semibold);
}
.pr-empty-item p {
  margin: 0;
  font-size: var(--el-font-size-extra-small);
  line-height: var(--lh-normal);
  color: var(--el-text-color-secondary);
}

/* ── 选图后：识别/调整 + 预览/导出 双栏工作区 ───────────────── */
.pr-grid {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(0, 1fr);
  gap: var(--sp-20);
  align-items: start;
}
.pr-card {
  position: relative;
  overflow: hidden;
  padding: var(--sp-20);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 16px;
  background: var(--el-bg-color);
  box-shadow: 0 4px 18px -8px rgba(16, 24, 40, .14);
  transition: box-shadow var(--dur-slow) var(--ease-apple), transform var(--dur-slow) var(--ease-apple);
  animation: pr-rise .5s var(--ease-apple) backwards;
}
/* 卡片顶部一道品牌高光线，强化模块边界与精致感 */
.pr-card::before {
  content: '';
  position: absolute;
  left: var(--sp-20); right: var(--sp-20); top: 0;
  height: 2px;
  border-radius: 0 0 2px 2px;
  background: linear-gradient(90deg, var(--c-brand), var(--el-color-primary-light-7), transparent);
  opacity: .75;
}
.pr-grid .pr-card:nth-of-type(2) { animation-delay: .09s; }
.pr-card:hover { box-shadow: 0 12px 30px -12px rgba(16, 24, 40, .2); }
.pr-head {
  display: flex;
  align-items: center;
  gap: var(--sp-12);
  margin-bottom: var(--sp-16);
}
.pr-step {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px; height: 32px;
  border-radius: 10px;
  background: var(--c-brand-soft);
  color: var(--c-brand);
  font-size: 13px;
  font-weight: var(--fw-bold);
}
.pr-head-title { min-width: 0; flex: 1 1 auto; }
.pr-head-title h2 {
  margin: 0 0 2px;
  font-size: var(--el-font-size-medium);
  line-height: var(--lh-tight);
  font-weight: var(--fw-semibold);
  color: var(--el-text-color-primary);
}
.pr-head-title p {
  margin: 0;
  font-size: var(--el-font-size-extra-small);
  color: var(--el-text-color-secondary);
}
.pr-head-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-4);
  flex: 0 0 auto;
  padding: var(--sp-4) var(--sp-10);
  border-radius: var(--r-pill);
  background: var(--c-brand-soft);
  color: var(--c-brand);
  font-size: 12px;
  font-weight: var(--fw-medium);
}
.pr-spec { flex: 0 0 auto; }

/* ── 识别状态 / 原图尺寸指标条 ──────────────────────────────── */
.pr-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-10);
  margin-top: var(--sp-14);
  font-size: var(--el-font-size-extra-small);
  color: var(--el-text-color-secondary);
}
.pr-meta-sep { width: 1px; height: 12px; background: var(--el-border-color); }
.pr-metric b {
  margin-left: var(--sp-4);
  color: var(--el-text-color-primary);
  font-weight: var(--fw-semibold);
}
.pr-tip {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-8);
  margin: var(--sp-12) 0 0;
  padding: var(--sp-10) var(--sp-12);
  border-left: 3px solid var(--c-brand);
  border-radius: 0 8px 8px 0;
  background: var(--c-brand-soft);
  font-size: var(--el-font-size-extra-small);
  line-height: var(--lh-normal);
  color: var(--el-text-color-regular);
}
.pr-tip .el-icon { flex: 0 0 auto; margin-top: 2px; color: var(--c-brand); }

/* ── 矫正结果画布 ───────────────────────────────────────────── */
.pr-canvas-wrap {
  position: relative;
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  background: #14161A;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .06);
}
.pr-canvas { display: block; width: 100%; height: auto; }
.pr-canvas-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-10);
  font-size: var(--el-font-size-base);
  color: rgba(255, 255, 255, .72);
  pointer-events: none;
}
.pr-canvas-empty .el-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px; height: 48px;
  border-radius: 50%;
  background: rgba(255, 255, 255, .1);
  font-size: 22px;
}
/* 待生成结果的骨架扫光，暗示该区域是动态输出而非静态占位 */
.pr-canvas-shine {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(105deg, transparent 38%, rgba(255, 255, 255, .07) 50%, transparent 62%);
  background-size: 220% 100%;
  animation: pr-shine 2.2s linear infinite;
}
@keyframes pr-shine {
  from { background-position: 120% 0; }
  to { background-position: -120% 0; }
}

/* ── 操作栏：成本信息 / 下载 / 提交 ─────────────────────────── */
.pr-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--sp-8);
  margin-top: var(--sp-14);
}
.pr-cost {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-6);
  margin-right: auto;
  font-size: var(--el-font-size-extra-small);
  color: var(--el-text-color-secondary);
}
.pr-actions :deep(.el-button) { min-height: 32px; }

/* ── 处理中：毛玻璃遮罩 + 扫描线 + 不确定进度条 ─────────────── */
.pr-processing {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sp-20);
  border-radius: 16px;
  background: var(--c-glass-strong);
  -webkit-backdrop-filter: blur(12px) saturate(1.2);
  backdrop-filter: blur(12px) saturate(1.2);
  animation: pr-fade .2s var(--ease-apple);
}
.pr-processing-card {
  position: relative;
  overflow: hidden;
  width: min(360px, 100%);
  padding: var(--sp-28) var(--sp-24);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 16px;
  background: var(--el-bg-color);
  box-shadow: 0 18px 44px -16px rgba(255, 80, 0, .35);
  text-align: center;
}
.pr-processing-scan {
  position: absolute;
  left: 0; right: 0; top: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--c-brand), transparent);
  animation: pr-scan 1.6s linear infinite;
}
@keyframes pr-scan { from { top: 0; } to { top: 100%; } }
.pr-processing-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px; height: 48px;
  margin-bottom: var(--sp-12);
  border-radius: 14px;
  background: var(--c-brand-soft);
  color: var(--c-brand);
  font-size: 24px;
  animation: pr-pulse 1.4s ease-in-out infinite;
}
@keyframes pr-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.08); opacity: .75; }
}
.pr-processing-card strong {
  display: block;
  font-size: var(--el-font-size-medium);
  font-weight: var(--fw-semibold);
}
.pr-processing-card p {
  margin: 0;
  font-size: var(--el-font-size-extra-small);
  color: var(--el-text-color-secondary);
}
.pr-progress {
  height: 4px;
  margin: var(--sp-16) 0 var(--sp-10);
  border-radius: var(--r-pill);
  background: var(--c-brand-soft);
  overflow: hidden;
}
.pr-progress i {
  display: block;
  width: 34%; height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--c-brand), var(--el-color-primary-light-3));
  animation: pr-progress 1.2s ease-in-out infinite;
}
@keyframes pr-progress {
  from { transform: translateX(-110%); }
  to { transform: translateX(320%); }
}
@keyframes pr-fade { from { opacity: 0; } to { opacity: 1; } }

/* ── 拖拽上传：全页落点遮罩 ─────────────────────────────────── */
.pr-dropzone {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sp-24);
  background: rgba(16, 24, 40, .55);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  animation: pr-fade .18s var(--ease-apple);
}
.pr-dropzone-inner {
  width: min(520px, 100%);
  padding: var(--sp-48) var(--sp-32);
  border: 2px dashed var(--c-brand);
  border-radius: 24px;
  background: var(--c-glass-strong);
  box-shadow: 0 24px 60px -18px rgba(255, 80, 0, .45);
  text-align: center;
}
.pr-dropzone-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px; height: 72px;
  margin-bottom: var(--sp-16);
  border-radius: 20px;
  background: var(--c-brand-soft);
  color: var(--c-brand);
  font-size: 34px;
  animation: pr-float 1.6s ease-in-out infinite;
}
@keyframes pr-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
.pr-dropzone-inner strong {
  display: block;
  font-size: 20px;
  font-weight: var(--fw-bold);
}
.pr-dropzone-inner p {
  margin: var(--sp-8) 0 0;
  font-size: var(--el-font-size-extra-small);
  color: var(--el-text-color-secondary);
}

/* ── 响应式：宽屏双栏 → 平板单栏 → 手机纵向 ─────────────────── */
@media (max-width: 1080px) {
  .pr-grid { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  .pr { padding: var(--sp-16); gap: var(--sp-16); }
  .pr-hero { flex-direction: column; align-items: stretch; padding: var(--sp-24); }
  .pr-hero-act { flex-direction: row; align-items: center; justify-content: flex-start; flex-wrap: wrap; }
  .pr-hero :deep(.pr-upload) { width: 100%; }
  .pr-drop-hint { font-size: 11px; }
  .pr-fname { max-width: 100%; }
  .pr-empty { grid-template-columns: 1fr; }
  .pr-head { flex-wrap: wrap; }
}
@media (max-width: 480px) {
  .pr { padding: var(--sp-12); }
  .pr-hero { padding: var(--sp-20); border-radius: 14px; }
  .pr-hero h1 { font-size: 23px; }
  .pr-features li { font-size: 11px; padding: var(--sp-5) var(--sp-10); }
  .pr-card { padding: var(--sp-16); border-radius: 12px; }
  .pr-actions { justify-content: stretch; }
  .pr-actions :deep(.el-button) { flex: 1 1 auto; }
  .pr-cost { width: 100%; margin-bottom: var(--sp-4); }
  .pr-dropzone-inner { padding: var(--sp-32) var(--sp-20); }
  .pr-processing-card { padding: var(--sp-24) var(--sp-20); }
}

/* ── 无障碍：可见焦点环 + 尊重减少动效偏好 ──────────────────── */
.pr :deep(button:focus-visible),
.pr :deep([tabindex]:focus-visible) {
  outline: 3px solid var(--c-brand);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .pr *, .pr *::before, .pr *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
</style>
