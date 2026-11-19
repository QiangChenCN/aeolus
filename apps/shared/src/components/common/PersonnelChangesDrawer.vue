<template>
  <el-drawer
    :model-value="visible" :title="'异动记录' + (targetName ? ' — ' + targetName : '')" size="520px"
    @update:model-value="(v) => $emit('update:visible', v)"
  >
    <div v-loading="loading">
      <el-alert v-if="loadError" type="error" :closable="false" show-icon class="pc-error">{{ loadError }}</el-alert>
      <el-timeline v-else-if="rows.length" class="pc-timeline">
        <el-timeline-item
          v-for="c in rows" :key="c.id" :timestamp="c.created_at" placement="top"
          :type="dotType(c.change_type)" :hollow="c.change_type === 'edit'"
        >
          <div class="pc-head">
            <el-tag size="small" :type="tagType(c.change_type)" effect="plain">{{ label(c.change_type) }}</el-tag>
            <span v-if="fieldLabel(c.field)" class="pc-field">{{ fieldLabel(c.field) }}</span>
          </div>
          <div v-if="showDiff(c)" class="pc-diff">
            <span class="pc-old">{{ displayValue(c.field, c.old_value) }}</span>
            <span class="pc-arrow">→</span>
            <span class="pc-new">{{ displayValue(c.field, c.new_value) }}</span>
          </div>
          <div v-if="c.note" class="pc-note">{{ c.note }}</div>
          <div class="pc-op">操作人：{{ c.operator || '—' }}</div>
        </el-timeline-item>
      </el-timeline>
      <el-empty v-else-if="!loading" description="暂无异动记录（调店/转岗/状态变更/资料修改将自动记录）" :image-size="80" />
      <div v-if="rows.length < total" class="pc-more">
        <el-button link type="primary" :loading="loading" @click="loadMore">加载更多（{{ rows.length }}/{{ total }}）</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
import { ref, watch } from 'vue';
import { fetchPersonnelChanges } from '../../api/personnel.js';

const props = defineProps({
  visible: { type: Boolean, default: false },
  targetType: { type: String, required: true }, // 'rider' | 'staff'
  targetId: { type: [Number, String], default: null },
  targetName: { type: String, default: '' },
});
defineEmits(['update:visible']);

const loading = ref(false);
const loadError = ref('');
const rows = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;

const CHANGE_LABELS = {
  create: '新增建档', delete: '删除', transfer: '调店',
  transfer_position: '岗位调整', status: '状态变更', edit: '资料修改',
};
const FIELD_LABELS = {
  name: '姓名', knight_id: '骑手ID', mobile: '手机号', team_id: '所属站点',
  work_type: '工作类型', position: '岗位', username: '关联账号',
  id_card_last4: '证件尾号', status: '状态', hired_at: '入职日期', left_at: '离职日期', note: '备注',
};
const STATUS_LABELS = { active: '在职', quit: '离职', suspended: '停用' };

function label(t) { return CHANGE_LABELS[t] || t || '—'; }
function fieldLabel(f) { return f ? (FIELD_LABELS[f] || f) : ''; }
function dotType(t) {
  return { create: 'primary', delete: 'danger', transfer: 'warning', transfer_position: 'warning', status: 'success', edit: 'info' }[t] || 'info';
}
function tagType(t) {
  return { create: 'success', delete: 'danger', transfer: 'warning', transfer_position: 'warning', status: 'success', edit: 'info' }[t] || 'info';
}

function displayValue(field, v) {
  const s = String(v ?? '');
  if (!s) return '—';
  if (field === 'team_id') return s.includes('|') ? s.split('|')[1] : s;
  if (field === 'status') return STATUS_LABELS[s] || s;
  return s;
}

function showDiff(c) {
  return ['transfer', 'transfer_position', 'status', 'edit'].includes(c.change_type) && c.field;
}

async function load(reset = true) {
  if (!props.targetId) { rows.value = []; total.value = 0; return; }
  loading.value = true;
  loadError.value = '';
  try {
    const res = await fetchPersonnelChanges({
      targetType: props.targetType, targetId: props.targetId,
      page: page.value, pageSize,
    });
    if (res && res.ok) {
      rows.value = reset ? (res.rows || []) : rows.value.concat(res.rows || []);
      total.value = res.total || 0;
    } else {
      loadError.value = (res && res.error) || '异动记录加载失败';
    }
  } catch (e) {
    loadError.value = e.message || '异动记录加载失败';
  } finally { loading.value = false; }
}

function loadMore() { page.value += 1; load(false); }

watch(
  () => [props.visible, props.targetId],
  ([v]) => {
    if (v) { page.value = 1; rows.value = []; load(true); }
  },
  { immediate: true },
);
</script>

<style scoped>
.pc-timeline { padding: var(--sp-8) var(--sp-4) 0 var(--sp-4); }
.pc-error { margin-bottom: var(--sp-12); }
.pc-head { display: flex; align-items: center; gap: var(--sp-8); margin-bottom: var(--sp-4); }
.pc-field { font-size: 12px; color: var(--el-text-color-secondary); }
.pc-diff { font-size: 13px; margin-bottom: var(--sp-2); }
.pc-old { color: var(--el-text-color-secondary); text-decoration: line-through; margin-right: var(--sp-8); }
.pc-arrow { margin-right: var(--sp-8); color: var(--el-text-color-secondary); }
.pc-new { color: var(--el-color-primary); font-weight: var(--fw-semibold); }
.pc-note { font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: var(--sp-2); }
.pc-op { font-size: 12px; color: var(--el-text-color-placeholder); }
.pc-more { text-align: center; padding: var(--sp-12) 0; }
</style>
