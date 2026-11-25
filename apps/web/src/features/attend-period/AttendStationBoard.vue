<template>
  <div class="dv-station-wrap" style="height: 100%; min-height: 0; overflow: auto">
    <div v-for="(t, i) in stationRateTables" :key="i" class="dv-rate-block">
      <el-card class="dv-rate-card" shadow="never">
        <template #header>
          <div class="dv-rate-header" @click="rateFolded[i] = !rateFolded[i]">
            <span class="dv-rate-title">{{ t.title }}</span>
            <el-icon class="dv-rate-fold" :class="{ 'is-folded': rateFolded[i] }"><ArrowDown /></el-icon>
          </div>
        </template>
        <div v-show="!rateFolded[i]">
          <el-table v-loading="loading" :data="t.rows" stripe border class="dv-table" :row-class-name="stationRowClass" :span-method="stationSpanMethod" empty-text="暂无站点数据">
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
            <el-table-column v-for="p in t.periods" :key="p.time_code" :label="p.time_name" min-width="150" align="center">
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
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useAttendPeriodStore } from './store.js';
import { toNum, pct, rateClass } from './helpers.js';

const store = useAttendPeriodStore();
const { stationRowsFiltered, stationPeriods, rateFolded, loading } = storeToRefs(store);

/* 四张率值表：行=站点、列=时段，单元格含率值/分子/分母；首行为合计行。
   ① 的「全天加权」按考核时段权重计算，其余三张沿用后端 metrics['9999']。 */
const stationRateTables = computed(() => {
  const periods = (stationPeriods.value || [])
    .filter(p => !p.is_full_day)
    .slice().sort((a, b) => Number(a.time_code) - Number(b.time_code));

  const cellOf = (m, numKey, denKey) => {
    const n = m[numKey], d = m[denKey];
    return { rate: pct(toNum(n), toNum(d)), num: n == null ? '—' : toNum(n), den: d == null ? '—' : toNum(d) };
  };
  const sumCell = (list) => {
    let n = 0, d = 0, has = false;
    for (const c of list) {
      if (!c || c.num === '—' || c.den === '—') continue;
      has = true; n += toNum(c.num); d += toNum(c.den);
    }
    return has ? { rate: pct(n, d), num: n, den: d } : { rate: null, num: '—', den: '—' };
  };
  const weightedFull = (cells) => {
    let acc = 0, wsum = 0;
    for (const p of periods) {
      const raw = Number(p.weight);
      const w = p.weight == null || p.weight === '' || !Number.isFinite(raw) ? 100 : raw;
      if (w <= 0) continue;
      const c = cells[String(p.time_code)];
      const value = (p.ended === false || !c || c.rate == null) ? 100 : Math.min(100, c.rate);
      acc += value * w; wsum += w;
    }
    return { rate: wsum > 0 ? Math.round(acc / wsum * 10) / 10 : null };
  };
  const build = (numKey, denKey, numLabel, denLabel, title, weighted = false) => {
    const dataRows = stationRowsFiltered.value.map(r => {
      const ms = r.metrics || {};
      const cells = {};
      for (const p of periods) cells[String(p.time_code)] = cellOf(ms[String(p.time_code)] || {}, numKey, denKey);
      const full = weighted ? weightedFull(cells) : cellOf(ms['9999'] || {}, numKey, denKey);
      return { team_id: r.team_id, team_name: r.team_name, cells, full };
    });
    const totalCells = {};
    for (const p of periods) totalCells[String(p.time_code)] = sumCell(dataRows.map(r => r.cells[String(p.time_code)]));
    const totalRow = {
      team_id: '合计', team_name: '', cells: totalCells,
      full: weighted ? weightedFull(totalCells) : sumCell(dataRows.map(r => r.full)),
      _isTotal: true,
    };
    return { title, numLabel, denLabel, periods, weightedFull: weighted, rows: [totalRow, ...dataRows] };
  };
  return [
    build('achieved', 'target', '有效', '目标', '时段有效达成率（有效达成 / 目标）', true),
    build('achieved', 'scheduled', '有效', '排班', '时段排班有效出勤率（有效达成 / 排班）'),
    build('order', 'target', '有单', '目标', '时段出勤满足率（时段有单 / 目标）'),
    build('order', 'scheduled', '有单', '排班', '时段排班出勤率（时段有单 / 排班）'),
  ];
});

function rateCell(row, tc) {
  return (row.cells && row.cells[String(tc)]) || { rate: null, num: '—', den: '—' };
}
function stationRowClass({ row }) { return row._isTotal ? 'dv-total-row' : ''; }
function stationSpanMethod({ row, columnIndex }) {
  if (!row._isTotal) return;
  if (columnIndex === 0) return { colspan: 2, rowspan: 1 };
  if (columnIndex === 1) return { colspan: 0, rowspan: 0 };
}
</script>

<style src="./attend-period.css" scoped></style>
