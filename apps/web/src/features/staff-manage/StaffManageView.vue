<template>
  <div class="sm">
    <div class="sm-bar">
      <h2 class="v-title">人员管理</h2>
      <el-select v-model="statusSel" class="sm-sel" placeholder="状态" clearable>
        <el-option label="全部状态" value="" />
        <el-option label="在职" value="active" />
        <el-option label="离职" value="quit" />
        <el-option label="停用" value="suspended" />
      </el-select>
      <el-select v-model="teamSel" class="sm-sel" placeholder="站点" clearable filterable>
        <el-option label="全部站点" value="" />
        <el-option v-for="t in teamOptions" :key="t.id" :label="t.name" :value="String(t.id)" />
      </el-select>
      <el-input
        v-model="keyword" class="sm-search" placeholder="搜索姓名 / 手机号 / 岗位 / 账号 / 备注" clearable
        :prefix-icon="Search" @keyup.enter="reload"
      />
      <el-button @click="reload">查询</el-button>
      <span class="sp" />
      <el-button v-if="canWrite" type="primary" @click="openCreate">
        <el-icon><Plus /></el-icon> 新增人员
      </el-button>
    </div>

    <el-alert v-if="error" type="error" :closable="false" show-icon class="sm-hint">{{ error }}</el-alert>

    <el-card class="sm-table-card" shadow="never">
      <el-table
        v-loading="loading" :data="rows" stripe border size="small" class="sm-table" height="100%"
        empty-text="人员花名册暂无记录（可手动新增，骑手请到「骑手管理」维护）"
      >
        <el-table-column prop="name" label="姓名" min-width="100" align="center" show-overflow-tooltip />
        <el-table-column prop="mobile" label="手机号" min-width="120" align="center" show-overflow-tooltip />
        <el-table-column prop="team_name" label="所属站点" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.team_name || '总部 / 不限站点' }}</template>
        </el-table-column>
        <el-table-column prop="position" label="岗位" min-width="110" align="center" show-overflow-tooltip />
        <el-table-column prop="username" label="关联账号" min-width="110" align="center" show-overflow-tooltip />
        <el-table-column prop="id_card_last4" label="证件尾号" min-width="85" align="center" />
        <el-table-column label="状态" min-width="80" align="center">
          <template #default="{ row }">
            <span class="sm-tag" :class="'is-' + row.status">{{ statusLabel(row.status) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="入职日期" min-width="100" align="center">
          <template #default="{ row }">{{ row.hired_at || '—' }}</template>
        </el-table-column>
        <el-table-column label="离职日期" min-width="100" align="center">
          <template #default="{ row }">{{ row.left_at || '—' }}</template>
        </el-table-column>
        <el-table-column prop="note" label="备注" min-width="160" show-overflow-tooltip />
        <el-table-column label="更新时间" min-width="150" align="center" show-overflow-tooltip>
          <template #default="{ row }">{{ row.updated_at || '—' }}</template>
        </el-table-column>
        <el-table-column v-if="canWrite" label="操作" width="170" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button link type="info" size="small" @click="openChanges(row)">异动</el-button>
            <el-button link type="danger" size="small" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="sm-pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :page-sizes="[25, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @current-change="load"
          @size-change="() => { page = 1; load(); }"
        />
      </div>
    </el-card>

    <el-dialog v-model="dlg" :title="form.id ? '编辑人员' : '新增人员'" width="560px" destroy-on-close>
      <el-form :model="form" label-width="90px">
        <el-form-item label="姓名" required>
          <el-input v-model="form.name" placeholder="人员姓名" maxlength="30" />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="form.mobile" placeholder="手机号" maxlength="20" />
        </el-form-item>
        <el-form-item label="所属站点">
          <el-select v-model="form.team_id" placeholder="选择站点（可留空表示总部/不限）" clearable filterable style="width: 100%">
            <el-option v-for="t in teamOptions" :key="t.id" :label="t.name" :value="String(t.id)" />
          </el-select>
        </el-form-item>
        <el-form-item label="岗位">
          <el-select v-model="form.position" placeholder="选择或输入岗位" filterable allow-create default-first-option clearable style="width: 100%">
            <el-option v-for="p in positionOptions" :key="p" :label="p" :value="p" />
          </el-select>
        </el-form-item>
        <el-form-item label="证件尾号">
          <el-input v-model="form.id_card_last4" placeholder="身份证后 4 位（可选，脱敏存档）" maxlength="4" />
        </el-form-item>
        <el-form-item label="关联账号">
          <el-input v-model="form.username" placeholder="RBAC 登录账号名（可留空；账号管理在「系统设置→权限管理」）" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status" style="width: 100%">
            <el-option label="在职" value="active" />
            <el-option label="离职" value="quit" />
            <el-option label="停用" value="suspended" />
          </el-select>
        </el-form-item>
        <el-form-item label="入职日期">
          <el-date-picker v-model="form.hired_at" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width: 100%" />
        </el-form-item>
        <el-form-item v-if="form.status !== 'active'" label="离职日期">
          <el-date-picker v-model="form.left_at" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="2" maxlength="200" placeholder="备注（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>

    <PersonnelChangesDrawer
      v-model:visible="changesVisible"
      target-type="staff"
      :target-id="changesTarget.id"
      :target-name="changesTarget.name"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Plus } from '@element-plus/icons-vue';
import { fetchStaff, createStaff, updateStaff, deleteStaff, fetchPositions } from '../../api/staff.js';
import { fetchTeams } from '../../api/dashboards.js';
import { useAuthStore } from '../../stores/auth.js';
import PersonnelChangesDrawer from '../personnel/PersonnelChangesDrawer.vue';

const auth = useAuthStore();
const canWrite = computed(() => auth.hasPerm('config:write'));

const loading = ref(false);
const error = ref('');
const rows = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(50);

const statusSel = ref('');
const teamSel = ref('');
const keyword = ref('');

const teamsAll = ref([]);
const teamOptions = computed(() => teamsAll.value);
/* 岗位选项：岗位字典（启用项 + 在职在用的未登记项）；字典不可用时回退常见岗位。
   allow-create 保留自由输入（花名册侧弱约束，新值可在组织架构 → 岗位设置登记）。 */
const positionOptions = ref(['站长', '副站长', '调度', '运营', '人事', '其他']);

const dlg = ref(false);
const saving = ref(false);
const form = reactive({ id: null, name: '', mobile: '', team_id: '', position: '', username: '', id_card_last4: '', status: 'active', hired_at: '', left_at: '', note: '' });

const changesVisible = ref(false);
const changesTarget = reactive({ id: null, name: '' });
function openChanges(row) {
  changesTarget.id = row.id;
  changesTarget.name = row.name;
  changesVisible.value = true;
}

function emptyForm() {
  Object.assign(form, { id: null, name: '', mobile: '', team_id: '', position: '', username: '', id_card_last4: '', status: 'active', hired_at: '', left_at: '', note: '' });
}

async function loadTeams() {
  try {
    const t = await fetchTeams();
    teamsAll.value = (t && t.teams) || [];
  } catch { /* 站点目录失败不阻塞人员列表 */ }
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await fetchStaff({
      keyword: keyword.value.trim(), team: teamSel.value, status: statusSel.value,
      page: page.value, pageSize: pageSize.value,
    });
    if (res && res.ok) {
      rows.value = res.rows || [];
      total.value = res.total || 0;
    } else {
      error.value = (res && res.error) || '加载失败';
      rows.value = [];
      total.value = 0;
    }
  } catch (e) {
    error.value = e.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

function reload() { page.value = 1; load(); }

function statusLabel(s) {
  return { active: '在职', quit: '离职', suspended: '停用' }[s] || s || '—';
}

function openCreate() {
  emptyForm();
  if (teamSel.value) form.team_id = teamSel.value;
  dlg.value = true;
}

function openEdit(row) {
  Object.assign(form, {
    id: row.id, name: row.name, mobile: row.mobile || '', team_id: row.team_id || '',
    position: row.position || '', username: row.username || '', id_card_last4: row.id_card_last4 || '',
    status: row.status || 'active', hired_at: row.hired_at || '', left_at: row.left_at || '', note: row.note || '',
  });
  dlg.value = true;
}

async function onSave() {
  if (!form.name.trim()) { ElMessage.warning('姓名不能为空'); return; }
  saving.value = true;
  try {
    const payload = { ...form };
    if (!payload.left_at) payload.left_at = '';
    const res = payload.id ? await updateStaff(payload) : await createStaff(payload);
    if (res && res.ok) {
      ElMessage.success(
        (payload.id ? '已保存' : '已新增') + (res.autoRegistered ? `；岗位「${res.autoRegistered}」已自动登记` : ''),
      );
      dlg.value = false;
      load();
      loadPositions(); // 新登记岗位即时进入下拉
    } else {
      ElMessage.error((res && res.error) || '保存失败');
    }
  } catch (e) {
    ElMessage.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(
      `确定删除人员「${row.name}」（${row.team_name || '总部 / 不限站点'}）？此操作不可恢复。`,
      '删除确认', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch { return; }
  try {
    const res = await deleteStaff(row.id);
    if (res && res.ok) {
      ElMessage.success('已删除');
      load();
    } else {
      ElMessage.error((res && res.error) || '删除失败');
    }
  } catch (e) {
    ElMessage.error(e.message || '删除失败');
  }
}

/* 岗位字典 → 下拉选项：启用项 + 在职在用的未登记项（未登记/停用且无人用的不出现）。 */
async function loadPositions() {
  try {
    const r = await fetchPositions();
    if (r && r.ok) {
      const names = (r.rows || [])
        .filter((p) => p.enabled || p.active_count > 0)
        .map((p) => p.name)
        .filter(Boolean);
      if (names.length) positionOptions.value = names;
    }
  } catch { /* 字典不可用时沿用回退选项，不阻塞人员列表 */ }
}

onMounted(() => {
  loadTeams();
  loadPositions();
  load();
});
</script>

<style scoped>
.sm { padding: var(--sp-20); height: 100%; display: flex; flex-direction: column; }
.sm-bar { display: flex; align-items: center; gap: var(--sp-12); margin-bottom: var(--sp-16); flex-wrap: wrap; }
.v-title { margin: 0; font-size: var(--el-font-size-extra-large); }
.sm-sel { width: 150px; }
.sm-search { width: 250px; }
.sm-bar .sp { flex: 1; }
.sm-hint { margin-bottom: var(--sp-12); }
.sm-table-card { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.sm-table-card :deep(.el-card__body) { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.sm-table { border-radius: var(--el-border-radius-base); }
.sm-pager { display: flex; justify-content: flex-end; padding-top: var(--sp-12); }
.sm-tag { font-size: 12px; font-weight: var(--fw-semibold); padding: 1px 6px; border-radius: 4px; }
.sm-tag.is-active { color: #2e7d32; background: #e8f5e9; }
.sm-tag.is-quit { color: #757575; background: #eeeeee; }
.sm-tag.is-suspended { color: #ed6c02; background: #fff3e0; }
</style>
