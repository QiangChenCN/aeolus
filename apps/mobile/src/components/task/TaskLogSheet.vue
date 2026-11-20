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
          <view class="head-title">运行日志</view>
          <view class="head-sub">{{ run ? (run.name || run.task_id) : runId }} · {{ statusText }}</view>
        </view>
        <view class="head-close" @click="visible = false">×</view>
      </view>

      <view v-if="run && (run.error_kind || run.error_advice)" class="error-box">
        {{ run.error_advice || run.error_kind }}
      </view>

      <scroll-view class="log-body" scroll-y :scroll-top="scrollTop">
        <view v-if="lines.length" class="log-lines">
          <view v-for="(line, i) in lines" :key="i" class="log-line">{{ line }}</view>
        </view>
        <view v-else class="log-empty">暂无日志内容</view>
      </scroll-view>

      <view class="sheet-foot">
        <view class="foot-btn" @click="copyLog">复制日志</view>
        <view v-if="canStop" class="foot-btn danger" @click="stop">停止任务</view>
        <view class="foot-btn primary" @click="refresh">刷新</view>
      </view>
    </view>
  </wd-popup>
</template>

<script setup>
import { computed, onUnmounted, ref, watch, nextTick } from 'vue';
import { useToast } from 'wot-design-uni';
import { useAuthStore } from '@shared/stores/auth.js';
import { useTaskCenterStore } from '../../stores/task-center.js';

const store = useTaskCenterStore();
const auth = useAuthStore();
const toast = useToast();

const visible = ref(false);
const runId = ref('');
const scrollTop = ref(0);
let timer = null;

const run = computed(() => (runId.value ? store.runs[runId.value] || null : null));
const lines = computed(() => (run.value && run.value.lines) || []);
const statusText = computed(() => {
  const s = (run.value && run.value.status) || 'queued';
  const map = { running: '执行中', success: '成功', failed: '失败', stopped: '已停止', queued: '排队中', cancelled: '已取消' };
  return map[s] || s;
});
const canStop = computed(() => auth.hasPerm('task:run') && (run.value && run.value.status === 'running'));

function refresh() {
  if (!runId.value) return;
  store.loadLog(runId.value).catch(() => {});
}

watch(visible, (v) => {
  if (timer) { clearInterval(timer); timer = null; }
  if (!v) return;
  refresh();
  timer = setInterval(refresh, 1000);
});

watch(lines, async () => {
  await nextTick();
  scrollTop.value = 999999;
}, { deep: true });

onUnmounted(() => { if (timer) clearInterval(timer); });

function open(id) {
  if (!id) return;
  runId.value = id;
  visible.value = true;
}

async function copyLog() {
  if (!lines.value.length) { toast.show('暂无日志可复制'); return; }
  uni.setClipboardData({
    data: lines.value.join('\n'),
    success: () => toast.show('已复制日志'),
    fail: () => toast.show('复制失败'),
  });
}

async function stop() {
  if (!runId.value) return;
  try {
    await store.stopRun(runId.value);
    toast.show('已发送停止指令');
    setTimeout(refresh, 600);
  } catch (e) {
    toast.show(e.message || '停止失败');
  }
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
.error-box {
  margin: 12px 20px 0; padding: 10px 12px; border-radius: 12px;
  background: #fbedec; color: var(--danger); font-size: 12.5px; line-height: 1.6;
}
.log-body { height: 52vh; padding: 14px 20px; box-sizing: border-box; background: #241c18; }
.log-lines { display: flex; flex-direction: column; gap: 2px; }
.log-line {
  color: #f3e7de; font-size: 12px; line-height: 1.55;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  white-space: pre-wrap; word-break: break-all;
}
.log-empty { color: #9b8b82; font-size: 13px; text-align: center; padding-top: 40px; }
.sheet-foot { display: flex; gap: 10px; padding: 14px 20px 18px; border-top: 1px solid var(--line); }
.foot-btn {
  flex: 1; height: 42px; border-radius: 12px; display: grid; place-items: center;
  font-size: 13.5px; font-weight: 700; background: var(--paper);
  border: 1px solid var(--line); color: var(--ink-700);
}
.foot-btn.primary { color: #fff; background: var(--brand-500); border-color: var(--brand-500); }
.foot-btn.danger { color: var(--danger); border-color: #f3c4c0; background: #fbedec; }
</style>
