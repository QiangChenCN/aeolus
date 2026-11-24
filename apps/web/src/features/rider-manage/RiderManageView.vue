<template>
  <div class="rm">
    <div class="rm-bar">
      <h2 class="v-title">骑手管理</h2>
      <el-select v-model="teamSel" class="rm-sel" placeholder="站点" clearable filterable @change="reload">
        <el-option label="全部站点" value="" />
        <el-option v-for="t in teamOptions" :key="t.id" :label="t.name" :value="String(t.id)" />
      </el-select>
      <el-input
        v-model="keyword" class="rm-search" placeholder="搜索姓名 / 骑手ID / 手机号" clearable
        :prefix-icon="Search" @input="onKeywordInput" @clear="reload"
      />
    </div>

    <div class="rm-tabs-row">
      <el-tabs v-model="workStatus" class="rm-tabs" @tab-change="reload">
        <el-tab-pane label="在职骑手" name="1" />
        <el-tab-pane label="离职骑手" name="2" />
      </el-tabs>
      <el-button
        v-if="canWrite && workStatus === '1'" class="rm-tabs-add"
        type="primary" size="default" @click="openCreate"
      >
        <el-icon><Plus /></el-icon> 新增骑手
      </el-button>
    </div>

    <el-alert v-if="error" type="error" :closable="false" show-icon class="rm-hint">{{ error }}</el-alert>

    <el-card class="rm-table-card" shadow="never">
      <el-table
        v-loading="loading" :data="rows" stripe size="default" class="rm-table" height="100%"
        :empty-text="emptyText"
      >
        <el-table-column
          v-for="c in columns" :key="c.key" :prop="c.key" :label="c.label"
          :min-width="colWidth(c.key)" align="center" show-overflow-tooltip
        >
          <template #default="{ row }">{{ displayCell(row, c.key) }}</template>
        </el-table-column>
        <el-table-column v-if="canWrite && workStatus === '1'" label="操作" width="190" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" size="default" @click="openEdit(row)">编辑</el-button>
            <el-button link type="warning" size="default" @click="openTransfer(row)">调站</el-button>
            <el-button link type="danger" size="default" @click="openLeave(row)">离职</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="rm-pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :page-sizes="[50, 100, 200, 500]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @current-change="load"
          @size-change="() => { page = 1; load(); }"
        />
      </div>
    </el-card>

    <el-dialog v-model="formVisible" :title="isEdit ? '编辑骑手' : '新增骑手'" width="640px" top="5vh" destroy-on-close :close-on-click-modal="false">
      <el-form :model="form" label-width="100px">
        <el-form-item label="骑手ID" required>
          <el-input v-model="form.knightId" placeholder="风神 knightId" :readonly="isEdit" />
        </el-form-item>
        <el-form-item label="骑手姓名" required>
          <el-input v-model="form.staffName" placeholder="骑手姓名" maxlength="30" />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="form.mobile" placeholder="手机号" maxlength="20" />
        </el-form-item>
        <el-form-item label="站点">
          <el-select v-model="form.departmentId" placeholder="选择站点" clearable filterable style="width: 100%">
            <el-option v-for="t in teamOptions" :key="t.id" :label="t.name" :value="String(t.id)" />
          </el-select>
          <div v-if="teamSel" class="form-tip">将按当前筛选站点预填，可修改</div>
        </el-form-item>
        <el-form-item label="骑手属性">
          <el-select v-model="form.riderAttribute" placeholder="请选择" clearable style="width: 100%" @change="onRiderAttributeChange">
            <el-option v-for="v in RIDER_ATTRIBUTES" :key="v" :label="v" :value="v" />
          </el-select>
        </el-form-item>
        <el-form-item label="入职来源">
          <el-select v-model="form.entrySource" placeholder="请选择" clearable style="width: 100%">
            <el-option v-for="v in ENTRY_SOURCES" :key="v" :label="v" :value="v" />
          </el-select>
        </el-form-item>
        <el-form-item label="来源详情">
          <el-input v-model="form.sourceDetail" placeholder="可选" />
        </el-form-item>
        <el-form-item v-if="form.riderAttribute === '兼职'" label="结算方式">
          <el-select v-model="form.settlementMethod" placeholder="请选择" clearable style="width: 100%" @change="onSettlementMethodChange">
            <el-option v-for="v in SETTLEMENT_METHODS" :key="v" :label="v" :value="v" />
          </el-select>
          <el-input
            v-if="form.settlementMethod === '其他'" v-model="form.settlementOther"
            class="form-gap" placeholder="请输入结算方式"
          />
        </el-form-item>
        <el-form-item v-if="form.riderAttribute === '兼职' && form.settlementMethod" label="结算单价">
          <el-input v-model="form.settlementPrice" placeholder="仅填写，可选" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="可选" />
        </el-form-item>
        <el-form-item label="证件号">
          <el-input v-model="form.idNumber" placeholder="可选" />
        </el-form-item>
        <el-form-item label="入职日期">
          <el-date-picker v-model="form.entryDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width: 100%" />
        </el-form-item>
        <el-form-item v-if="isEdit && form.preLeaveDate" label="预离职日期">
          <el-date-picker v-model="form.preLeaveDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="leaveVisible" title="办理离职" width="560px" top="5vh" destroy-on-close :close-on-click-modal="false">
      <el-form :model="leaveForm" label-width="110px">
        <el-form-item label="骑手姓名">
          <el-input v-model="leaveForm.staffName" disabled />
        </el-form-item>
        <el-form-item label="骑手ID">
          <el-input v-model="leaveForm.knightId" disabled />
        </el-form-item>
        <el-form-item label="站点名称">
          <el-input v-model="leaveForm.departmentName" disabled />
        </el-form-item>
        <el-form-item label="申请日期">
          <el-date-picker v-model="leaveForm.applyDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width: 100%" />
        </el-form-item>
        <el-form-item label="预离职日期">
          <el-date-picker v-model="leaveForm.preLeaveDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width: 100%" />
        </el-form-item>
        <el-form-item label="实际离职日期">
          <el-date-picker v-model="leaveForm.leaveDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width: 100%" />
        </el-form-item>
        <el-form-item label="删号日期">
          <el-date-picker v-model="leaveForm.deleteAccountDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width: 100%" />
        </el-form-item>
        <el-form-item label="删号操作人">
          <el-input v-model="leaveForm.deleteOperator" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="leaveVisible = false">取消</el-button>
        <el-button type="danger" :loading="leaving" @click="onLeaveSave">确认离职</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="transferVisible" title="调整站点" width="560px" top="5vh" destroy-on-close :close-on-click-modal="false">
      <el-form :model="transferForm" label-width="110px">
        <el-form-item label="骑手姓名">
          <el-input v-model="transferForm.staffName" disabled />
        </el-form-item>
        <el-form-item label="骑手ID">
          <el-input v-model="transferForm.knightId" disabled />
        </el-form-item>
        <el-form-item label="原站点">
          <el-input v-model="transferForm.fromDepartmentName" disabled />
        </el-form-item>
        <el-form-item label="调入站点" required>
          <el-select v-model="transferForm.toDepartmentId" placeholder="选择调入站点" clearable filterable style="width: 100%">
            <el-option v-for="t in teamOptions" :key="t.id" :label="t.name" :value="String(t.id)" />
          </el-select>
        </el-form-item>
        <el-form-item label="调站日期">
          <el-date-picker v-model="transferForm.transferDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width: 100%" />
        </el-form-item>
        <el-form-item label="调站操作人">
          <el-input v-model="transferForm.transferOperator" placeholder="可选" />
        </el-form-item>
        <el-form-item label="调站备注">
          <el-input v-model="transferForm.transferNote" type="textarea" :rows="2" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="transferVisible = false">取消</el-button>
        <el-button type="primary" :loading="transferring" @click="onTransferSave">确认调站</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Search, Plus } from '@element-plus/icons-vue';
import { KNIGHT_COLUMNS } from '@aeolus/shared';
import { fetchRiderDetails, createRider, updateRider } from '@shared/api/riders.js';
import { fetchTeams } from '@shared/api/dashboards.js';
import { useAuthStore } from '@shared/stores/auth.js';

const auth = useAuthStore();
const canWrite = computed(() => auth.hasPerm('config:write'));

const VISIBLE_KEYS = [
  'staffName', 'knightId', 'mobile', 'departmentName', 'entryDate', 'riderAttribute',
  'entrySource', 'sourceDetail', 'settlementMethod', 'settlementPrice', 'remark',
  'leaveDate', 'idNumber', 'preLeaveDate', 'refreshedAt',
];
const FALLBACK_COLUMNS = [
  ...KNIGHT_COLUMNS,
  { key: 'entryDate', label: '入职日期' },
  { key: 'leaveDate', label: '离职日期' },
  { key: 'refreshedAt', label: '更新时间' },
  { key: 'preLeaveDate', label: '预离职日期' },
];
const RIDER_ATTRIBUTES = ['全职', '兼职'];
const ENTRY_SOURCES = ['骑手推荐', '三方推荐', '站长自招', '二次入职'];
const SETTLEMENT_METHODS = ['日结', '周结', '半月结', '月结', '其他'];

const loading = ref(false);
const error = ref('');
const rows = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(50);

const workStatus = ref('1');
const teamSel = ref('');
const keyword = ref('');
const apiColumns = ref([]);

const formVisible = ref(false);
const isEdit = ref(false);
const saving = ref(false);
const form = reactive({
  knightId: '', staffName: '', mobile: '', departmentId: '', departmentName: '',
  riderAttribute: '', entrySource: '', sourceDetail: '',
  settlementMethod: '', settlementOther: '', settlementPrice: '', remark: '',
  idNumber: '', entryDate: todayStr(), preLeaveDate: '',
});

const leaveVisible = ref(false);
const leaving = ref(false);
const leaveForm = reactive({
  knightId: '', staffName: '', departmentName: '',
  applyDate: todayStr(), preLeaveDate: '', leaveDate: todayStr(),
  deleteAccountDate: '', deleteOperator: '',
});

const transferVisible = ref(false);
const transferring = ref(false);
const transferForm = reactive({
  knightId: '', staffName: '', fromDepartmentName: '',
  toDepartmentId: '', transferDate: todayStr(), transferOperator: '', transferNote: '',
});

const teamsAll = ref([]);
const teamOptions = computed(() => teamsAll.value);
const columns = computed(() => {
  const source = apiColumns.value.length ? apiColumns.value : FALLBACK_COLUMNS;
  return source
    .filter(
      (c) => VISIBLE_KEYS.includes(c.key)
        && (c.key !== 'preLeaveDate' || workStatus.value === '1')
        && (c.key !== 'leaveDate' || workStatus.value === '2'),
    )
    .sort((a, b) => VISIBLE_KEYS.indexOf(a.key) - VISIBLE_KEYS.indexOf(b.key));
});
const emptyText = computed(
  () => `暂无${workStatus.value === '1' ? '在职' : '离职'}骑手`,
);

function colWidth(key) {
  return ['departmentName', 'idNumber', 'refreshedAt', 'sourceDetail', 'remark'].includes(key) ? 180 : 120;
}

function cellText(v) {
  return v === undefined || v === null || v === '' ? '—' : String(v);
}

function displayCell(row, key) {
  const v = row[key];
  if (['entryDate', 'leaveDate', 'preLeaveDate'].includes(key) && v instanceof Date && !Number.isNaN(v.getTime())) {
    const p = (n) => String(n).padStart(2, '0');
    return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}`;
  }
  if (['createdAt', 'updatedAt', 'refreshedAt'].includes(key) && typeof v === 'number') {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) {
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
  }
  return cellText(v);
}

async function loadTeams() {
  try {
    const t = await fetchTeams();
    teamsAll.value = (t && t.teams) || [];
  } catch { /* 站点目录失败不阻塞明细展示 */ }
}

/** 页面只读 rider_roster：筛选、分页、权限过滤都在后端 SQL 层完成。 */
async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await fetchRiderDetails({
      keyword: keyword.value.trim(),
      team: teamSel.value,
      workStatus: workStatus.value,
      page: page.value,
      pageSize: pageSize.value,
    });
    if (res && res.ok === false) {
      error.value = res.error || '加载失败';
      rows.value = [];
      total.value = 0;
      return;
    }
    rows.value = (res && res.rows) || [];
    total.value = (res && res.total) || 0;
    apiColumns.value = (res && res.columns) || [];
  } catch (e) {
    error.value = e.message || '加载失败';
    rows.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function reload() {
  page.value = 1;
  load();
}

let searchTimer = null;
function onKeywordInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => reload(), 300);
}
onUnmounted(() => clearTimeout(searchTimer));

function onRiderAttributeChange() {
  if (form.riderAttribute !== '兼职') {
    form.settlementMethod = '';
    form.settlementOther = '';
    form.settlementPrice = '';
  }
}

function onSettlementMethodChange() {
  if (form.settlementMethod !== '其他') form.settlementOther = '';
  if (!form.settlementMethod) form.settlementPrice = '';
}

const EDIT_FIELDS = [
  'knightId', 'staffName', 'mobile', 'departmentId', 'departmentName',
  'riderAttribute', 'entrySource', 'sourceDetail', 'settlementMethod',
  'settlementPrice', 'remark', 'idNumber', 'entryDate', 'preLeaveDate',
];

function emptyForm() {
  Object.assign(form, {
    knightId: '', staffName: '', mobile: '', departmentId: '', departmentName: '',
    riderAttribute: '', entrySource: '', sourceDetail: '',
    settlementMethod: '', settlementOther: '', settlementPrice: '', remark: '',
    idNumber: '', entryDate: todayStr(), preLeaveDate: '',
  });
}

function openCreate() {
  isEdit.value = false;
  emptyForm();
  if (teamSel.value) {
    form.departmentId = teamSel.value;
    form.departmentName = teamOptions.value.find((t) => String(t.id) === teamSel.value)?.name || '';
  }
  formVisible.value = true;
}

function openEdit(row) {
  isEdit.value = true;
  emptyForm();
  for (const key of EDIT_FIELDS) form[key] = row[key] ?? '';
  form.settlementPrice = row.settlementPrice ?? '';
  if (form.settlementMethod && !SETTLEMENT_METHODS.includes(form.settlementMethod)) {
    form.settlementOther = form.settlementMethod;
    form.settlementMethod = '其他';
  } else {
    form.settlementOther = '';
  }
  formVisible.value = true;
}

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function onSave() {
  if (!form.knightId.trim()) { ElMessage.warning('骑手ID不能为空'); return; }
  if (!form.staffName.trim()) { ElMessage.warning('骑手姓名不能为空'); return; }
  saving.value = true;
  try {
    const payload = { ...form };
    if (payload.riderAttribute !== '兼职') {
      payload.settlementMethod = '';
      payload.settlementPrice = '';
    } else if (payload.settlementMethod === '其他') {
      payload.settlementMethod = payload.settlementOther || '';
    }
    delete payload.settlementOther;
    const res = isEdit.value ? await updateRider(payload) : await createRider(payload);
    if (res && res.ok === false) {
      ElMessage.error(res.error || '保存失败');
      return;
    }
    ElMessage.success(isEdit.value ? '已保存骑手' : '已新增骑手');
    formVisible.value = false;
    if (!isEdit.value) workStatus.value = '1';
    reload();
  } catch (e) {
    ElMessage.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

function openLeave(row) {
  Object.assign(leaveForm, {
    knightId: row.knightId || '',
    staffName: row.staffName || '',
    departmentName: row.departmentName || '',
    applyDate: todayStr(),
    preLeaveDate: row.preLeaveDate || '',
    leaveDate: todayStr(),
    deleteAccountDate: '',
    deleteOperator: auth.name || auth.user || '',
  });
  leaveVisible.value = true;
}

async function onLeaveSave() {
  leaving.value = true;
  try {
    const res = await updateRider({
      knightId: leaveForm.knightId,
      workStatus: '2',
      applyDate: leaveForm.applyDate,
      preLeaveDate: leaveForm.preLeaveDate,
      leaveDate: leaveForm.leaveDate,
      deleteAccountDate: leaveForm.deleteAccountDate,
      deleteOperator: leaveForm.deleteOperator,
    });
    if (res && res.ok === false) {
      ElMessage.error(res.error || '离职操作失败');
      return;
    }
    ElMessage.success('已办理离职');
    leaveVisible.value = false;
    workStatus.value = '2';
    reload();
  } catch (e) {
    ElMessage.error(e.message || '离职操作失败');
  } finally {
    leaving.value = false;
  }
}

function openTransfer(row) {
  Object.assign(transferForm, {
    knightId: row.knightId || '',
    staffName: row.staffName || '',
    fromDepartmentName: row.departmentName || '',
    toDepartmentId: '',
    transferDate: todayStr(),
    transferOperator: auth.name || auth.user || '',
    transferNote: '',
  });
  transferVisible.value = true;
}

async function onTransferSave() {
  if (!transferForm.toDepartmentId) { ElMessage.warning('请选择调入站点'); return; }
  const target = teamOptions.value.find((t) => String(t.id) === transferForm.toDepartmentId);
  if (!target) { ElMessage.warning('调入站点无效，请重新选择'); return; }
  transferring.value = true;
  try {
    const res = await updateRider({
      knightId: transferForm.knightId,
      departmentId: transferForm.toDepartmentId,
      departmentName: target.name,
      transferDate: transferForm.transferDate,
      transferOperator: transferForm.transferOperator,
      transferNote: transferForm.transferNote,
    });
    if (res && res.ok === false) {
      ElMessage.error(res.error || '调站操作失败');
      return;
    }
    ElMessage.success('已调站');
    transferVisible.value = false;
    reload();
  } catch (e) {
    ElMessage.error(e.message || '调站操作失败');
  } finally {
    transferring.value = false;
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
.rm-tabs-row { display: flex; align-items: flex-end; border-bottom: 1px solid var(--el-border-color-light); margin-bottom: var(--sp-12); }
.rm-tabs-row .rm-tabs { flex: 1; min-width: 0; }
.rm-tabs-row :deep(.el-tabs__header) { margin: 0; border-bottom: none; }
.rm-tabs-add { margin-bottom: var(--sp-8); }
.form-tip { color: var(--el-text-color-secondary); font-size: var(--el-font-size-small); line-height: 1.4; padding-top: var(--sp-4); }
.form-gap { margin-top: var(--sp-8); }
.rm-hint { margin-bottom: var(--sp-12); }
.rm-table-card { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.rm-table-card :deep(.el-card__body) { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.rm-table {
  --el-table-header-bg-color: var(--el-color-primary);
  --el-table-header-text-color: #fff;
  border-radius: var(--el-border-radius-base);
}
.rm-pager { display: flex; justify-content: flex-end; padding-top: var(--sp-12); }
</style>
