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
          <view class="head-title">{{ task ? task.name : '任务配置' }}</view>
          <view class="head-sub">调整本次运行参数，运行后自动恢复默认</view>
        </view>
        <view class="head-close" @click="visible = false">×</view>
      </view>

      <scroll-view class="sheet-body" scroll-y>
        <TaskParamField
          v-for="p in params"
          :key="p.flag"
          v-model="form[p.flag]"
          :p="p"
          :task="task || {}"
          :teams="store.teams"
        />
        <view v-if="!params.length" class="no-param">这个任务没有可配置的参数</view>
      </scroll-view>

      <view class="sheet-foot">
        <view class="btn-reset" @click="reset">恢复默认</view>
        <view class="btn-save" @click="save">保存配置</view>
      </view>
    </view>
  </wd-popup>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useToast } from 'wot-design-uni';
import { useTaskCenterStore } from '../../stores/task-center.js';
import TaskParamField from './TaskParamField.vue';

const store = useTaskCenterStore();
const toast = useToast();

const visible = ref(false);
const task = ref(null);
const form = ref({});

const params = computed(() =>
  ((task.value && task.value.params) || []).filter((p) => p.flag !== '--begin' && p.flag !== '--end'));

function build() {
  const t = task.value;
  if (!t) return;
  const f = {};
  (t.params || []).forEach((p) => {
    if (p.flag === '--begin' || p.flag === '--end') return;
    let v = store.argValue(t.id, p.flag, p.default);
    if (p.type === 'switch') v = !!v;
    else if (p.type === 'multi-team') v = v ? String(v).split(',').filter(Boolean) : [];
    else v = v == null ? '' : String(v);
    f[p.flag] = v;
  });
  form.value = f;
}

function open(taskId) {
  const t = store.taskById(taskId);
  if (!t) return;
  task.value = t;
  build();
  visible.value = true;
}

function reset() {
  build();
  toast.show('已恢复默认（未保存）');
}

function save() {
  const t = task.value;
  if (!t) return;
  const next = {};
  params.value.forEach((p) => {
    let v = form.value[p.flag];
    if (p.type === 'multi-team') v = (v || []).join(',');
    else if (p.type === 'switch') v = !!v;
    next[p.flag] = v;
  });
  store.saveArgs(t.id, next);
  toast.show('已保存配置');
  visible.value = false;
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
.head-title { font-size: 17px; font-weight: 800; color: var(--ink-900); }
.head-sub { margin-top: 4px; font-size: 12px; color: var(--ink-500); }
.head-close {
  width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
  display: grid; place-items: center; background: var(--brand-50);
  color: var(--ink-500); font-size: 20px; line-height: 1;
}
.sheet-body { max-height: 52vh; padding: 0 20px; box-sizing: border-box; }
.no-param { padding: 48px 0; text-align: center; color: var(--ink-300); font-size: 14px; }
.sheet-foot { display: flex; gap: 12px; padding: 14px 20px 18px; border-top: 1px solid var(--line); }
.btn-reset, .btn-save {
  height: 44px; border-radius: 14px; display: grid; place-items: center;
  font-size: 14.5px; font-weight: 700;
}
.btn-reset { flex: 0 0 108px; background: var(--paper); border: 1px solid var(--line); color: var(--ink-700); }
.btn-save {
  flex: 1; color: #fff;
  background: linear-gradient(180deg, var(--brand-500), var(--brand-600));
  box-shadow: 0 8px 18px -8px rgba(255, 80, 0, .55);
}
</style>
