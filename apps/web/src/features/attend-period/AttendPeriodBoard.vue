<template>
  <div class="dv-period-wrap">
    <div class="dv-filter">
      <el-select v-model="tpFilterPeriod" multiple clearable collapse-tags collapse-tags-tooltip :max-collapse-tags="1" class="dv-filter-sel" placeholder="全部时段">
        <template #header>
          <div class="dv-sel-all">
            <div class="el-select-dropdown__item" @click="tpFilterPeriod = toggleSelectAll(tpFilterPeriod, tpAllPeriods)">
              {{ isAllSelected(tpFilterPeriod, tpAllPeriods) ? '反选' : '全选' }}
            </div>
          </div>
        </template>
        <el-option v-for="p in tpPeriodOptions" :key="p.code" :label="p.name" :value="p.code" />
      </el-select>
      <el-select v-model="tpFilterTeam" multiple clearable collapse-tags collapse-tags-tooltip :max-collapse-tags="1" class="dv-filter-sel" placeholder="全部站点">
        <template #header>
          <div class="dv-sel-all">
            <div class="el-select-dropdown__item" @click="tpFilterTeam = toggleSelectAll(tpFilterTeam, tpAllTeams)">
              {{ isAllSelected(tpFilterTeam, tpAllTeams) ? '反选' : '全选' }}
            </div>
          </div>
        </template>
        <el-option v-for="t in teamOptions" :key="t.id" :label="t.name" :value="String(t.id)" />
      </el-select>
      <el-select v-model="tpFilterAch" multiple clearable collapse-tags collapse-tags-tooltip class="dv-filter-sel" placeholder="全部达标状态">
        <template #header>
          <div class="dv-sel-all">
            <div class="el-select-dropdown__item" @click="tpFilterAch = toggleSelectAll(tpFilterAch, tpAchValues)">
              {{ isAllSelected(tpFilterAch, tpAchValues) ? '反选' : '全选' }}
            </div>
          </div>
        </template>
        <el-option label="达标" value="达标" />
        <el-option label="不达标" value="不达标" />
        <el-option label="可达标" value="可达标" />
        <el-option label="不可达标" value="不可达标" />
        <el-option label="未开始" value="未开始" />
      </el-select>
    </div>
    <el-card class="dv-period-card" shadow="never">
      <div class="dv-table-fill">
        <el-table v-loading="loading" :data="pagedTpRiderRows" stripe border class="dv-table" height="100%" empty-text="暂无时段数据">
          <el-table-column prop="time_name" label="时段" min-width="130" fixed align="center" show-overflow-tooltip />
          <el-table-column prop="rider_id" label="骑手ID" min-width="120" align="center" show-overflow-tooltip />
          <el-table-column prop="rider_name" label="骑手" min-width="120" align="center" show-overflow-tooltip />
          <el-table-column prop="team_name" label="站点" min-width="140" show-overflow-tooltip />
          <el-table-column label="达标" min-width="100" align="center">
            <template #default="{ row }">
              <span class="dv-cell-badge" :class="row.badgeClass">{{ row.achievedText }}</span>
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
          v-model:current-page="tpPage" v-model:page-size="tpPageSize"
          :page-sizes="[25, 50, 100]" :total="tpRiderRows.length"
          layout="total, sizes, prev, pager, next, jumper" background
          @size-change="tpPage = 1"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useAttendPeriodStore } from './store.js';
import { toNum, fmtDur, achClass } from './helpers.js';

const store = useAttendPeriodStore();
const {
  tpRows, riderRowsFiltered: riderRows, riderPeriods, teamOptions, date, loading,
  tpFilterPeriod, tpFilterTeam, tpFilterAch, tpPage, tpPageSize,
} = storeToRefs(store);

const tpPeriodOptions = computed(() => tpRows.value.map(p => ({ code: String(p.time_code), name: p.time_name })));
const tpAllPeriods = computed(() => tpPeriodOptions.value.map(p => p.code));
const tpAllTeams = computed(() => teamOptions.value.map(t => String(t.id)));
const tpAchValues = ['达标', '不达标', '可达标', '不可达标', '未开始'];
function isAllSelected(arr, values) { return values.length > 0 && values.every(v => arr.includes(v)); }
function toggleSelectAll(arr, values) {
  return isAllSelected(arr, values) ? values.filter(v => !arr.includes(v)) : [...values];
}

/* 北京时间当前时刻（不依赖浏览器本地时区） */
function bjClock() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return { day: d.toISOString().slice(0, 10), hm: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
function hmMin(s) {
  if (!s || !String(s).includes(':')) return null;
  const [h, m] = String(s).split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}
function periodRunState(p, now) {
  const sel = String(date.value || '').slice(0, 10);
  if (!sel || sel < now.day) return 'done';
  if (sel > now.day) return 'not_started';
  const s = hmMin(p.start_time), e = hmMin(p.end_time);
  if (s == null || e == null) return 'done';
  if (e <= s) return now.hm >= s ? 'running' : 'not_started';
  if (now.hm >= e) return 'done';
  if (now.hm >= s) return 'running';
  return 'not_started';
}
function runningInfo(cell, p, target, now) {
  if (cell.achieved === true) return { text: '达标', cls: 'is-ok' };
  const s = hmMin(p.start_time), e = hmMin(p.end_time);
  if (s == null || e == null) return { text: '可达标', cls: 'is-warn' };
  const span = e > s ? e - s : (24 * 60 - s) + e;
  const elapsed = Math.max(0, Math.min(span, now.hm - s));
  const remain = span - elapsed;
  const tgtO = Number(target.orders_req) || 0, doneO = Number(cell.orders) || 0;
  const tgtM = (Number(target.online_req_h) || 0) * 3600, doneM = Number(cell.online_sec) || 0;
  if (Math.max(0, tgtM - doneM) > remain * 60) return { text: '不可达标', cls: 'is-bad' };
  const tp = span > 0 ? elapsed / span : 1;
  const op = tgtO > 0 ? doneO / tgtO : 1;
  const mp = tgtM > 0 ? doneM / tgtM : 1;
  return (op >= tp && mp >= tp) ? { text: '可达标', cls: 'is-warn' } : { text: '不可达标', cls: 'is-bad' };
}

/* 骑手 × 时段逐行展开（仅列出该时段实际排班的骑手，随站点筛选） */
const tpRiderRows = computed(() => {
  const teams = tpFilterTeam.value;
  const source = teams.length ? riderRows.value.filter(r => teams.includes(String(r.team_id))) : riderRows.value;
  const riders = source.slice().sort((a, b) =>
    String(a.team_name ?? '').localeCompare(String(b.team_name ?? ''), 'zh-Hans-CN')
    || String(a.rider_id ?? '').localeCompare(String(b.rider_id ?? ''), 'zh-Hans-CN'));
  const targets = new Map(riderPeriods.value.map(p => [String(p.time_code), p]));
  const now = bjClock();
  const rows = [];
  for (const p of tpRows.value) {
    const tc = String(p.time_code);
    if (tc === '9999') continue;
    if (tpFilterPeriod.value.length && !tpFilterPeriod.value.includes(tc)) continue;
    const target = targets.get(tc) || {};
    const runState = periodRunState(p, now);
    const orderTarget = target.orders_req == null ? '—' : toNum(target.orders_req);
    const onlineTarget = target.online_req_h == null ? '—' : fmtDur(toNum(target.online_req_h) * 3600);
    for (const r of riders) {
      const cell = r.cells?.[tc];
      if (!cell?.scheduled) continue;
      let achievedText, badgeClass;
      if (runState === 'not_started') { achievedText = '未开始'; badgeClass = 'is-none'; }
      else if (cell.configured === false) { achievedText = '未配置'; badgeClass = 'is-none'; }
      else if (runState === 'running') {
        const info = runningInfo(cell, p, target, now);
        achievedText = info.text; badgeClass = info.cls;
      } else { achievedText = cell.achieved === true ? '达标' : '不达标'; badgeClass = achClass(cell.achieved); }
      if (tpFilterAch.value.length && !tpFilterAch.value.includes(achievedText)) continue;
      rows.push({
        time_name: p.time_name, rider_id: r.rider_id, rider_name: r.rider_name, team_name: r.team_name,
        achieved: cell.achieved, achievedText, badgeClass,
        orders: cell.orders ?? '—', orderTarget, orderOk: cell.order_ok,
        onlineDur: cell.online_sec == null ? '—' : fmtDur(cell.online_sec), onlineTarget, onlineOk: cell.online_ok,
      });
    }
  }
  return rows;
});
const pagedTpRiderRows = computed(() => {
  const start = (tpPage.value - 1) * tpPageSize.value;
  return tpRiderRows.value.slice(start, start + tpPageSize.value);
});
watch([date, tpFilterPeriod, tpFilterTeam, tpFilterAch, tpRiderRows], () => { tpPage.value = 1; });
</script>

<style src="./attend-period.css" scoped></style>
