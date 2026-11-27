<template>
  <div class="rm">
    <div class="rm-bar">
      <h2 class="v-title">骑手管理</h2>
      <el-select v-model="teamSel" class="rm-sel" size="default" placeholder="站点" clearable filterable @change="reload">
        <el-option label="全部站点" value="" />
        <el-option v-for="t in teamOptions" :key="t.id" :label="t.name" :value="String(t.id)" />
      </el-select>
      <el-input
        v-model="keyword" class="rm-search" size="default" placeholder="搜索姓名 / 骑手ID / 手机号" clearable
        :prefix-icon="Search" @input="onKeywordInput" @clear="reload"
      />
      <el-button
        v-if="canWrite" class="rm-add"
        type="primary" size="default" @click="openCreate"
      >
        <el-icon><Plus /></el-icon> 新增骑手
      </el-button>
    </div>

    <section class="rm-list">
      <div class="rm-filter-row">
        <el-radio-group v-model="workStatus" @change="reload">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button value="1">在职</el-radio-button>
          <el-radio-button value="applied">已申请离职</el-radio-button>
          <el-radio-button value="2">离职</el-radio-button>
        </el-radio-group>
      </div>


        <el-alert v-if="error" type="error" :closable="false" show-icon class="rm-hint">{{ error }}</el-alert>

        <el-card class="rm-table-card" shadow="never">
          <el-table
            v-loading="loading" :data="rows" stripe size="default" class="rm-table" height="100%"
            :empty-text="emptyText" :row-class-name="rowClass" @row-click="selectRow"
          >
            <el-table-column
              v-for="c in columns" :key="c.key" :prop="c.key" :label="c.label"
              :min-width="colWidth(c.key)" align="center" show-overflow-tooltip
            >
              <template #default="{ row }">
                <template v-if="c.key === 'workStatus'">
                  <el-tag :type="stateTagType(row)" effect="light" size="default">
                    {{ stateLabel(riderState(row)) }}
                  </el-tag>
                </template>
                <template v-else-if="c.key === 'settlementPrice'">
                  <span>{{ priceCell(row) }}</span>
                  <el-button
                    v-if="priceMasked(row)" link type="primary" size="default"
                    :loading="priceLoading[row.knightId]" @click.stop="revealPrice(row)"
                  >查看</el-button>
                </template>
                <template v-else>{{ displayCell(row, c.key) }}</template>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120" fixed="right" align="center">
              <template #default="{ row }">
                <el-tooltip content="查看骑手资料与入离职记录，可在其中编辑、调站、办理离职或复职" placement="top">
                  <el-button link type="primary" size="default" @click.stop="openHistory(row)">档案与履历</el-button>
                </el-tooltip>
              </template>
            </el-table-column>
          </el-table>
          <div class="rm-pager">
            <el-pagination
              v-model:current-page="page"
              v-model:page-size="pageSize"
              :page-sizes="[50, 100, 200, 500]"
              :total="total"
              size="default"
              layout="total, sizes, prev, pager, next, jumper"
              background
              @current-change="load"
              @size-change="() => { page = 1; load(); }"
            />
          </div>
        </el-card>
    </section>

    <el-dialog
      v-model="formVisible" :title="isRehire ? '复职登记' : (isEdit ? '编辑骑手' : '新增骑手')"
      width="640px" top="5vh" destroy-on-close :close-on-click-modal="false"
    >
      <el-form :model="form" label-width="100px">
        <el-form-item label="骑手ID" required>
          <el-input v-model="form.knightId" placeholder="风神 knightId" :readonly="isEdit || isRehire" />
        </el-form-item>
        <el-form-item label="骑手姓名" required>
          <el-input v-model="form.staffName" placeholder="骑手姓名" maxlength="30" />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="form.mobile" placeholder="手机号" maxlength="20" />
        </el-form-item>
        <el-form-item label="站点">
          <el-select v-model="form.departmentId" placeholder="选择站点" clearable filterable style="width: 100%" @change="onDepartmentChange">
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
          <div v-if="isRehire" class="form-tip">复职将按该日期生成复职事件，原离职记录保留</div>
        </el-form-item>
        <el-form-item v-if="isEdit && form.preLeaveDate" label="预离职日期">
          <el-date-picker v-model="form.preLeaveDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">
          {{ isRehire ? '确认复职' : (isEdit ? '保存' : '新增') }}
        </el-button>
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
          <div class="form-tip">不填实际离职日期时骑手仍保留在在职列表，申请日期/预离职日期照常记录</div>
        </el-form-item>
        <el-form-item label="离职原因">
          <el-input v-model="leaveForm.leaveReason" type="textarea" :rows="2" placeholder="可选" />
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

    <el-drawer
      v-model="detailVisible" class="rm-profile-drawer" size="560px"
      title="骑手档案"
      :modal="false" modal-penetrable :close-on-click-modal="false" :lock-scroll="false"
    >
      <template v-if="selected">
        <div class="rm-detail-head">
          <div class="rm-avatar">{{ (selected.staffName || '骑').charAt(0) }}</div>
          <div class="rm-detail-id">
            <div class="rm-detail-name">{{ selected.staffName || '—' }}</div>
            <div class="rm-detail-sub">骑手ID {{ selected.knightId || '—' }}</div>
          </div>
          <el-tag :type="stateTagType(selected)" effect="light" size="default">
            {{ stateLabel(riderState(selected)) }}
          </el-tag>
        </div>
        <div class="rm-detail-actions">
          <template v-if="canWrite && riderState(selected) !== 'leave'">
            <el-button size="default" type="primary" @click="openEdit(selected)">编辑</el-button>
            <el-button size="default" @click="openTransfer(selected)">调站</el-button>
            <el-button size="default" type="danger" @click="openLeave(selected)">办理离职</el-button>
          </template>
          <el-button v-else-if="canWrite" size="default" type="success" @click="openRehire(selected)">复职登记</el-button>
          <el-button size="default" @click="revealPrice(selected)">查看单价</el-button>
        </div>
        <el-descriptions :column="1" border size="default" class="rm-desc">
          <el-descriptions-item label="站点">{{ displayCell(selected, 'departmentName') }}</el-descriptions-item>
          <el-descriptions-item label="手机号">{{ displayCell(selected, 'mobile') }}</el-descriptions-item>
          <el-descriptions-item label="骑手属性">{{ displayCell(selected, 'riderAttribute') }}</el-descriptions-item>
          <el-descriptions-item label="入职来源">{{ displayCell(selected, 'entrySource') }}</el-descriptions-item>
          <el-descriptions-item label="入职日期">{{ displayCell(selected, 'entryDate') }}</el-descriptions-item>
          <el-descriptions-item v-if="displayCell(selected, 'applyDate')" label="申请日期">{{ displayCell(selected, 'applyDate') }}</el-descriptions-item>
          <el-descriptions-item v-if="riderState(selected) !== 'leave'" label="预离职日期">{{ displayCell(selected, 'preLeaveDate') }}</el-descriptions-item>
          <el-descriptions-item v-if="riderState(selected) === 'leave'" label="离职日期">{{ displayCell(selected, 'leaveDate') }}</el-descriptions-item>
          <el-descriptions-item v-if="riderState(selected) === 'leave'" label="离职原因">{{ displayCell(selected, 'leaveReason') }}</el-descriptions-item>
          <el-descriptions-item label="结算方式">{{ displayCell(selected, 'settlementMethod') }}</el-descriptions-item>
          <el-descriptions-item label="结算单价">{{ priceCell(selected) || (selected.hasSettlementPrice ? '点击查看' : '—') }}</el-descriptions-item>
          <el-descriptions-item label="备注">{{ displayCell(selected, 'remark') }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ displayCell(selected, 'refreshedAt') }}</el-descriptions-item>
        </el-descriptions>
        <div class="rm-timeline-head">
          <span>生命周期</span>
          <el-radio-group v-model="historyFilter" size="default">
            <el-radio-button value="all">全部</el-radio-button>
            <el-radio-button value="life">入离职</el-radio-button>
            <el-radio-button value="transfer">调站</el-radio-button>
            <el-radio-button value="correction">补正</el-radio-button>
          </el-radio-group>
        </div>
        <div v-loading="historyLoading" class="rm-timeline">
          <el-timeline v-if="filteredHistory.length">
            <el-timeline-item
              v-for="e in filteredHistory" :key="e.id"
              :timestamp="e.effectiveFrom || e.recordedAt" placement="top"
              :type="eventDot(e.eventType)"
            >
              <div class="rm-event-title">
                {{ eventLabel(e.eventType) }}
                <span class="rm-event-source">{{ sourceLabel(e.source) }}</span>
              </div>
              <div v-for="item in eventItems(e)" :key="item.label" class="rm-event-line">
                <span>{{ item.label }}</span><b>{{ item.value }}</b>
              </div>
              <div class="rm-event-meta">{{ e.recordedAt }} · {{ e.actor || '—' }}</div>
            </el-timeline-item>
          </el-timeline>
          <el-empty v-else description="暂无生命周期记录" :image-size="60" />
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Search, Plus } from '@element-plus/icons-vue';
import { KNIGHT_COLUMNS } from '@aeolus/shared';
import {
  fetchRiderDetails, createRider, updateRider, fetchRiderSettlement, fetchRiderEmploymentHistory,
} from '@shared/api/riders.js';
import { fetchTeams } from '@shared/api/dashboards.js';
import { useAuthStore } from '@shared/stores/auth.js';

const auth = useAuthStore();
const canWrite = computed(() => auth.hasPerm('config:write'));

/** 统一列表列顺序：入职信息紧随入职日期，离职信息集中展示。 */
const VISIBLE_KEYS = [
  'staffName', 'knightId', 'workStatus', 'mobile', 'departmentName',
  'entryDate', 'riderAttribute', 'entrySource', 'sourceDetail', 'settlementMethod',
  'settlementPrice', 'applyDate', 'preLeaveDate', 'leaveDate', 'leaveReason',
  'remark', 'idNumber', 'refreshedAt',
];
const FALLBACK_COLUMNS = [
  ...KNIGHT_COLUMNS,
  { key: 'workStatus', label: '状态' },
  { key: 'entryDate', label: '入职日期' },
  { key: 'applyDate', label: '申请日期' },
  { key: 'preLeaveDate', label: '预离职日期' },
  { key: 'leaveDate', label: '离职日期' },
  { key: 'leaveReason', label: '离职原因' },
  { key: 'refreshedAt', label: '更新时间' },
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

const workStatus = ref('');
const teamSel = ref('');
const keyword = ref('');
const apiColumns = ref([]);
/** 结算单价真实值缓存：knightId -> 真实值；未命中则显示后端打码占位。 */
const revealedPrices = reactive({});
const priceLoading = reactive({});

const formVisible = ref(false);
const isEdit = ref(false);
const isRehire = ref(false);
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
  applyDate: todayStr(), preLeaveDate: '', leaveDate: '', leaveReason: '',
  deleteAccountDate: '', deleteOperator: '',
});

const transferVisible = ref(false);
const transferring = ref(false);
const transferForm = reactive({
  knightId: '', staffName: '', fromDepartmentName: '',
  toDepartmentId: '', transferDate: todayStr(), transferOperator: '', transferNote: '',
});

const detailVisible = ref(false);

/** 右侧档案面板：选中骑手 + 该骑手的生命周期事件。 */
const selected = ref(null);
const historyRows = ref([]);
const historyLoading = ref(false);
const historyFilter = ref('all');
const EVENT_LABELS = {
  entry: '入职', leave_apply: '申请离职', leave: '离职',
  rehire: '复职', transfer: '调站', correction: '补正',
};
const SOURCE_LABELS = { manual: '人工办理', upstream: '风神同步', backfill: '历史回填' };
const LIFE_EVENTS = ['entry', 'leave_apply', 'leave', 'rehire'];
const filteredHistory = computed(() => {
  if (historyFilter.value === 'all') return historyRows.value;
  if (historyFilter.value === 'life') return historyRows.value.filter((e) => LIFE_EVENTS.includes(e.eventType));
  return historyRows.value.filter((e) => e.eventType === historyFilter.value);
});

const teamsAll = ref([]);
const teamOptions = computed(() => teamsAll.value);

/** 站点名称只认「风神站点目录」取数基座下发的 options，不拿 ID 兜底。 */
function teamNameById(id) {
  if (!id) return '';
  return teamOptions.value.find((t) => String(t.id) === String(id))?.name || '';
}

function onDepartmentChange(id) {
  form.departmentName = teamNameById(id);
}

const columns = computed(() => {
  const source = apiColumns.value.length ? apiColumns.value : FALLBACK_COLUMNS;
  return source
    .filter((c) => VISIBLE_KEYS.includes(c.key))
    .sort((a, b) => VISIBLE_KEYS.indexOf(a.key) - VISIBLE_KEYS.indexOf(b.key));
});
const STATUS_TAB_LABELS = { '1': '在职', applied: '已申请离职', '2': '离职' };
const emptyText = computed(() => {
  const label = STATUS_TAB_LABELS[workStatus.value];
  return label ? `暂无${label}骑手` : '暂无骑手';
});

function colWidth(key) {
  return ['departmentName', 'idNumber', 'refreshedAt', 'sourceDetail', 'remark', 'leaveReason'].includes(key) ? 180 : 120;
}

function cellText(v) {
  return v === undefined || v === null || v === '' ? '—' : String(v);
}

const STATE_LABELS = { active: '在职', applied: '预离职', leave: '离职' };

function riderState(row) {
  if (!row) return 'active';
  if (String(row.workStatus) === '2' && row.leaveDate) return 'leave';
  if (String(row.workStatus) !== '2' && !row.leaveDate && (row.applyDate || row.preLeaveDate)) return 'applied';
  return 'active';
}

function stateLabel(state) { return STATE_LABELS[state] || '在职'; }
function stateTagType(row) {
  return { active: 'success', applied: 'warning', leave: 'info' }[riderState(row)] || 'info';
}

function displayCell(row, key) {
  const v = row[key];
  if (key === 'workStatus') return stateLabel(riderState(row));
  if (['entryDate', 'applyDate', 'leaveDate', 'preLeaveDate'].includes(key) && v instanceof Date && !Number.isNaN(v.getTime())) {
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

function priceMasked(row) {
  return !!row.hasSettlementPrice
    && !(Object.prototype.hasOwnProperty.call(revealedPrices, row.knightId));
}

function priceCell(row) {
  if (Object.prototype.hasOwnProperty.call(revealedPrices, row.knightId)) {
    return revealedPrices[row.knightId] || '—';
  }
  return '';
}

async function revealPrice(row) {
  const kid = row.knightId;
  if (!kid || priceLoading[kid]) return;
  priceLoading[kid] = true;
  try {
    const res = await fetchRiderSettlement(kid);
    if (res && res.ok === false) {
      ElMessage.error(res.error || '查看结算单价失败');
      return;
    }
    revealedPrices[kid] = res?.settlementPrice || '';
  } catch (e) {
    ElMessage.error(e.message || '查看结算单价失败');
  } finally {
    delete priceLoading[kid];
  }
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
  for (const k of Object.keys(revealedPrices)) delete revealedPrices[k];
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
      selected.value = null;
      historyRows.value = [];
      detailVisible.value = false;
      return;
    }
    rows.value = (res && res.rows) || [];
    total.value = (res && res.total) || 0;
    apiColumns.value = (res && res.columns) || [];
    syncSelection();
  } catch (e) {
    error.value = e.message || '加载失败';
    rows.value = [];
    total.value = 0;
    selected.value = null;
    historyRows.value = [];
    detailVisible.value = false;
  } finally {
    loading.value = false;
  }
}

function rowClass({ row }) {
  return selected.value && selected.value.knightId === row.knightId ? 'rm-row-active' : '';
}

function syncSelection() {
  const kid = selected.value?.knightId;
  if (!kid) return;
  const found = rows.value.find((r) => r.knightId === kid);
  selected.value = found || null;
  if (found) loadHistory(found.knightId);
  else {
    historyRows.value = [];
    detailVisible.value = false;
  }
}

function selectRow(row) {
  selected.value = row;
  detailVisible.value = true;
  historyFilter.value = 'all';
  loadHistory(row.knightId);
}

function onDocumentClick(event) {
  if (!detailVisible.value) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('.rm-profile-drawer, .el-dialog, .el-table__row')) return;
  detailVisible.value = false;
}

async function loadHistory(knightId) {
  if (!knightId) { historyRows.value = []; return; }
  historyLoading.value = true;
  try {
    const res = await fetchRiderEmploymentHistory(knightId, 1, 100);
    historyRows.value = res && res.ok ? (res.rows || []) : [];
  } catch {
    historyRows.value = [];
  } finally {
    historyLoading.value = false;
  }
}

function eventLabel(t) { return EVENT_LABELS[t] || t || '—'; }
function sourceLabel(s) { return SOURCE_LABELS[s] || s || '—'; }
function eventDot(t) {
  return { entry: 'success', rehire: 'success', leave_apply: 'warning', leave: 'danger', transfer: 'warning', correction: 'info' }[t] || 'info';
}

function eventItems(e) {
  const p = e.payload || {};
  const items = [];
  if (p.toDepartmentName || p.departmentName) items.push({ label: '站点', value: p.toDepartmentName || p.departmentName });
  if (p.applyDate) items.push({ label: '申请日期', value: p.applyDate });
  if (p.preLeaveDate) items.push({ label: '预离职日期', value: p.preLeaveDate });
  if (e.eventType === 'leave' && p.leaveReason) items.push({ label: '离职原因', value: p.leaveReason });
  if (p.field) items.push({ label: '补正', value: `${p.oldValue || '—'} → ${p.newValue || '—'}` });
  if (!items.length) items.push({ label: '日期', value: e.effectiveFrom || '—' });
  return items;
}

function openRehire(row) {
  if (!row) return;
  isEdit.value = false;
  isRehire.value = true;
  emptyForm();
  for (const key of EDIT_FIELDS) form[key] = row[key] ?? '';
  if (!form.departmentName || form.departmentName === form.departmentId) {
    form.departmentName = teamNameById(form.departmentId);
  }
  form.settlementPrice = row.settlementPrice ?? '';
  if (form.settlementMethod && !SETTLEMENT_METHODS.includes(form.settlementMethod)) {
    form.settlementOther = form.settlementMethod;
    form.settlementMethod = '其他';
  } else {
    form.settlementOther = '';
  }
  form.entryDate = todayStr();
  form.preLeaveDate = '';
  formVisible.value = true;
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
onUnmounted(() => {
  clearTimeout(searchTimer);
  document.removeEventListener('click', onDocumentClick);
});

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
  isRehire.value = false;
  emptyForm();
  if (teamSel.value) {
    form.departmentId = teamSel.value;
    form.departmentName = teamNameById(teamSel.value);
  }
  formVisible.value = true;
}

function openEdit(row) {
  isEdit.value = true;
  isRehire.value = false;
  emptyForm();
  for (const key of EDIT_FIELDS) form[key] = row[key] ?? '';
  if (!form.departmentName || form.departmentName === form.departmentId) {
    form.departmentName = teamNameById(form.departmentId);
  }
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
    let res;
    if (isRehire.value) {
      res = await updateRider({
        ...payload,
        workStatus: '1',
        entryDate: payload.entryDate || todayStr(),
        applyDate: '',
        preLeaveDate: '',
        leaveDate: '',
        leaveReason: '',
        deleteAccountDate: '',
        deleteOperator: '',
      });
    } else {
      res = isEdit.value ? await updateRider(payload) : await createRider(payload);
    }
    if (res && res.ok === false) {
      ElMessage.error(res.error || '保存失败');
      return;
    }
    ElMessage.success(isRehire.value ? '已复职' : (isEdit.value ? '已保存骑手' : '已新增骑手'));
    formVisible.value = false;
    if (isRehire.value || !isEdit.value) workStatus.value = '';
    reload();
  } catch (e) {
    ElMessage.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

function openHistory(row) {
  selectRow(row);
}

function openLeave(row) {
  Object.assign(leaveForm, {
    knightId: row.knightId || '',
    staffName: row.staffName || '',
    departmentName: row.departmentName || '',
    applyDate: row.applyDate || todayStr(),
    preLeaveDate: row.preLeaveDate || '',
    leaveDate: '',
    leaveReason: row.leaveReason || '',
    deleteAccountDate: row.deleteAccountDate || '',
    deleteOperator: auth.name || auth.user || '',
  });
  leaveVisible.value = true;
}

async function onLeaveSave() {
  leaving.value = true;
  try {
    // 没填实际离职日期只记录离职申请，骑手仍属于在职。
    const hasLeaveDate = !!leaveForm.leaveDate;
    const res = await updateRider({
      knightId: leaveForm.knightId,
      workStatus: hasLeaveDate ? '2' : '1',
      applyDate: leaveForm.applyDate,
      preLeaveDate: leaveForm.preLeaveDate,
      leaveDate: leaveForm.leaveDate,
      leaveReason: leaveForm.leaveReason,
      deleteAccountDate: leaveForm.deleteAccountDate,
      deleteOperator: leaveForm.deleteOperator,
    });
    if (res && res.ok === false) {
      ElMessage.error(res.error || '离职操作失败');
      return;
    }
    ElMessage.success(hasLeaveDate ? '已办理离职' : '已记录离职申请，骑手仍在职');
    leaveVisible.value = false;
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
  document.addEventListener('click', onDocumentClick);
});
</script>

<style scoped>
.rm { padding: var(--sp-20); height: 100%; display: flex; flex-direction: column; gap: var(--sp-12); }
.rm-bar { display: flex; align-items: center; gap: var(--sp-12); flex-wrap: wrap; }
.v-title { margin: 0; font-size: var(--el-font-size-extra-large); }
.rm-sel { width: 150px; }
.rm-search { width: 230px; }
.rm-add { margin-left: auto; }

.rm-list { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; }
.rm-filter-row { display: flex; align-items: center; gap: var(--sp-12); border-bottom: 1px solid var(--el-border-color-light); padding-bottom: var(--sp-8); }
.rm-hint { margin-bottom: var(--sp-12); }
.rm-table-card { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.rm-table-card :deep(.el-card__body) { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.rm-table {
  --el-table-header-bg-color: var(--el-color-primary);
  --el-table-header-text-color: #fff;
  border-radius: var(--el-border-radius-base);
}
.rm-table :deep(.rm-row-active) { --el-table-tr-bg-color: var(--el-color-primary-light-9); }
.rm-pager { display: flex; justify-content: flex-end; padding-top: var(--sp-12); }

.form-tip { color: var(--el-text-color-secondary); font-size: var(--el-font-size-small); line-height: 1.4; padding-top: var(--sp-4); }
.form-gap { margin-top: var(--sp-8); }
</style>

<!-- 抽屉内容默认 teleport 到 body，scoped 样式无法命中，这里用全局样式。 -->
<style>
.rm-profile-drawer .el-drawer__title { font-weight: 700; }
.rm-profile-drawer .el-drawer__body { padding: var(--sp-16); }
.rm-detail-head {
  display: flex;
  align-items: center;
  gap: var(--sp-12);
  padding-bottom: var(--sp-12);
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.rm-avatar {
  width: 40px; height: 40px; flex: none; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--el-color-primary-light-8); color: var(--el-color-primary);
  font-size: 18px; font-weight: 600;
}
.rm-detail-id { flex: 1; min-width: 0; }
.rm-detail-name { font-size: 16px; font-weight: 600; color: var(--el-text-color-primary); }
.rm-detail-sub { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; }
.rm-detail-actions { display: flex; flex-wrap: wrap; gap: var(--sp-8); padding: var(--sp-12) 0; border-bottom: 1px solid var(--el-border-color-lighter); }
.rm-desc { margin-top: var(--sp-12); }
.rm-desc .el-descriptions__label { width: 84px; color: var(--el-text-color-secondary); }
.rm-timeline-head {
  display: flex; align-items: center; justify-content: space-between; gap: var(--sp-8);
  margin: var(--sp-16) 0 var(--sp-8); font-weight: 600;
}
.rm-timeline { padding-top: var(--sp-8); }
.rm-event-title { font-size: 13px; font-weight: 600; }
.rm-event-source { margin-left: 6px; font-size: 11px; font-weight: 400; color: var(--el-text-color-secondary); }
.rm-event-line { display: flex; gap: 8px; font-size: 12px; line-height: 1.8; color: var(--el-text-color-secondary); }
.rm-event-line b { color: var(--el-text-color-primary); font-weight: 500; }
.rm-event-meta { margin-top: 2px; font-size: 11px; color: var(--el-text-color-placeholder); }
</style>
