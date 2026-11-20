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
          <view class="head-title">运行记录</view>
          <view class="head-sub">最近 {{ rows.length }} 次手动任务运行</view>
        </view>
        <view class="head-close" @click="visible = false">×</view>
      </view>

      <scroll-view class="history-body" scroll-y>
        <view v-if="!rows.length" class="history-empty">暂无运行记录</view>
        <view v-for="r in rows" :key="r.run_id" class="history-row" @click="onOpen(r)">
          <view class="h-mark" :class="r.cls"></view>
          <view class="h-main">
            <view class="h-name">{{ r.name }}</view>
            <view class="h-sub">{{ r.start }} · {{ r.trigger }}</view>
          </view>
          <view class="h-result" :class="r.cls">{{ r.result }}</view>
          <view v-if="auth.hasPerm('task:run')" class="h-delete" @click.stop="onDelete(r)">×</view>
        </view>
      </scroll-view>
    </view>
  </wd-popup>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useToast } from 'wot-design-uni';
import { useAuthStore } from '@shared/stores/auth.js';
import { useTaskCenterStore } from '../../stores/task-center.js';

const emit = defineEmits(['open-log']);
const store = useTaskCenterStore();
const auth = useAuthStore();
const toast = useToast();

const visible = ref(false);

const rows = computed(() => (store.history || []).map((h) => {
  const t = store.taskById(h.task_id);
  const st = h.error_kind || h.status || '';
  let result = '—', cls = 'muted';
  if (st === 'success') { result = '成功'; cls = 'ok'; }
  else if (st === 'failed') { result = '失败'; cls = 'fail'; }
  else if (st === 'running') { result = '执行中'; cls = 'run'; }
  else if (st === 'queued') { result = '排队中'; cls = 'run'; }
  else if (st === 'stopped') { result = '已停止'; cls = 'muted'; }
  return {
    run_id: h.run_id,
    name: (t && t.name) || h.name || h.task_id,
    trigger: h.trigger || '—',
    start: h.start ? String(h.start).replace('T', ' ').slice(5, 19) : '—',
    result,
    cls,
  };
}));

function open() { visible.value = true; }
function onOpen(r) {
  if (!r.run_id) return;
  emit('open-log', r.run_id);
  visible.value = false;
}
function onDelete(r) {
  if (!r.run_id) return;
  uni.showModal({
    title: '删除运行记录',
    content: `确定删除「${r.name}」这条记录吗？日志文件将一并删除。`,
    confirmText: '删除',
    cancelText: '取消',
    success: async (res) => {
      if (!res.confirm) return;
      try {
        await store.deleteRun(r.run_id);
        toast.show('已删除');
      } catch (e) {
        toast.show(e.message || '删除失败');
      }
    },
  });
}

defineExpose({ open });
</script>

<style scoped>
.sheet { background: var(--card); padding-bottom: env(safe-area-inset-bottom, 0px); }
.sheet-head { display: flex; align-items: flex-start; gap: 12px; padding: 20px 20px 14px; border-bottom: 1px solid var(--line); }
.head-main { flex: 1; min-width: 0; }
.head-title { font-size: 17px; font-weight: 800; }
.head-sub { margin-top: 4px; font-size: 12px; color: var(--ink-500); }
.head-close { width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; background: var(--brand-50); color: var(--ink-500); font-size: 20px; line-height: 1; }
.history-body { height: 62vh; padding: 8px 20px; box-sizing: border-box; }
.history-empty { padding: 60px 0; text-align: center; color: var(--ink-300); font-size: 14px; }
.history-row { display: flex; align-items: center; gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.h-mark { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; background: var(--ink-300); }
.h-mark.ok { background: #17753E; }
.h-mark.fail { background: var(--danger); }
.h-mark.run { background: #8A5200; }
.h-main { flex: 1; min-width: 0; }
.h-name { font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.h-sub { margin-top: 3px; font-size: 11px; color: var(--ink-500); }
.h-result { font-size: 11px; font-weight: 700; color: var(--ink-500); flex-shrink: 0; }
.h-result.ok { color: #17753E; }
.h-result.fail { color: var(--danger); }
.h-result.run { color: #8A5200; }
.h-delete { width: 22px; height: 22px; display: grid; place-items: center; color: var(--ink-300); font-size: 17px; flex-shrink: 0; }
</style>
