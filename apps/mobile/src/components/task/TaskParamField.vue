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

    <view v-else-if="p.type === 'multi-team'">
      <view class="pf-selector" @click="openTeamPicker">
        <view class="selector-main">
          <text class="selector-value">{{ teamSummary }}</text>
          <text class="selector-sub">{{ selectedTeams.length ? '已选 ' + selectedTeams.length + ' 个站点' : (p.placeholder || '点击选择站点') }}</text>
        </view>
        <text class="selector-arrow">›</text>
      </view>

      <wd-popup
        v-model="teamPickerVisible"
        position="bottom"
        :z-index="20"
        :safe-area-inset-bottom="true"
        custom-style="border-radius: 24px 24px 0 0;"
      >
        <view class="picker-sheet">
          <view class="picker-head">
            <text class="picker-title">选择站点（可多选）</text>
            <text class="picker-close" @click="teamPickerVisible = false">×</text>
          </view>
          <view class="picker-search">
            <input v-model="teamKeyword" placeholder="搜索站点名称" />
          </view>
          <scroll-view class="picker-list" scroll-y>
            <wd-checkbox-group v-model="draftTeams" checked-color="#ff5000">
              <wd-checkbox
                v-for="tm in filteredTeams"
                :key="tm.id"
                :model-value="teamValue(tm)"
              >
                <view class="team-option">{{ tm.name }}</view>
              </wd-checkbox>
            </wd-checkbox-group>
            <view v-if="!filteredTeams.length" class="picker-empty">没有匹配的站点</view>
          </scroll-view>
          <view class="picker-foot">
            <view class="picker-btn clear" @click="clearTeams">清空</view>
            <view class="picker-btn cancel" @click="teamPickerVisible = false">取消</view>
            <view class="picker-btn ok" @click="confirmTeams">确定</view>
          </view>
        </view>
      </wd-popup>
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
import { computed, ref } from 'vue';

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
const teamPickerVisible = ref(false);
const teamKeyword = ref('');
const draftTeams = ref([]);

const filteredTeams = computed(() => {
  const key = String(teamKeyword.value || '').trim().toLowerCase();
  if (!key) return props.teams;
  return props.teams.filter((tm) => String(tm.name || '').toLowerCase().includes(key));
});

const teamSummary = computed(() => {
  const names = selectedTeams.value.map((v) => {
    const i = v.indexOf('=');
    return i >= 0 ? v.slice(i + 1) : v;
  }).filter(Boolean);
  if (!names.length) return '未选择';
  if (names.length <= 2) return names.join('、');
  return names.slice(0, 2).join('、') + ' 等 ' + names.length + ' 个';
});

function teamValue(tm) { return String(tm.id) + '=' + tm.name; }
function openTeamPicker() {
  draftTeams.value = selectedTeams.value.slice();
  teamKeyword.value = '';
  teamPickerVisible.value = true;
}
function confirmTeams() {
  emit('update:modelValue', draftTeams.value.join(','));
  teamPickerVisible.value = false;
}
function clearTeams() { draftTeams.value = []; }

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
  background: var(--paper); color: var(--ink-900); font-size: 16px;
}
.pf-textarea { min-height: 76px; line-height: 1.6; }
.pf-picker { display: flex; align-items: center; justify-content: space-between; }
.pf-picker-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pf-caret { color: var(--ink-300); font-size: 18px; line-height: 1; }
.pf-selector {
  display: flex; align-items: center; gap: 10px; margin-top: 9px;
  min-height: 52px; padding: 9px 12px; box-sizing: border-box;
  border: 1px solid var(--line); border-radius: 12px; background: var(--paper);
}
.selector-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.selector-value { font-size: 13.5px; font-weight: 600; color: var(--ink-900); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.selector-sub { font-size: 11px; color: var(--ink-300); }
.selector-arrow { color: var(--ink-300); font-size: 19px; }
.picker-sheet { background: var(--card); padding-bottom: env(safe-area-inset-bottom, 0px); }
.picker-head { display: flex; align-items: center; padding: 18px 20px 12px; }
.picker-title { flex: 1; font-size: 16px; font-weight: 800; }
.picker-close { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: var(--brand-50); color: var(--ink-500); font-size: 20px; line-height: 1; }
.picker-search { padding: 0 20px 10px; }
.picker-search input { height: 38px; padding: 0 12px; box-sizing: border-box; border: 1px solid var(--line); border-radius: 11px; background: var(--paper); font-size: 16px; }
.picker-list { height: 46vh; padding: 0 20px; box-sizing: border-box; }
.team-option { font-size: 13.5px; color: var(--ink-900); line-height: 1.5; }
.picker-empty { padding: 40px 0; text-align: center; color: var(--ink-300); font-size: 13px; }
.picker-foot { display: flex; gap: 8px; padding: 12px 20px 16px; border-top: 1px solid var(--line); }
.picker-btn { height: 42px; border-radius: 12px; display: grid; place-items: center; font-size: 13.5px; font-weight: 700; box-sizing: border-box; }
.picker-btn.clear { flex: 0 0 66px; background: var(--paper); border: 1px solid var(--line); color: var(--ink-500); }
.picker-btn.cancel { flex: 0 0 74px; background: var(--paper); border: 1px solid var(--line); color: var(--ink-700); }
.picker-btn.ok { flex: 1; background: var(--brand-500); color: #fff; }
.pf-range { display: flex; align-items: center; gap: 8px; }
.pf-range .pf-control { flex: 1; min-width: 0; }
.pf-sep { color: var(--ink-300); }
</style>
