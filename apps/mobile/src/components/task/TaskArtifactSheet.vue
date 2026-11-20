<template>
  <wd-popup
    v-model="visible"
    position="bottom"
    :safe-area-inset-bottom="true"
    custom-style="border-radius: 24px 24px 0 0;"
  >
    <view class="sheet">
      <view class="sheet-head">
        <view class="head-main">
          <view class="head-title">任务产物</view>
          <view class="head-sub">{{ task ? task.name : '' }}</view>
        </view>
        <view class="head-close" @click="visible = false">×</view>
      </view>

      <scroll-view class="file-body" scroll-y>
        <view v-if="loading" class="state-line">加载中…</view>
        <view v-else-if="!files.length" class="state-line">暂无产物文件</view>
        <view v-else class="file-list">
          <view v-for="f in files" :key="f.rel" class="file-row" @click="openFile(f)">
            <view class="file-ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
                <path d="M6 3.5h8L19 8v12.5H6z" stroke-linejoin="round" />
                <path d="M14 3.5V8h5" stroke-linejoin="round" />
              </svg>
            </view>
            <view class="file-main">
              <view class="file-name">{{ f.name || f.rel }}</view>
              <view class="file-meta">{{ f.type || '文件' }} · {{ sizeText(f.size) }} · {{ f.mtime || '' }}</view>
            </view>
            <text class="file-arrow">↗</text>
          </view>
        </view>
      </scroll-view>
    </view>
  </wd-popup>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useToast } from 'wot-design-uni';
import { useTaskCenterStore } from '../../stores/task-center.js';

const store = useTaskCenterStore();
const toast = useToast();

const visible = ref(false);
const loading = ref(false);
const files = ref([]);
const taskId = ref('');

const task = computed(() => (taskId.value ? store.taskById(taskId.value) : null));

function sizeText(n) {
  const v = Number(n || 0);
  if (!v) return '—';
  if (v < 1024) return v + ' B';
  if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
  return (v / 1024 / 1024).toFixed(1) + ' MB';
}

async function open(id) {
  if (!id) return;
  taskId.value = id;
  files.value = [];
  loading.value = true;
  visible.value = true;
  try {
    files.value = await store.loadArtifacts(id);
  } catch (e) {
    toast.show(e.message || '加载产物失败');
  } finally {
    loading.value = false;
  }
}

function openFile(f) {
  const url = store.artifactUrl(f.rel);
  if (typeof window !== 'undefined' && window.open) window.open(url, '_blank');
  else toast.show('当前环境暂不支持直接打开文件');
}

defineExpose({ open });
</script>

<style scoped>
.sheet { background: var(--card); padding-bottom: env(safe-area-inset-bottom, 0px); }
.sheet-head {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 20px 20px 14px; border-bottom: 1px solid var(--line);
}
.head-main { flex: 1; min-width: 0; }
.head-title { font-size: 17px; font-weight: 800; }
.head-sub { margin-top: 4px; font-size: 12px; color: var(--ink-500); }
.head-close {
  width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
  display: grid; place-items: center; background: var(--brand-50);
  color: var(--ink-500); font-size: 20px; line-height: 1;
}
.file-body { height: 56vh; padding: 0 20px; box-sizing: border-box; }
.state-line { padding: 48px 0; text-align: center; color: var(--ink-300); font-size: 14px; }
.file-list { padding: 8px 0; }
.file-row {
  display: flex; align-items: center; gap: 12px; padding: 12px 0;
  border-bottom: 1px solid var(--line);
}
.file-ico {
  width: 36px; height: 36px; border-radius: 11px; flex-shrink: 0;
  display: grid; place-items: center; background: var(--brand-50); color: var(--brand-600);
}
.file-ico svg { width: 18px; height: 18px; }
.file-main { flex: 1; min-width: 0; }
.file-name { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-meta { margin-top: 3px; font-size: 11.5px; color: var(--ink-500); }
.file-arrow { color: var(--ink-300); font-size: 16px; }
</style>
