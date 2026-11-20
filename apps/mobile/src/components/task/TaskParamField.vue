<template>
  <view class="param-field">
    <view class="pf-label">
      <text>{{ p.label || p.flag }}</text>
      <text v-if="p.required" class="pf-required">*</text>
      <text v-if="p.placeholder && p.type !== 'multi-team'" class="pf-hint">{{ p.placeholder }}</text>
    </view>

    <wd-switch
      v-if="p.type === 'switch'"
      :model-value="!!modelValue"
      active-color="#ff5000"
      @change="onSwitch"
    />

    <picker
      v-else-if="p.type === 'select'"
      :range="options"
      range-key="label"
      @change="onPicker"
    >
      <view class="pf-control pf-picker">
        <text class="pf-picker-text">{{ selectedLabel }}</text>
        <text class="pf-caret">›</text>
      </view>
    </picker>

    <view v-else-if="p.type === 'multi-team'" class="pf-teams">
      <view
        v-for="tm in teams"
        :key="tm.id"
        class="pf-team-chip"
        :class="{ active: selectedTeams.includes(String(tm.id)) }"
        @click="toggleTeam(String(tm.id))"
      >{{ tm.name }}</view>
      <view v-if="!teams.length" class="pf-empty-hint">站点列表暂不可用</view>
    </view>

    <view v-else-if="p.type === 'daterange'" class="pf-range">
      <input class="pf-control" type="date" :value="rangeBegin" @input="onRangeBegin" />
      <text class="pf-sep">~</text>
      <input class="pf-control" type="date" :value="rangeEnd" @input="onRangeEnd" />
    </view>

    <input
      v-else-if="p.type === 'date'"
      class="pf-control"
      type="date"
      :value="modelValue || ''"
      @input="onInput"
    />

    <textarea
      v-else-if="p.type === 'textarea'"
      class="pf-control pf-textarea"
      :value="modelValue || ''"
      :placeholder="p.placeholder || '请输入'"
      @input="onInput"
    />

    <input
      v-else
      class="pf-control"
      :type="p.type === 'number' ? 'number' : 'text'"
      :value="modelValue == null ? '' : String(modelValue)"
      :placeholder="p.placeholder || '请输入'"
      @input="onInput"
    />
  </view>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  p: { type: Object, required: true },
  modelValue: { type: [String, Number, Boolean, Array], default: '' },
  task: { type: Object, default: () => ({}) },
  teams: { type: Array, default: () => [] },
});
const emit = defineEmits(['update:modelValue']);

const options = computed(() => {
  if (props.p.options_source === 'nodes' && Array.isArray(props.task.nodes)) {
    return props.task.nodes.map((n) => ({ value: n.id, label: n.name }));
  }
  return props.p.options || [];
});

const selectedLabel = computed(() => {
  const cur = props.modelValue;
  const hit = options.value.find((o) => String(o.value) === String(cur));
  return hit ? hit.label : (cur ? String(cur) : '请选择');
});

const selectedTeams = computed(() => {
  const v = props.modelValue;
  if (Array.isArray(v)) return v.map(String);
  return v ? String(v).split(',').filter(Boolean) : [];
});

const parts = computed(() => String(props.modelValue || '').split('~'));
const rangeBegin = computed(() => parts.value[0] || '');
const rangeEnd = computed(() => parts.value[1] || '');

function onSwitch(e) {
  if (e && typeof e === 'object') {
    emit('update:modelValue', !!(e.detail ? e.detail.value : e.value));
  } else {
    emit('update:modelValue', !!e);
  }
}
function onPicker(e) {
  const idx = Number((e && e.detail && e.detail.value) || 0);
  const o = options.value[idx];
  if (o) emit('update:modelValue', o.value);
}
function onInput(e) {
  emit('update:modelValue', (e && e.detail && e.detail.value) || '');
}
function onRangeBegin(e) {
  emit('update:modelValue', ((e && e.detail && e.detail.value) || '') + '~' + rangeEnd.value);
}
function onRangeEnd(e) {
  emit('update:modelValue', rangeBegin.value + '~' + ((e && e.detail && e.detail.value) || ''));
}
function toggleTeam(id) {
  const next = selectedTeams.value.slice();
  const i = next.indexOf(id);
  if (i >= 0) next.splice(i, 1);
  else next.push(id);
  emit('update:modelValue', next);
}
</script>

<style scoped>
.param-field { padding: 13px 0; }
.param-field + .param-field { border-top: 1px solid var(--line); }
.pf-label { display: flex; align-items: baseline; gap: 4px; font-size: 13.5px; font-weight: 600; color: var(--ink-900); }
.pf-required { color: var(--danger); }
.pf-hint { margin-left: auto; font-size: 11px; font-weight: 400; color: var(--ink-300); text-align: right; }
.pf-control {
  margin-top: 9px; width: 100%; min-height: 40px; box-sizing: border-box;
  padding: 9px 12px; border: 1px solid var(--line); border-radius: 12px;
  background: var(--paper); color: var(--ink-900); font-size: 14px;
}
.pf-textarea { min-height: 76px; line-height: 1.6; }
.pf-picker { display: flex; align-items: center; justify-content: space-between; }
.pf-picker-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pf-caret { color: var(--ink-300); font-size: 18px; line-height: 1; }
.pf-teams { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.pf-team-chip {
  padding: 6px 12px; border-radius: 999px; border: 1px solid var(--line);
  background: var(--card); color: var(--ink-500); font-size: 12.5px;
}
.pf-team-chip.active { background: var(--brand-50); border-color: var(--brand-500); color: var(--brand-600); font-weight: 600; }
.pf-empty-hint { color: var(--ink-300); font-size: 12px; }
.pf-range { display: flex; align-items: center; gap: 8px; }
.pf-range .pf-control { flex: 1; min-width: 0; }
.pf-sep { color: var(--ink-300); }
</style>
