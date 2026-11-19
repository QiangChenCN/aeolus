<template>
  <div class="rm">
    <div class="rm-bar">
      <h2 class="v-title">骑手管理</h2>
      <el-select v-model="statusSel" class="rm-sel" placeholder="状态" clearable>
        <el-option label="全部状态" value="" />
        <el-option label="在职" value="active" />
        <el-option label="离职" value="quit" />
        <el-option label="停用" value="suspended" />
      </el-select>
      <el-select v-model="teamSel" class="rm-sel" placeholder="站点" clearable filterable>
        <el-option label="全部站点" value="" />
        <el-option v-for="t in teamOptions" :key="t.id" :label="t.name" :value="String(t.id)" />
      </el-select>
      <el-input
        v-model="keyword" class="rm-search" placeholder="搜索姓名 / 骑手ID / 手机号 / 备注" clearable
        :prefix-icon="Search" @keyup.enter="reload"
      />
      <el-button @click="reload">查询</el-button>
      <span class="sp" />
      <el-button v-if="canWrite" :loading="syncing" @click="onSync">
        <el-icon><Refresh /></el-icon> 同步考勤名册
      </el-button>
      <el-button v-if="canWrite" type="primary" @click="openCreate">
        <el-icon><Plus /></el-icon> 新增骑手
      </el-button>
    </div>

    <el-alert v-if="error" type="error" :closable="false" show-icon class="rm-hint">{{ error }}</el-alert>

    <el-card class="rm-table-card" shadow="never">
      <el-table
        v-loading="loading" :data="rows" stripe border size="small" class="rm-table" height="100%"
        empty-text="花名册暂无记录（可点右上角「同步考勤名册」导入，或手动新增）"
      >
        <el-table-column prop="name" label="姓名" min-width="100" align="center" show-overflow-tooltip />
        <el-table-column prop="knight_id" label="骑手ID" min-width="110" align="center" show-overflow-tooltip />
        <el-table-column prop="mobile" label="手机号" min-width="120" align="center" show-overflow-tooltip />
        <el-table-column prop="team_name" label="站点" min-width="160" show-overflow-tooltip />
        <el-table-column prop="work_type" label="工作类型" min-width="90" align="center" />
        <el-table-column label="状态" min-width="80" align="center">
          <template #default="{ row }">
            <span class="rm-tag" :class="'is-' + row.status">{{ statusLabel(row.status) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="入职日期" min-width="100" align="center">
          <template #default="{ row }">{{ row.hired_at || '—' }}</template>
        </el-table-column>
        <el-table-column label="离职日期" min-width="100" align="center">
          <template #default="{ row }">{{ row.left_at || '—' }}</template>
        </el-table-column>
        <el-table-column label="最近出现" min-width="100" align="center">
          <template #default="{ row }">{{ row.last_seen || '—' }}</template>
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
      <div class="rm-pager">
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

    <el-dialog v-model="dlg" :title="form.id ? '编辑骑手' : '新增骑手'" width="560px" destroy-on-close>
      <el-form :model="form" label-width="90px">
        <el-form-item label="姓名" required>
          <el-input v-model="form.name" placeholder="骑手姓名" maxlength="30" />
        </el-form-item>
        <el-form-item label="骑手ID">
          <el-input v-model="form.knight_id" placeholder="风神 knightId（可留空后补）" />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="form.mobile" placeholder="手机号" maxlength="20" />
        </el-form-item>
        <el-form-item label="所属站点">
          <el-select v-model="form.team_id" placeholder="选择站点" clearable filterable style="width: 100%">
            <el-option v-for="t in teamOptions" :key="t.id" :label="t.name" :value="String(t.id)" />
          </el-select>
        </el-form-item>
        <el-form-item label="工作类型">
          <el-select v-model="form.work_type" style="width: 100%">
            <el-option v-for="t in ['全职', '兼职', '众包']" :key="t" :label="t" :value="t" />
          </el-select>
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
      target-type="rider"
      :target-id="changesTarget.id"
      :target-name="changesTarget.name"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Plus, Refresh } from '@element-plus/icons-vue';
import { fetchRiders, createRider, updateRider, deleteRider, syncRiders } from '@shared/api/riders.js';
import { fetchTeams } from '@shared/api/dashboards.js';
import { useAuthStore } from '@shared/stores/auth.js';
import PersonnelChangesDrawer from '@shared/components/common/PersonnelChangesDrawer.vue';

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

const dlg = ref(false);
const saving = ref(false);
const syncing = ref(false);
const form = reactive({ id: null, name: '', knight_id: '', mobile: '', team_id: '', work_type: '全职', status: 'active', hired_at: '', left_at: '', note: '' });

const changesVisible = ref(false);
const changesTarget = reactive({ id: null, name: '' });
function openChanges(row) {
  changesTarget.id = row.id;
  changesTarget.name = row.name;
  changesVisible.value = true;
}

function emptyForm() {
  Object.assign(form, { id: null, name: '', knight_id: '', mobile: '', team_id: '', work_type: '全职', status: 'active', hired_at: '', left_at: '', note: '' });
}

async function loadTeams() {
  try {
    const t = await fetchTeams();
    teamsAll.value = (t && t.teams) || [];
  } catch { /* 站点目录失败不阻塞名册展示 */ }
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await fetchRiders({
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
  if (teamSel.value) form.team_id = teamSel.value; // 预填当前筛选站点
  dlg.value = true;
}

function openEdit(row) {
  Object.assign(form, {
    id: row.id, name: row.name, knight_id: row.knight_id || '', mobile: row.mobile || '',
    team_id: row.team_id || '', work_type: row.work_type || '全职', status: row.status || 'active',
    hired_at: row.hired_at || '', left_at: row.left_at || '', note: row.note || '',
  });
  dlg.value = true;
}

async function onSave() {
  if (!form.name.trim()) { ElMessage.warning('姓名不能为空'); return; }
  saving.value = true;
  try {
    const payload = { ...form };
    if (!payload.left_at) payload.left_at = '';
    const res = payload.id ? await updateRider(payload) : await createRider(payload);
    if (res && res.ok) {
      ElMessage.success(payload.id ? '已保存' : '已新增');
      dlg.value = false;
      load();
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
      `确定从花名册删除「${row.name}」（${row.team_name || '未分配站点'}）？此操作不可恢复。`,
      '删除确认', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch { return; }
  try {
    const res = await deleteRider(row.id);
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

async function onSync() {
  try {
    await ElMessageBox.confirm(
      '将以最近一次考勤快照为准同步花名册：新增缺失的骑手（在职），并刷新已有骑手的姓名/手机号/站点。在职状态、备注等人事属性不会被覆盖。继续？',
      '同步考勤名册', { type: 'info', confirmButtonText: '开始同步', cancelButtonText: '取消' },
    );
  } catch { return; }
  syncing.value = true;
  try {
    const res = await syncRiders();
    if (res && res.ok) {
      ElMessage.success(`同步完成（${res.date}）：新增 ${res.added}，更新 ${res.updated}，快照共 ${res.total} 人`);
      if (res.stale_teams && res.stale_teams.length) {
        ElMessage.warning({
          message: `以下站点当日无考勤快照，未参与本次同步：${res.stale_teams.join('、')}`,
          duration: 10000, showClose: true,
        });
      }
      reload();
    } else {
      ElMessage.error((res && res.error) || '同步失败');
    }
  } catch (e) {
    ElMessage.error(e.message || '同步失败');
  } finally {
    syncing.value = false;
  }
}

onMounted(() => {
  loadTeams();
  load();
});
</script>

<style scoped>
.rm { padding: var(--sp-20); height: 100%; display: flex; flex-direction: column; }
.rm-bar { display: flex; align-items: center; gap: var(--sp-12); margin-bottom: var(--sp-16); flex-wrap: wrap; }
.v-title { margin: 0; font-size: var(--el-font-size-extra-large); }
.rm-sel { width: 150px; }
.rm-search { width: 230px; }
.rm-bar .sp { flex: 1; }
.rm-hint { margin-bottom: var(--sp-12); }
.rm-table-card { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.rm-table-card :deep(.el-card__body) { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.rm-table { border-radius: var(--el-border-radius-base); }
.rm-pager { display: flex; justify-content: flex-end; padding-top: var(--sp-12); }
.rm-tag { font-size: 12px; font-weight: var(--fw-semibold); padding: 1px 6px; border-radius: 4px; }
.rm-tag.is-active { color: #2e7d32; background: #e8f5e9; }
.rm-tag.is-quit { color: #757575; background: #eeeeee; }
.rm-tag.is-suspended { color: #ed6c02; background: #fff3e0; }
</style>
