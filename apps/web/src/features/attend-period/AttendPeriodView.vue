<template>
  <div class="dv">
    <div class="dv-bar">
      <h2 class="v-title">时段出勤</h2>
      <el-select v-model="teamSel" class="dv-sel" placeholder="站点">
        <el-option label="全部站点" value="__all__" />
        <el-option v-for="t in teamOptions" :key="t.id" :label="t.name" :value="t.id" />
      </el-select>
      <el-date-picker
        v-model="date" type="date" value-format="YYYY-MM-DD"
        placeholder="选择日期（默认当天）" class="dv-date" :clearable="false" @change="loadCached"
      />
      <span v-if="fetchedAt" class="dv-time" title="数据取数/落盘时间">
        取数：{{ fetchedAt }} <em v-if="isCache" class="dv-cache">（缓存）</em>
      </span>
      <span class="sp" />
      <el-button @click="openCfg"><el-icon><Setting /></el-icon> 站点配置</el-button>
      <el-button type="primary" :loading="loading" @click="refresh">
        <el-icon><Refresh /></el-icon> {{ loading ? '刷新中…' : '刷新数据' }}
      </el-button>
    </div>

    <el-alert v-if="dataError" type="error" :closable="false" show-icon class="dv-hint">
      {{ dataError }}
    </el-alert>
    <!-- 无缓存：提示点刷新（不自动取数，符合「仅刷新按钮才拉取」） -->
    <el-alert v-else-if="needRefresh" type="info" :closable="false" show-icon class="dv-hint">
      当前日期（{{ date }}）暂无缓存数据，请点「刷新数据」拉取实时数据并生成看板。
    </el-alert>
    <el-alert v-else-if="dataNote" type="warning" :closable="false" show-icon class="dv-hint">{{ dataNote }}</el-alert>

    <el-tabs v-model="activeTab" class="dv-tabs">
      <!-- ============ 站点看板（四张率值表） ============ -->
      <el-tab-pane label="站点看板" name="station">
          <div v-if="stationCards.length" class="dv-cards">
            <el-card v-for="c in stationCards" :key="c.label" class="dv-card" shadow="never">
              <span class="dv-card-num">{{ c.value }}</span>
              <span class="dv-card-label">{{ c.label }}</span>
            </el-card>
          </div>
          <div v-for="(t, i) in stationRateTables" :key="i" class="dv-rate-block">
            <el-card class="dv-rate-card" shadow="never">
              <template #header>
                <span class="dv-rate-title">{{ t.title }}</span>
              </template>
              <el-table v-loading="loading" :data="t.rows" stripe border class="dv-table" empty-text="暂无站点数据">
                <el-table-column prop="team_id" label="站点ID" min-width="120" show-overflow-tooltip />
                <el-table-column prop="team_name" label="站点名称" min-width="220" show-overflow-tooltip />
                <el-table-column :label="t.weightedFull ? '全天加权' : '全天'" :min-width="t.weightedFull ? 120 : 150" align="center">
                  <template #default="{ row }">
                    <div class="dv-cell">
                      <span class="dv-cell-rate" :class="rateClass(row.full.rate)">
                        {{ row.full.rate == null ? '—' : (row.full.rate + '%') }}
                      </span>
                      <span v-if="!t.weightedFull" class="dv-cell-sub">
                        {{ t.numLabel }}{{ row.full.num }} / {{ t.denLabel }}{{ row.full.den }}
                      </span>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column
                  v-for="p in t.periods" :key="p.time_code"
                  :label="p.time_name" min-width="150" align="center"
                >
                  <template #default="{ row }">
                    <div class="dv-cell">
                      <span class="dv-cell-rate" :class="rateClass(rateCell(row, p.time_code).rate)">
                        {{ rateCell(row, p.time_code).rate == null ? '—' : (rateCell(row, p.time_code).rate + '%') }}
                      </span>
                      <span class="dv-cell-sub">
                        {{ t.numLabel }}{{ rateCell(row, p.time_code).num }} / {{ t.denLabel }}{{ rateCell(row, p.time_code).den }}
                      </span>
                    </div>
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </div>
      </el-tab-pane>

      <!-- ============ 骑手看板 ============ -->
      <el-tab-pane label="骑手看板" name="rider">
        <div class="dv-rider-wrap">
          <div v-if="riderCards.length" class="dv-cards">
            <el-card v-for="c in riderCards" :key="c.label" class="dv-card" shadow="never">
              <span class="dv-card-num">{{ c.value }}</span>
              <span class="dv-card-label">{{ c.label }}</span>
            </el-card>
          </div>
          <el-card class="dv-rider-card" shadow="never">
          <div class="dv-matrix-wrap">
            <el-table v-loading="loading" :data="riderRowsSorted" stripe border class="dv-table" empty-text="暂无骑手数据">
              <el-table-column prop="rider_name" label="骑手" min-width="120" fixed>
                <template #header>
                  <span class="sort-h" @click="toggleSort('rider_name')">
                    骑手<i v-if="sortField==='rider_name'" class="sort-ic">{{ sortOrder==='asc'?'▲':'▼' }}</i>
                  </span>
                </template>
              </el-table-column>
              <el-table-column prop="team_name" label="站点" min-width="120" fixed>
                <template #header>
                  <span class="sort-h" @click="toggleSort('team_name')">
                    站点<i v-if="sortField==='team_name'" class="sort-ic">{{ sortOrder==='asc'?'▲':'▼' }}</i>
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="全天" min-width="150" align="center">
                <template #header>
                  <span class="sort-h" @click="toggleSort('full')">
                    全天<i v-if="sortField==='full'" class="sort-ic">{{ sortOrder==='asc'?'▲':'▼' }}</i>
                  </span>
                </template>
                <template #default="{ row }">
                  <div class="dv-cell">
                    <span class="dv-cell-badge" :class="achClass(row.full_day_achieved)">
                      {{ row.full_day_achieved == null ? '—' : (row.full_day_achieved ? '达标' : '未达标') }}
                    </span>
                    <span class="dv-cell-sub">单{{ row.full_day_orders ?? '—' }} · 时{{ row.full_day_online_h ?? '—' }}h</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column
                v-for="p in riderPeriods" :key="p.time_code"
                :label="p.time_name" min-width="130" align="center"
              >
                <template #header>
                  <span class="sort-h" @click="toggleSort(String(p.time_code))">
                    {{ p.time_name }}<i v-if="sortField===String(p.time_code)" class="sort-ic">{{ sortOrder==='asc'?'▲':'▼' }}</i>
                  </span>
                </template>
                <template #default="{ row }">
                  <div class="dv-cell">
                    <span class="dv-cell-badge" :class="achClass(riderCell(row, p.time_code).achieved)">
                      {{ riderCellBadge(row, p.time_code) }}
                    </span>
                    <span class="dv-cell-sub" v-if="riderCell(row, p.time_code).scheduled">
                      单{{ riderCell(row, p.time_code).orders ?? 0 }} · 时{{ fmtH(riderCell(row, p.time_code).online_sec) }}h
                    </span>
                    <span class="dv-cell-sub" v-else>未排班</span>
                  </div>
                </template>
              </el-table-column>
            </el-table>
            </div>
          </el-card>
        </div>
            </el-tab-pane>

      <!-- ============ 时段看板（骑手 × 时段明细） ============ -->
      <el-tab-pane label="时段看板" name="period">
        <div class="dv-period-wrap">
          <div class="dv-filter">
            <el-select v-model="tpFilterPeriod" class="dv-filter-sel" placeholder="时段">
              <el-option label="全部时段" value="__all__" />
              <el-option v-for="p in tpPeriodOptions" :key="p.code" :label="p.name" :value="p.code" />
            </el-select>
            <el-select v-model="teamSel" class="dv-filter-sel" placeholder="站点">
              <el-option label="全部站点" value="__all__" />
              <el-option v-for="t in teamOptions" :key="t.id" :label="t.name" :value="t.id" />
            </el-select>
            <el-select v-model="tpFilterAch" class="dv-filter-sel" placeholder="达标">
              <el-option label="全部达标状态" value="__all__" />
              <el-option label="达标" value="ok" />
              <el-option label="未达标" value="miss" />
            </el-select>
          </div>
          <el-card class="dv-period-card" shadow="never">
          <div class="dv-table-fill">
          <el-table v-loading="loading" :data="pagedTpRiderRows" stripe border class="dv-table" empty-text="暂无时段数据">
              <el-table-column prop="time_name" label="时段" min-width="130" fixed show-overflow-tooltip />
              <el-table-column prop="rider_id" label="骑手ID" min-width="120" show-overflow-tooltip />
              <el-table-column prop="rider_name" label="骑手" min-width="120" show-overflow-tooltip />
              <el-table-column prop="team_name" label="站点" min-width="140" show-overflow-tooltip />
              <el-table-column label="达标" min-width="100" align="center">
                <template #default="{ row }">
                  <span class="dv-cell-badge" :class="achClass(row.achieved)">{{ row.achievedText }}</span>
                </template>
              </el-table-column>
              <el-table-column label="完成单量" min-width="130" align="center">
                <template #default="{ row }">
                  <span :class="{ 'dv-miss': row.orderOk === false }">{{ row.orders }}</span><span class="dv-target">/{{ row.orderTarget }}</span>
                </template>
              </el-table-column>
              <el-table-column label="有效在线时长" min-width="200" align="center">
                <template #default="{ row }">
                  <span :class="{ 'dv-miss': row.onlineOk === false }">{{ row.onlineDur }}</span><span class="dv-target">/{{ row.onlineTarget }}</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <div class="dv-pager">
            <el-pagination
              v-model:current-page="tpPage"
              v-model:page-size="tpPageSize"
              :page-sizes="[25, 50, 100]"
              :total="tpRiderRows.length"
              layout="total, sizes, prev, pager, next, jumper"
              background
              @size-change="tpPage = 1"
            />
          </div>
          </el-card>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="cfgVisible" title="站点配置（选择需要在看板展示的站点）" width="440px">
      <el-checkbox-group v-model="cfgSel" class="dv-cfg-group">
        <el-checkbox v-for="t in teamsAll" :key="t.id" :value="t.id">{{ t.name }}</el-checkbox>
      </el-checkbox-group>
      <template #footer>
        <el-button @click="cfgVisible = false">取消</el-button>
        <el-button type="primary" :loading="cfgSaving" v-perm="'config:write'" @click="saveCfg">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { fetchAttendTeams, saveAttendTeams, fetchAttendDataset } from '../../api/dashboards.js';


const teamsAll = ref([]);   // 全部可选站点 [{id, name}]
const teamsCfg = ref([]);   // 当前已配置展示的站点 id 列表
const teamSel = ref('__all__');
const date = ref(todayStr());
const resp = ref(null);     // 后端返回的完整响应
const loading = ref(false);
const dataError = ref('');
const activeTab = ref('station');  // station | rider | period

/* 日期默认当天（北京时间） */
function todayStr() {
  const n = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

// 下拉项：已配置展示的站点（未配置任何站点时回落全部，避免空下拉）
const teamOptions = computed(() =>
  teamsAll.value.filter(t => !teamsCfg.value.length || teamsCfg.value.includes(String(t.id)))
);

/* —— 三个视图的数据投影（均来自同一份可缓存 dataset，切换标签页不重新请求）—— */
const tp = computed(() => resp.value?.dataset?.time_period || { rows: [], summary: {} });
const station = computed(() => resp.value?.dataset?.station_data || { rows: [], periods: [] });
const rider = computed(() => resp.value?.dataset?.rider_detail || { rows: [], periods: [] });

const tpRows = computed(() => tp.value.rows || []);
const stationRows = computed(() => station.value.rows || []);
const stationPeriods = computed(() => station.value.periods || []);
const riderRows = computed(() => rider.value.rows || []);
const riderPeriods = computed(() => rider.value.periods || []);

/* 站点看板：四张率值表（按站点逐日汇总，分子/分母跨时段求和）
   ① 时段有效达成率 = 有效达成/目标
   ② 时段排班有效出勤率 = 有效达成/排班
   ③ 时段出勤满足率 = 时段有单/目标
   ④ 时段排班出勤率 = 时段有单/排班
   时段列展示原始达成率（不封顶）；
   ① 的「全天加权」列 = 各时段值（未结束 / 无目标按 100%，其余封顶 100%）按「时段设置」权重加权平均（只显示率值）；
   ②③④ 的「全天」列沿用后端 metrics['9999'] 原口径并显示分子/分母
*/
function _num(x) { const n = Number(x); return Number.isFinite(n) ? n : 0; }
function _pct(n, d) { return d > 0 ? Math.round((n / d) * 1000) / 10 : null; }
/* 站点看板：四张率值表，行=站点、列=时段，单元格含率值/分子/分母 */
const stationRateTables = computed(() => {
  const periods = (stationPeriods.value || [])
    .filter(p => !p.is_full_day)  // 去掉时段循环里那个"全天"列（已在前方硬编码全天汇总列呈现），避免重复
    .slice().sort((a, b) => Number(a.time_code) - Number(b.time_code));
  const build = (numKey, denKey, numLabel, denLabel, title, weightedFull = false) => ({
    title, numLabel, denLabel, periods, weightedFull,
    rows: stationRowsFiltered.value.map(r => {
      const ms = r.metrics || {};
      const cells = {};
      for (const p of periods) {
        const m = ms[String(p.time_code)] || {};
        const n = m[numKey], d = m[denKey];
        cells[String(p.time_code)] = {
          rate: _pct(_num(n), _num(d)),
          num: n == null ? '—' : _num(n),
          den: d == null ? '—' : _num(d),
        };
      }
      let full;
      if (weightedFull) {
        // 仅「时段有效达成率」：各真实时段值按「考核设置 → 时段设置」权重加权平均，只展示率值。
        // 参与加权的值：未结束的时段、没有目标（分母为 0/缺失）的时段按 100%；
        // 其余时段用封顶 100% 后的达成率（时段列本身仍展示原始达成率）。
        // 权重缺省（旧缓存快照）按 100 处理，0 权重时段不参与。
        let acc = 0;
        let wsum = 0;
        for (const p of periods) {
          const raw = Number(p.weight);
          const w = p.weight == null || p.weight === '' || !Number.isFinite(raw) ? 100 : raw;
          if (w <= 0) continue;
          const c = cells[String(p.time_code)];
          const value = (p.ended === false || !c || c.rate == null) ? 100 : Math.min(100, c.rate);
          acc += value * w;
          wsum += w;
        }
        full = { rate: wsum > 0 ? Math.round(acc / wsum * 10) / 10 : null };
      } else {
        // 其余三张表：沿用后端已算好的全天汇总 metrics['9999']，并显示分子/分母。
        const fm = ms['9999'] || {};
        const fn = fm[numKey], fd = fm[denKey];
        full = {
          rate: _pct(_num(fn), _num(fd)),
          num: fn == null ? '—' : _num(fn),
          den: fd == null ? '—' : _num(fd),
        };
      }
      return {
        team_id: r.team_id, team_name: r.team_name, cells, full,
      };
    }),
  });
  return [
    build('achieved', 'target', '有效', '目标', '时段有效达成率（有效达成 / 目标）', true),
    build('achieved', 'scheduled', '有效', '排班', '时段排班有效出勤率（有效达成 / 排班）'),
    build('order', 'target', '有单', '目标', '时段出勤满足率（时段有单 / 目标）'),
    build('order', 'scheduled', '有单', '排班', '时段排班出勤率（时段有单 / 排班）'),
  ];
});
/* 站点矩阵单元格 */
function rateCell(row, tc) {
  return (row.cells && row.cells[String(tc)]) || { rate: null, num: '—', den: '—' };
}

const needRefresh = computed(() => !!resp.value && resp.value.need_refresh === true);
const hasData = computed(() =>
  tpRows.value.length > 0 || stationRows.value.length > 0 || riderRows.value.length > 0
);
const fetchedAt = computed(() => (resp.value && resp.value.fetched_at) || tp.value.fetched_at || '');
const isCache = computed(() => (resp.value && resp.value.source) === 'cache' || tp.value.source === 'cache');
const dataNote = computed(() => resp.value?.data_note || '');

/* 站点看板卡片（随选中站点筛选） */
const stationCards = computed(() => [
  { label: '站点数', value: stationRowsFiltered.value.length },
  { label: '考核时段数', value: (stationPeriods.value.filter(p => !p.is_full_day).length) },
]);

/* 骑手看板卡片（随选中站点筛选） */
const riderCards = computed(() => {
  const rows = riderRowsFiltered.value;
  return [
    { label: '骑手数', value: rows.length },
    { label: '达标时段合计', value: rows.reduce((a, r) => a + (r.achieved_periods || 0), 0) },
    { label: '排班时段合计', value: rows.reduce((a, r) => a + (r.scheduled_periods || 0), 0) },
  ];
});

/* 单元格辅助 */
function riderCell(row, tc) {
  return (row.cells && row.cells[String(tc)]) || {};
}
function riderCellBadge(row, tc) {
  const c = riderCell(row, tc);
  if (!c.scheduled) return '—';
  if (c.configured === false) return '未配置';
  if (c.achieved === true) return '达标';
  if (c.achieved === false) return '未达标';
  return '—';
}
function fmtH(sec) {
  if (sec == null) return '—';
  return (Math.round((sec / 3600) * 10) / 10);
}
function rateClass(rate) {
  if (rate == null) return 'is-none';
  if (rate >= 100) return 'is-ok';
  if (rate >= 80) return 'is-warn';
  return 'is-bad';
}
function achClass(achieved) {
  if (achieved === true) return 'is-ok';
  if (achieved === false) return 'is-bad';
  return 'is-none';
}

/* —— 选中具体站点时，从已加载的全部站点缓存中前端筛选（不重新取数）—— */
const isAllTeam = computed(() => teamSel.value === '__all__');
const selTeamId = computed(() => String(teamSel.value));

const stationRowsFiltered = computed(() =>
  isAllTeam.value ? (station.value.rows || [])
    : (station.value.rows || []).filter(r => String(r.team_id) === selTeamId.value)
);
const riderRowsFiltered = computed(() =>
  isAllTeam.value ? (rider.value.rows || [])
    : (rider.value.rows || []).filter(r => String(r.team_id) === selTeamId.value)
);

/* —— 骑手看板表格排序：点击列头切换升/降序，仅当前排序列显示排序图标 —— */
const sortField = ref('');     // 当前排序列字段（'' 表示未排序，保持原顺序）
const sortOrder = ref('asc');  // 'asc' | 'desc'

function toggleSort(field) {
  if (sortField.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortField.value = field;
    sortOrder.value = 'asc';
  }
}

// 将「达标/未达标/未配置」映射为可比较的序值：未配置(0) < 未达标(1) < 达标(2)
function _achRank(v) { return v === true ? 2 : v === false ? 1 : 0; }

// 取某行在指定排序字段下的比较向量（按重要性依次排列，支持复合排序）
function _fieldValues(row, field) {
  if (field === 'rider_name') return [String(row.rider_name ?? '')];
  if (field === 'team_name') return [String(row.team_name ?? '')];
  if (field === 'full') {
    return [_achRank(row.full_day_achieved), row.full_day_orders ?? -1, row.full_day_online_h ?? -1];
  }
  // 各时段列：以 time_code 字符串为字段名，按 达标状态 → 单量 → 有效在线时长 复合排序
  const c = (row.cells && row.cells[String(field)]) || {};
  return [_achRank(c.achieved), c.orders ?? -1, c.online_sec ?? -1];
}

function _compare(a, b) {
  const va = a._sv, vb = b._sv;
  for (let i = 0; i < va.length; i++) {
    const x = va[i], y = vb[i];
    if (x === y) continue;
    let c;
    if (typeof x === 'string' || typeof y === 'string') c = String(x).localeCompare(String(y), 'zh-Hans-CN');
    else c = x < y ? -1 : 1;
    return sortOrder.value === 'asc' ? c : -c;
  }
  return 0;
}

const riderRowsSorted = computed(() => {
  const rows = riderRowsFiltered.value;
  if (!sortField.value) return rows;
  return rows
    .map(r => ({ r, _sv: _fieldValues(r, sortField.value) }))
    .sort(_compare)
    .map(o => o.r);
});

/* 时长格式化：xx小时xx分钟 */
function fmtDur(sec) {
  sec = Math.trunc(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return `${h}小时${m}分钟`;
}

/* 时段看板筛选：时段 / 达标状态（站点复用页面顶部的 teamSel） */
const tpFilterPeriod = ref('__all__');
const tpFilterAch = ref('__all__');
const tpPeriodOptions = computed(() =>
  tpRows.value.map(p => ({ code: String(p.time_code), name: p.time_name })));

/* 时段看板：骑手 × 时段逐行展开（仅列出该时段实际排班的骑手，随选中站点筛选） */
const tpRiderRows = computed(() => {
  const riders = riderRowsFiltered.value.slice().sort((a, b) =>
    String(a.team_name ?? '').localeCompare(String(b.team_name ?? ''), 'zh-Hans-CN')
    || String(a.rider_id ?? '').localeCompare(String(b.rider_id ?? ''), 'zh-Hans-CN'));
  const targets = new Map(riderPeriods.value.map(p => [String(p.time_code), p]));
  const rows = [];
  for (const p of tpRows.value) {
    const tc = String(p.time_code);
    if (tc === '9999') continue;
    if (tpFilterPeriod.value !== '__all__' && tc !== tpFilterPeriod.value) continue;
    const target = targets.get(tc) || {};
    const orderTarget = target.orders_req == null ? '—' : _num(target.orders_req);
    const onlineTarget = target.online_req_h == null ? '—' : fmtDur(_num(target.online_req_h) * 3600);
    for (const r of riders) {
      const cell = r.cells?.[tc];
      if (!cell?.scheduled) continue;
      if (tpFilterAch.value === 'ok' && cell.achieved !== true) continue;
      if (tpFilterAch.value === 'miss' && cell.achieved !== false) continue;
      rows.push({
        time_name: p.time_name,
        rider_id: r.rider_id,
        rider_name: r.rider_name,
        team_name: r.team_name,
        achieved: cell.achieved,
        achievedText: cell.configured === false ? '未配置'
          : cell.achieved === true ? '达标'
          : cell.achieved === false ? '未达标' : '—',
        orders: cell.orders ?? '—',
        orderTarget,
        orderOk: cell.order_ok,
        onlineDur: cell.online_sec == null ? '—' : fmtDur(cell.online_sec),
        onlineTarget,
        onlineOk: cell.online_ok,
      });
    }
  }
  return rows;
});

/* 时段看板分页（默认 25 行/页，纯前端切片） */
const tpPage = ref(1);
const tpPageSize = ref(25);
const pagedTpRiderRows = computed(() => {
  const start = (tpPage.value - 1) * tpPageSize.value;
  return tpRiderRows.value.slice(start, start + tpPageSize.value);
});
watch([teamSel, date, tpFilterPeriod, tpFilterAch, tpRiderRows], () => { tpPage.value = 1; });

/* 读取缓存（进入页面 / 切换日期）：始终读取「全部站点」，选中具体站点在前端筛选，不重新取数。 */
async function loadCached() {
  loading.value = true;
  dataError.value = '';
  try {
    const res = await fetchAttendDataset({ team: '__all__', date: date.value });
    if (res && res.need_refresh) {
      resp.value = { need_refresh: true };
    } else if (res && res.dataset) {
      resp.value = res;
    } else {
      dataError.value = (res && res.error) || '加载失败';
      resp.value = null;
    }
  } catch (e) {
    dataError.value = e.message || '加载失败';
    resp.value = null;
  } finally {
    loading.value = false;
  }
}

/* 刷新数据（唯一实时取数入口）：拉取全部站点并落盘，刷新后缓存即时可见 */
async function refresh() {
  loading.value = true;
  dataError.value = '';
  try {
    const res = await fetchAttendDataset({ team: '__all__', date: date.value, refresh: true });
    if (res && res.dataset) {
      resp.value = res;
      ElMessage.success('数据已刷新');
    } else {
      dataError.value = (res && res.error) || '刷新失败';
    }
  } catch (e) {
    dataError.value = e.message || '刷新失败';
  } finally {
    loading.value = false;
  }
}

// —— 站点配置 ——
const cfgVisible = ref(false);
const cfgSel = ref([]);
const cfgSaving = ref(false);
function openCfg() {
  cfgSel.value = [...teamsCfg.value];
  cfgVisible.value = true;
}
async function saveCfg() {
  cfgSaving.value = true;
  try {
    const res = await saveAttendTeams(cfgSel.value);
    if (res && res.ok) {
      teamsCfg.value = res.teams || [...cfgSel.value];
      ElMessage.success('站点配置已保存');
      cfgVisible.value = false;
      // 重新按新配置取数：读缓存不会应用新配置，必须刷新才能让看板反映所选站点
      await refresh();
    } else {
      ElMessage.error((res && res.error) || '保存失败');
    }
  } catch (e) {
    ElMessage.error(e.message || '保存失败');
  } finally {
    cfgSaving.value = false;
  }
}

onMounted(async () => {
  try {
    const t = await fetchAttendTeams();
    teamsAll.value = (t && t.all) || [];
    teamsCfg.value = (t && t.teams) || [];
  } catch (e) { /* ignore */ }
  await loadCached();   // 进入页面只读缓存（今天若已刷新则直接展示，否则提示点刷新）
});

</script>

<style scoped>
.dv { padding: var(--sp-20); height: 100%; display: flex; flex-direction: column; }
.dv-tabs { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.dv-tabs :deep(.el-tabs__content) { flex: 1; min-height: 0; overflow: visible; }
.dv-tabs :deep(.el-tab-pane) { height: 100%; }
.dv-period-wrap { height: 100%; min-height: 0; display: flex; flex-direction: column; }
.dv-filter { display: flex; gap: var(--sp-12); margin-bottom: var(--sp-12); flex-wrap: wrap; }
.dv-filter-sel { width: 160px; }
.dv-period-card { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.dv-period-card :deep(.el-card__body) { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.dv-table-fill { flex: 1; min-height: 0; display: flex; }
.dv-pager { display: flex; justify-content: flex-end; padding-top: var(--sp-12); }
.dv-rider-wrap { height: 100%; min-height: 0; display: flex; flex-direction: column; }
.dv-rider-card { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.dv-rider-card :deep(.el-card__body) { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.dv-bar { display: flex; align-items: center; gap: var(--sp-12); margin-bottom: var(--sp-16); flex-wrap: wrap; }
.v-title { margin: 0; font-size: var(--el-font-size-extra-large); }
.dv-sel { width: 160px; }
.dv-date { width: 180px; }
.dv-time { font-size: var(--el-font-size-extra-small); color: var(--el-text-color-secondary); }
.dv-cache { font-style: normal; color: var(--el-color-primary); font-size: 11px; }
.dv-bar .sp { flex: 1; }
.dv-hint { margin-bottom: var(--sp-12); }
.dv-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--sp-12); margin-bottom: var(--sp-16); }
.dv-card :deep(.el-card__body) { display: flex; flex-direction: column; gap: 4px; padding: var(--sp-16); }
.dv-card-num { font-size: 24px; font-weight: var(--fw-bold); color: var(--el-color-primary); }
.dv-card-label { font-size: var(--el-font-size-extra-small); color: var(--el-text-color-secondary); }
.dv-table { border-radius: var(--el-border-radius-base); }
.dv-target { color: var(--el-text-color-secondary); }
.dv-miss { color: var(--danger, #d32f2f); }
.dv-rate-block { margin-bottom: var(--sp-16); }
.dv-rate-title { font-size: var(--el-font-size-medium); font-weight: var(--fw-semibold); color: var(--el-text-color-primary); }
.dv-matrix-wrap { flex: initial; min-height: 0; overflow: visible; border-radius: var(--el-border-radius-base); }
/* 站点看板 4 张率值表：每张表格一张 el-card，标题走 #header（无 footer）；
   header/body 均沿用 Element Plus 默认 padding，故此处不做 :deep 覆盖 */

.dv-cfg-group { display: flex; flex-direction: column; gap: var(--sp-8); }
.dv-cell { display: flex; flex-direction: column; align-items: center; gap: 2px; line-height: 1.2; }
.dv-cell-rate { font-size: 15px; font-weight: var(--fw-bold); }
.dv-cell-rate.is-ok { color: var(--ok, #2e7d32); }
.dv-cell-rate.is-warn { color: var(--warn, #ed6c02); }
.dv-cell-rate.is-bad { color: var(--danger, #d32f2f); }
.dv-cell-rate.is-none, .dv-cell-sub { color: var(--el-text-color-secondary); font-size: 11px; }
.dv-cell-badge { font-size: 13px; font-weight: var(--fw-semibold); padding: 1px 6px; border-radius: 4px; }
.dv-cell-badge.is-ok { color: #2e7d32; background: #e8f5e9; }
.dv-cell-badge.is-bad { color: #d32f2f; background: #fdecea; }
.dv-cell-badge.is-none { color: var(--el-text-color-secondary); }
/* 骑手看板可排序列头：指针提示可点击；仅当前排序列根据 sortField 显示升/降序图标 */
.sort-h { cursor: pointer; user-select: none; display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; }
.sort-h:hover { color: var(--el-color-primary); }
.sort-ic { font-style: normal; font-size: 11px; color: var(--el-color-primary); margin-left: 2px; }
</style>
