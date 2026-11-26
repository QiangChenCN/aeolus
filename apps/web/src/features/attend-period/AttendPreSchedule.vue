<template>
  <div class="dv-pre-wrap">
    <div class="dv-pre-bar">
      <span class="dv-pre-note">数据来自风神「排班统计」导出；满足率 = 排班人数 / 应排人数。</span>
      <div class="range-picker">
        <el-date-picker
          v-model="preDates" type="daterange" value-format="YYYY-MM-DD"
          start-placeholder="开始日期" end-placeholder="结束日期" :clearable="false"
        />
      </div>
      <span class="sp" />
      <el-button :disabled="preLoading" @click="store.loadPre(true)">
        <el-icon v-if="preLoading" class="is-loading"><Loading /></el-icon>
        <el-icon v-else><Refresh /></el-icon> {{ preLoaded ? '重新加载' : '加载预排班' }}
      </el-button>
    </div>
    <el-alert v-if="preError" type="error" :closable="false" show-icon class="dv-hint">{{ preError }}</el-alert>
    <div v-loading="preLoading" class="dv-pre-days">
      <el-card v-for="day in preDayTables" :key="day.date" class="dv-pre-day-card" shadow="never">
        <template #header><span class="dv-pre-day-title">{{ day.date }}</span></template>
        <el-table :data="day.rows" stripe border class="dv-table" :row-class-name="stationRowClass">
          <el-table-column prop="team_name" label="站点" min-width="220" show-overflow-tooltip />
          <el-table-column label="全天" min-width="150" align="center">
            <template #default="{ row }">
              <div class="dv-cell">
                <span class="dv-cell-rate" :class="rateClass(preCell(row, '全天').rate)">
                  {{ preCell(row, '全天').rate == null ? '—' : (preCell(row, '全天').rate + '%') }}
                </span>
                <span class="dv-cell-sub">排{{ preCell(row, '全天').scheduled }} / 应{{ preCell(row, '全天').required }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column v-for="p in prePeriods" :key="p" :label="p" min-width="150" align="center">
            <template #default="{ row }">
              <div class="dv-cell">
                <span class="dv-cell-rate" :class="rateClass(preCell(row, p).rate)">
                  {{ preCell(row, p).rate == null ? '—' : (preCell(row, p).rate + '%') }}
                </span>
                <span class="dv-cell-sub">排{{ preCell(row, p).scheduled }} / 应{{ preCell(row, p).required }}</span>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
      <el-empty v-if="!preDayTables.length && !preLoading" description="暂无预排班数据，点「加载预排班」拉取" />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useAttendPeriodStore } from './store.js';
import { toNum, pct, rateClass } from './helpers.js';

const store = useAttendPeriodStore();
const { preDates, preRaw, preLoading, preLoaded, preError, teamSel } = storeToRefs(store);

const prePeriods = computed(() => (preRaw.value.periods || []).filter(p => p !== '全天' && p !== '休息'));
const preDayTables = computed(() => {
  const byDate = new Map();
  for (const r of preRaw.value.rows || []) {
    if (r.period === '休息') continue;
    if (!byDate.has(r.date)) byDate.set(r.date, new Map());
    const dayMap = byDate.get(r.date);
    if (!dayMap.has(r.team_id)) {
      dayMap.set(r.team_id, { team_id: r.team_id, team_name: r.team_name, cells: {}, _isTotal: false });
    }
    dayMap.get(r.team_id).cells[r.period] = { rate: r.rate, scheduled: r.scheduled, required: r.required };
  }
  const periods = ['全天', ...prePeriods.value];
  const tables = [];
  for (const date of [...byDate.keys()].sort()) {
    let dataRows = [...byDate.get(date).values()];
    const ids = store.filterTeamIds;
    if (ids !== null) dataRows = dataRows.filter(r => ids.includes(String(r.team_id)));
    if (!dataRows.length) continue;
    dataRows.sort((a, b) => String(a.team_name).localeCompare(String(b.team_name), 'zh-Hans-CN'));
    const total = { team_name: '合计', cells: {}, _isTotal: true };
    for (const p of periods) {
      let n = 0, d = 0, has = false;
      for (const r of dataRows) {
        const c = r.cells[p];
        if (!c) continue;
        has = true; n += toNum(c.scheduled); d += toNum(c.required);
      }
      total.cells[p] = has ? { rate: pct(n, d), scheduled: n, required: d } : { rate: null, scheduled: '—', required: '—' };
    }
    tables.push({ date, rows: [total, ...dataRows] });
  }
  return tables;
});
function preCell(row, period) { return row.cells?.[period] || { rate: null, scheduled: '—', required: '—' }; }
function stationRowClass({ row }) { return row._isTotal ? 'dv-total-row' : ''; }

/* 进入预排班且尚未加载时自动拉取；日期范围/站点变化后失效并按需重新拉取 */
onMounted(() => { store.loadPre(); });
watch(preDates, () => { store.invalidatePre(); store.loadPre(true); }, { deep: true });
watch(teamSel, () => { store.invalidatePre(); if (preLoaded.value) store.loadPre(true); });
</script>

<style src="./attend-period.css" scoped></style>
