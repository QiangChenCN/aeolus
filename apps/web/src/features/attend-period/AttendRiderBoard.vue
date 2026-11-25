<template>
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
                骑手<i v-if="sortField === 'rider_name'" class="sort-ic">{{ sortOrder === 'asc' ? '▲' : '▼' }}</i>
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="team_name" label="站点" min-width="120" fixed>
            <template #header>
              <span class="sort-h" @click="toggleSort('team_name')">
                站点<i v-if="sortField === 'team_name'" class="sort-ic">{{ sortOrder === 'asc' ? '▲' : '▼' }}</i>
              </span>
            </template>
          </el-table-column>
          <el-table-column label="全天" min-width="150" align="center">
            <template #header>
              <span class="sort-h" @click="toggleSort('full')">
                全天<i v-if="sortField === 'full'" class="sort-ic">{{ sortOrder === 'asc' ? '▲' : '▼' }}</i>
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
          <el-table-column v-for="p in riderPeriods" :key="p.time_code" :label="p.time_name" min-width="130" align="center">
            <template #header>
              <span class="sort-h" @click="toggleSort(String(p.time_code))">
                {{ p.time_name }}<i v-if="sortField === String(p.time_code)" class="sort-ic">{{ sortOrder === 'asc' ? '▲' : '▼' }}</i>
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
</template>

<script setup>
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useAttendPeriodStore } from './store.js';
import { achClass } from './helpers.js';

const store = useAttendPeriodStore();
const { riderRowsFiltered, riderPeriods, sortField, sortOrder, loading } = storeToRefs(store);

const riderCards = computed(() => {
  const rows = riderRowsFiltered.value;
  return [
    { label: '骑手数', value: rows.length },
    { label: '达标时段合计', value: rows.reduce((a, r) => a + (r.achieved_periods || 0), 0) },
    { label: '排班时段合计', value: rows.reduce((a, r) => a + (r.scheduled_periods || 0), 0) },
  ];
});

function riderCell(row, tc) { return (row.cells && row.cells[String(tc)]) || {}; }
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
  return Math.round((sec / 3600) * 10) / 10;
}

function toggleSort(field) {
  if (sortField.value === field) sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  else { sortField.value = field; sortOrder.value = 'asc'; }
}
function achRank(v) { return v === true ? 2 : v === false ? 1 : 0; }
function fieldValues(row, field) {
  if (field === 'rider_name') return [String(row.rider_name ?? '')];
  if (field === 'team_name') return [String(row.team_name ?? '')];
  if (field === 'full') return [achRank(row.full_day_achieved), row.full_day_orders ?? -1, row.full_day_online_h ?? -1];
  const c = (row.cells && row.cells[String(field)]) || {};
  return [achRank(c.achieved), c.orders ?? -1, c.online_sec ?? -1];
}
function compare(a, b) {
  const va = a._sv, vb = b._sv;
  for (let i = 0; i < va.length; i++) {
    const x = va[i], y = vb[i];
    if (x === y) continue;
    const c = (typeof x === 'string' || typeof y === 'string')
      ? String(x).localeCompare(String(y), 'zh-Hans-CN') : (x < y ? -1 : 1);
    return sortOrder.value === 'asc' ? c : -c;
  }
  return 0;
}
const riderRowsSorted = computed(() => {
  const rows = riderRowsFiltered.value;
  if (!sortField.value) return rows;
  return rows.map(r => ({ r, _sv: fieldValues(r, sortField.value) })).sort(compare).map(o => o.r);
});
</script>

<style src="./attend-period.css" scoped></style>
