<template>
  <div class="pos">
    <div class="pos-bar">
      <h2 class="v-title">岗位设置</h2>
    </div>

    <el-alert v-if="error" type="error" :closable="false" show-icon class="pos-hint">{{ error }}</el-alert>

    <el-card class="pos-card" shadow="never">
      <template #header>
        <div class="pos-card-head">
          <span>岗位字典（人员花名册「岗位」口径）</span>
          <template v-if="canMgrWrite">
            <el-input v-model="newPosition" placeholder="新增岗位名" size="small" class="pos-inline-input" @keyup.enter="onAddPosition" />
            <el-button size="small" type="primary" plain :loading="posSaving" @click="onAddPosition">登记岗位</el-button>
          </template>
          <el-tag v-else type="info" effect="plain">只读（无 config:write 权限）</el-tag>
        </div>
      </template>
      <el-alert type="info" :closable="false" show-icon class="pos-hint"
        title="岗位字典统一人员花名册「岗位」字段的取值口径：登记后自动进入人员管理的岗位下拉；「改名」会级联更新花名册并逐人记录「岗位调整」异动；「停用」仅从新选项中隐藏，不影响已有数据。花名册在用但未登记的岗位会标记为「未登记」，可一键登记（弱约束：花名册始终接受自由输入，不强制走字典）。骑手花名册的「工作类型」是用工性质，不属于岗位。" />
      <el-table
        :data="positions" size="default"
        empty-text="尚无岗位，请先登记（人员管理中已使用的自由文本岗位会显示为「未登记」）"
      >
        <el-table-column label="岗位名" min-width="140" fixed="left">
          <template #default="{ row }">
            <span class="u-strong">{{ row.name }}</span>
            <el-tag v-if="!row.registered" size="small" type="warning" effect="plain" class="pos-dot">未登记</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="排序" width="120" align="center">
          <template #default="{ row }">
            <el-input-number v-if="row.registered" :model-value="row.sort" size="small" :min="0" :max="99999"
              :disabled="!canMgrWrite" controls-position="right" style="width: 92px"
              @change="(v) => savePosMeta(row, { sort: v })" />
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="在职人数" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.active_count ? 'primary' : 'info'" effect="plain" size="small">{{ row.active_count }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="涉及站点" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ posTeamText(row) }}</template>
        </el-table-column>
        <el-table-column label="启用" width="80" align="center">
          <template #default="{ row }">
            <el-switch v-if="row.registered" :model-value="row.enabled" :disabled="!canMgrWrite"
              @change="(v) => savePosMeta(row, { enabled: v })" />
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="备注" min-width="160">
          <template #default="{ row }">
            <el-input v-if="row.registered" :model-value="row.note" size="small" :disabled="!canMgrWrite"
              placeholder="备注（选填）" @change="(v) => savePosMeta(row, { note: v })" />
            <span v-else class="pos-hint-inline">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" align="center" width="130" fixed="right">
          <template #default="{ row }">
            <template v-if="row.registered">
              <el-tooltip content="重命名（级联更新花名册并逐人落异动）" placement="top">
                <el-button link type="primary" size="small" :disabled="!canMgrWrite" @click="onRenamePosition(row)">改名</el-button>
              </el-tooltip>
              <el-tooltip :content="row.active_count ? '仍有在职人员使用，禁止删除（请改用改名）' : '删除字典条目（不影响人员记录）'" placement="top">
                <el-button link type="danger" size="small" :disabled="!canMgrWrite || row.active_count > 0" @click="onDeletePosition(row)">删除</el-button>
              </el-tooltip>
            </template>
            <el-button v-else link type="primary" size="small" :disabled="!canMgrWrite" @click="onRegisterPosition(row)">登记</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { fetchOrgStructure, fetchPositions, createPosition, updatePosition, deletePosition, renamePosition } from '@shared/api/staff.js';
import { useAuthStore } from '@shared/stores/auth.js';

const auth = useAuthStore();
const canMgrWrite = computed(() => auth.hasPerm('config:write'));

const error = ref('');

/* ── 岗位设置：字典（position_dict）+ 花名册在职使用统计。
   每个操作即时保存（无草稿基线，无离开守卫）；
   改名走两级确认（输入新名 → 确认影响人数），结果含越权 skipped 提示。 ── */
const positions = ref([]);
const newPosition = ref('');
const posSaving = ref(false);

/* 涉及站点列的站点名映射（来自组织架构的站点目录；加载失败仅降级显示站点 ID） */
const teamNameOf = ref(new Map());
async function loadOrgTeams() {
  try {
    const r = await fetchOrgStructure();
    if (r && r.ok) teamNameOf.value = new Map((r.teams || []).map((t) => [String(t.id), t.name]));
  } catch {
    /* 站点目录不可用：涉及站点列回退显示 ID，不阻塞页面 */
  }
}
function posTeamText(row) {
  const arr = row.teams || [];
  if (!arr.length) return '—';
  return arr.map((t) => `${teamNameOf.value.get(String(t.id)) || t.id} ×${t.count}`).join('、');
}

async function loadPositions() {
  try {
    const r = await fetchPositions();
    if (r && r.ok) positions.value = r.rows || [];
  } catch (e) {
    error.value = e.message || '加载岗位字典失败';
  }
}

async function posRequest(fn, arg, successTip) {
  posSaving.value = true;
  try {
    const r = await fn(arg);
    if (r && r.ok) {
      if (successTip) ElMessage.success(successTip);
      await loadPositions();
      return r;
    }
    ElMessage.error((r && r.error) || '操作失败');
  } catch (e) {
    ElMessage.error(e.message || '操作失败');
  } finally {
    posSaving.value = false;
  }
  return null;
}

async function onAddPosition() {
  const name = newPosition.value.trim();
  if (!name) return;
  const r = await posRequest(createPosition, { name }, `岗位「${name}」已登记`);
  if (r) newPosition.value = '';
}

function onRegisterPosition(row) {
  return posRequest(createPosition, { name: row.name }, `岗位「${row.name}」已登记`);
}

function savePosMeta(row, patch) {
  return posRequest(updatePosition, { id: row.id, ...patch });
}

async function onRenamePosition(row) {
  let value;
  try {
    ({ value } = await ElMessageBox.prompt(
      `将岗位「${row.name}」重命名为（人员花名册将级联更新）：`,
      '岗位重命名',
      {
        confirmButtonText: '重命名', cancelButtonText: '取消',
        inputPattern: /\S/, inputErrorMessage: '新岗位名不能为空', inputValue: row.name,
      },
    ));
  } catch { return; }
  const to = String(value || '').trim();
  if (!to || to === row.name) return;
  try {
    await ElMessageBox.confirm(
      row.active_count > 0
        ? `将把 ${row.active_count} 名在职人员的岗位由「${row.name}」改为「${to}」，并逐人记录「岗位调整」异动（含离职记录）。确定继续？`
        : `「${row.name}」当前无在职人员引用，仅更新字典。确定继续？`,
      '确认重命名', { type: 'warning', confirmButtonText: '继续', cancelButtonText: '取消' },
    );
  } catch { return; }
  const r = await posRequest(renamePosition, { from: row.name, to });
  if (r) {
    ElMessage.success(`重命名完成：已更新 ${r.changed} 条花名册记录${r.registered ? `，字典已同步登记「${r.to}」` : ''}`);
    if (r.skipped > 0) {
      ElMessage.warning({ message: `另有 ${r.skipped} 条记录所在站点不在你的数据权限内，未修改（可请管理员处理）`, duration: 10000, showClose: true });
    }
  }
}

async function onDeletePosition(row) {
  try {
    await ElMessageBox.confirm(`删除岗位「${row.name}」？仅删除字典条目，不影响人员记录。`, '删除岗位',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' });
  } catch { return; }
  await posRequest(deletePosition, row.id, `岗位「${row.name}」已删除`);
}

onMounted(() => {
  loadPositions();
  loadOrgTeams();
});
</script>

<style scoped>
.pos { padding: var(--sp-20); height: 100%; display: flex; flex-direction: column; }
.pos-bar { display: flex; align-items: center; gap: var(--sp-12); margin-bottom: var(--sp-16); flex: none; }
.v-title { margin: 0; font-size: var(--el-font-size-extra-large); }
.pos-hint { color: var(--el-text-color-secondary); font-size: var(--el-font-size-small); }
.pos-bar + .pos-hint { margin-bottom: var(--sp-12); }
.pos-card { flex: 1; min-height: 0; overflow: auto; }
.pos-card-head { display: flex; align-items: center; gap: var(--sp-12); justify-content: space-between; flex-wrap: wrap; }
.pos-card .pos-hint { margin-bottom: var(--sp-12); }
.pos-inline-input { width: 160px; }
.pos-dot { padding: 0 var(--sp-4); margin-left: var(--sp-4); line-height: 1; }
.pos-hint-inline { color: var(--el-text-color-secondary); font-size: var(--el-font-size-small); }
.u-strong { font-weight: var(--fw-semibold); }
</style>
