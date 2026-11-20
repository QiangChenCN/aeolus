<template>
  <wd-popup
    v-model="visible"
    position="bottom"
    :safe-area-inset-bottom="true"
    custom-style="border-radius: 26px 26px 0 0;"
  >
    <view v-if="task" class="detail">
      <view class="detail-hero" :style="heroStyle">
        <view class="hero-row">
          <view class="hero-ico"><ListIcon :name="task.group || 'task'" /></view>
          <view class="hero-main">
            <view class="hero-name">{{ task.name }}</view>
            <view class="hero-sub">{{ groupName }} · {{ state.txt }}</view>
          </view>
          <view class="hero-close" @click="visible = false">×</view>
        </view>
        <view class="hero-desc">{{ task.desc || '暂无任务描述' }}</view>
      </view>

      <view class="detail-body">
        <view class="info-row">
          <text class="info-key">运行状态</text>
          <text class="info-value" :class="state.cls">{{ state.txt }}</text>
        </view>
        <view class="info-row">
          <text class="info-key">上次运行</text>
          <text class="info-value">{{ lastText || '尚无记录' }}</text>
        </view>
        <view v-if="task.missing && task.missing.length" class="missing-box">
          缺少前置产物：{{ task.missing.join('、') }}
        </view>

        <view class="action-grid">
          <view v-if="auth.hasPerm('task:run')" class="action-main" :class="{ disabled: disabled }" @click="onRun">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
            {{ running ? '执行中…' : '立即运行' }}
          </view>
          <view class="action-sub" @click="onConfig">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 3.5V2M12 22v-1.5M3.5 12H2M22 12h-1.5M6 6 5 5M19 19l-1-1M6 18l-1 1M19 5l-1 1" stroke-linecap="round" />
            </svg>
            参数配置
          </view>
          <view class="action-sub" @click="onArtifacts">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M3.5 7.5h6l2 2.5h9v10h-17z" stroke-linejoin="round" />
            </svg>
            产物文件
          </view>
        </view>
      </view>
    </view>
  </wd-popup>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useAuthStore } from '@shared/stores/auth.js';
import { useTaskCenterStore } from '../../stores/task-center.js';
import ListIcon from '../ListIcon.vue';

const emit = defineEmits(['run', 'config', 'artifacts']);
const store = useTaskCenterStore();
const auth = useAuthStore();

const visible = ref(false);
const task = ref(null);

const running = computed(() => !!(task.value && store.runningTaskId === task.value.id));
const disabled = computed(() => !!(task.value && (task.value.disabled || task.value.hidden)));

function lastRecord() {
  return task.value ? (store.history || []).find((x) => x.task_id === task.value.id) : null;
}
const lastText = computed(() => {
  const h = lastRecord();
  return h ? (h.start || '') + (h.duration ? ' · ' + h.duration + 's' : '') : '';
});
const statusKey = computed(() => {
  if (running.value) return 'running';
  const h = lastRecord();
  return h ? (h.error_kind || h.status || 'none') : 'none';
});
const state = computed(() => {
  const s = statusKey.value;
  if (s === 'running') return { txt: '执行中', cls: 'run' };
  if (s === 'success') return { txt: '已启用', cls: 'ok' };
  if (s === 'failed') return { txt: '上次失败', cls: 'fail' };
  if (s === 'queued') return { txt: '排队中', cls: 'run' };
  if (s === 'stopped') return { txt: '已暂停', cls: 'muted' };
  return { txt: '未运行', cls: 'muted' };
});
const groupName = computed(() => {
  if (!task.value) return '';
  const g = store.groupById(task.value.group);
  return (g && g.name) || task.value.group || '未分组';
});
function hexA(hex, a) {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return `rgba(255, 80, 0, ${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
const heroStyle = computed(() => {
  const g = task.value ? store.groupById(task.value.group) : null;
  const c = (g && g.color) || '#ff5000';
  return { background: `linear-gradient(145deg, ${c}, ${c}cc)` };
});

function open(t) { task.value = t; visible.value = true; }
function onRun() {
  if (running.value || disabled.value) return;
  emit('run', task.value);
  visible.value = false;
}
function onConfig() { emit('config', task.value); visible.value = false; }
function onArtifacts() { emit('artifacts', task.value); visible.value = false; }

defineExpose({ open });
</script>

<style scoped>
.detail { background: var(--card); padding-bottom: env(safe-area-inset-bottom, 0px); }
.detail-hero { padding: 22px 20px 20px; color: #fff; }
.hero-row { display: flex; align-items: flex-start; gap: 12px; }
.hero-ico {
  width: 46px; height: 46px; border-radius: 15px; flex-shrink: 0;
  display: grid; place-items: center; background: rgba(255,255,255,.22);
}
.hero-ico :deep(svg) { width: 22px; height: 22px; }
.hero-main { flex: 1; min-width: 0; }
.hero-name { font-size: 19px; font-weight: 800; line-height: 1.3; }
.hero-sub { margin-top: 5px; font-size: 12px; opacity: .88; }
.hero-close {
  width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
  display: grid; place-items: center; background: rgba(255,255,255,.22); font-size: 20px; line-height: 1;
}
.hero-desc { margin-top: 14px; font-size: 13px; line-height: 1.65; opacity: .92; }
.detail-body { padding: 6px 20px 22px; }
.info-row { display: flex; align-items: center; padding: 13px 0; border-bottom: 1px solid var(--line); }
.info-key { width: 76px; flex-shrink: 0; font-size: 12.5px; color: var(--ink-500); }
.info-value { font-size: 13px; font-weight: 600; color: var(--ink-900); }
.info-value.ok { color: #1e8e4b; }
.info-value.fail { color: var(--danger); }
.info-value.run { color: #b87400; }
.info-value.muted { color: var(--ink-500); }
.missing-box { margin-top: 12px; padding: 9px 11px; border-radius: 10px; background: #fff4e0; color: #b87400; font-size: 11.5px; line-height: 1.5; }
.action-grid { display: flex; flex-direction: column; gap: 10px; margin-top: 18px; }
.action-main {
  height: 48px; border-radius: 15px; color: #fff;
  display: flex; align-items: center; justify-content: center; gap: 7px;
  font-size: 15px; font-weight: 800;
  background: linear-gradient(180deg, var(--brand-500), var(--brand-600));
  box-shadow: 0 10px 20px -10px rgba(255,80,0,.6);
}
.action-main svg { width: 15px; height: 15px; }
.action-main.disabled { background: var(--line); color: var(--ink-300); box-shadow: none; }
.action-sub {
  height: 44px; border-radius: 14px; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center; gap: 7px;
  background: var(--paper); border: 1px solid var(--line); color: var(--ink-700);
  font-size: 13.5px; font-weight: 600;
}
.action-sub svg { width: 15px; height: 15px; }
</style>
