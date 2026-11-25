<template>
  <div class="rt">
    <div class="rt-hero">
      <div class="rt-hero-main">
        <div class="rt-hero-title">时段达成实时看板</div>
        <div class="rt-hero-sub">
          {{ date }} <i /> 数据刷新时间：{{ fmtBJ(fetchedAt) }}
          <span v-if="staleForPeriod" class="rt-stale">数据早于该时段开始，建议刷新</span>
        </div>
      </div>
    </div>

    <div v-if="selected" class="rt-body">
      <div class="rt-left">
      <section class="rt-panel rt-online-panel">
        <header class="rt-panel-hd">
          <div>
            <div class="rt-panel-title">实时在线 <em>{{ stationOnlineCards.length }} 站</em></div>
            <div class="rt-panel-sub">
              {{ selected.start_time }} — {{ selected.end_time }}<span v-if="selected.run === 'running'"> · 剩余 {{ remainText(selected) }}</span>
            </div>
          </div>
        </header>

        <div v-if="onlineStats" class="rt-donut-row">
          <div class="rt-donut" :style="onlineDonutStyle">
            <div class="rt-donut-inner">
              <div class="rt-donut-num">{{ onlineStats.rate == null ? '—' : onlineStats.rate }}<span class="rt-donut-pct">%</span></div>
              <div class="rt-donut-unit">在线率</div>
            </div>
          </div>
          <div class="rt-donut-side">
            <div class="rt-kv"><span>排班人数</span><b>{{ onlineStats.sched }}</b></div>
            <div class="rt-kv"><span>在线人数</span><b>{{ onlineStats.online }}</b></div>
            <div class="rt-kv is-bad"><span>未在线</span><b>{{ onlineStats.notOnline }}</b></div>
          </div>
        </div>
        <div v-if="onlineStats" class="rt-online-detail">
          未在线构成：小休 {{ onlineStats.rest }} 人 · 下班 {{ onlineStats.offline }} 人
          <span v-if="onlineStats.offlineDeliv" class="rt-online-tag">其中背单下班 {{ onlineStats.offlineDeliv }} 人</span>
        </div>

        <div class="rt-station-list">
          <div v-for="s in stationOnlineCards" :key="s.team_id" class="rt-station-row">
            <div class="rt-station-top">
              <span class="rt-station-name" :title="s.team_name">{{ s.team_name }}</span>
              <span class="rt-station-rate" :class="s.tone">
                {{ s.rate == null ? '—' : s.rate + '%' }}
              </span>
            </div>
            <div class="rt-station-bar"><i :class="s.tone" :style="{ width: barWidth(s.rate) }" /></div>
            <div class="rt-station-foot">
              排班 {{ s.sched }} · 在线 {{ s.online }} · 未在线 {{ s.notOnline }}（小休 {{ s.rest }}人 · 下班 {{ s.offline }}<span v-if="s.restDeliv"> · 背单小休 {{ s.restDeliv }}</span><span v-if="s.offlineDeliv"> · 背单下班 {{ s.offlineDeliv }}</span>）
            </div>
          </div>
          <div v-if="!stationOnlineCards.length" class="rt-empty">暂无站点在线数据</div>
        </div>
      </section>

      <section class="rt-panel rt-station-panel">
        <header class="rt-panel-hd">
          <div class="rt-panel-title">达成情况 <em>{{ stationCards.length }} 站</em></div>
          <span class="rt-panel-sub">{{ selected.time_name }}</span>
        </header>

        <div class="rt-donut-row">
          <div class="rt-donut" :style="donutStyle">
            <div class="rt-donut-inner">
              <div class="rt-donut-num">{{ overview.rateShown == null ? '—' : overview.rateShown }}<span class="rt-donut-pct">%</span></div>
              <div class="rt-donut-unit">{{ selected.run === 'running' ? '预计排班有效' : '排班有效' }}</div>
            </div>
          </div>
          <div class="rt-donut-side">
            <div class="rt-kv"><span>目标人数</span><b>{{ overview.target == null ? '—' : overview.target }}</b></div>
            <div class="rt-kv"><span>排班人数</span><b>{{ overview.scheduled == null ? '—' : overview.scheduled }}</b></div>
            <div class="rt-kv is-brand"><span>已达标 + 预估可达</span><b>{{ overview.achievedN + overview.projectedN }}</b></div>
          </div>
        </div>

        <div class="rt-breakdown">
          <div class="rt-brk is-done">
            <span class="rt-brk-dot" /><span>已达标</span><b>{{ overview.achievedN }}</b>
          </div>
          <div class="rt-brk is-project">
            <span class="rt-brk-dot" /><span>预估可达标</span><b>{{ overview.projectedN }}</b>
          </div>
          <div class="rt-brk is-bad">
            <span class="rt-brk-dot" /><span>不可达标</span><b>{{ overview.badN }}</b>
          </div>
        </div>

        <div class="rt-station-list">
          <div v-for="s in stationCards" :key="s.team_id" class="rt-station-row">
            <div class="rt-station-top">
              <span class="rt-station-name" :title="s.team_name">{{ s.team_name }}</span>
              <span class="rt-station-rate" :class="{ 'is-est': selected.run === 'running' }">
                {{ s.rateShown == null ? '—' : s.rateShown + '%' }}
              </span>
            </div>
            <div class="rt-station-bar"><i :style="{ width: barWidth(s.rateShown) }" /></div>
            <div class="rt-station-foot">
              排班 {{ s.scheduled == null ? '—' : s.scheduled }} · 达标 {{ s.achievedN }} · 预估达标 {{ s.projectedN }} · 不可达标 {{ s.badN }}
            </div>
          </div>
          <div v-if="!stationCards.length" class="rt-empty">暂无站点数据</div>
        </div>
      </section>
      </div>

      <section class="rt-panel rt-riders">
        <header class="rt-panel-hd rt-riders-hd">
          <div class="rt-panel-title">骑手达成明细 <em>{{ filteredRiders.length }} 人</em></div>
          <div class="rt-tools">
            <el-input v-model="keyword" clearable placeholder="搜索骑手 / 站点" class="rt-search" />
            <el-select v-model="schedFilter" clearable placeholder="全部排班" class="rt-sched-sel">
              <el-option label="排班" value="yes" />
              <el-option label="未排班" value="no" />
            </el-select>
            <el-select v-model="wsFilter" multiple collapse-tags collapse-tags-tooltip :max-collapse-tags="1"
                       clearable placeholder="全部在线状态" class="rt-ws-sel">
              <el-option v-for="opt in wsOptions" :key="opt" :label="opt" :value="opt" />
            </el-select>
            <el-select v-model="delivFilter" multiple collapse-tags collapse-tags-tooltip :max-collapse-tags="1"
                       clearable placeholder="全部配送中单量" class="rt-deliv-sel" @change="onDelivChange">
              <el-option label="全选" :value="SELECT_ALL" />
              <el-option v-for="v in delivOptions" :key="v" :label="String(v)" :value="v" />
            </el-select>
            <el-radio-group v-model="statusFilter">
              <el-radio-button value="all">全部</el-radio-button>
              <el-radio-button value="achieved">已达标</el-radio-button>
              <el-radio-button value="projected">可达标</el-radio-button>
              <el-radio-button value="bad">不可达标</el-radio-button>
            </el-radio-group>
          </div>
        </header>

        <div class="rt-table">
          <el-table
            :data="pagedRiders" stripe class="rt-el-table" height="100%"
            empty-text="该筛选条件下暂无骑手" :default-sort="{ prop: 'orders', order: orderSort || undefined }"
            @sort-change="onOrderSortChange"
          >
            <el-table-column prop="rider_name" label="骑手" min-width="120" fixed>
              <template #default="{ row }">
                <span class="rt-rider">
                  <span class="rt-rider-top">
                    <b>{{ row.rider_name || '—' }}</b>
                    <span class="rt-sched-tag" :class="row.scheduled ? 'is-yes' : 'is-no'">
                      {{ row.scheduled ? '排班' : '未排班' }}
                    </span>
                  </span>
                  <small>{{ row.rider_id }}</small>
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="team_name" label="站点" min-width="130" show-overflow-tooltip />
            <el-table-column label="在线状态" min-width="110" align="center">
              <template #default="{ row }">
                <span class="rt-ws" :class="workStatusInfo(row).cls">{{ workStatusInfo(row).text }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="deliveryOrder" label="配送中单量" min-width="110" align="center">
              <template #default="{ row }">
                <span :class="{ 'rt-deliv': row.deliveryOrder > 0 }">{{ row.deliveryOrder }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="orders" label="完成单量" min-width="150" align="center" sortable="custom">
              <template #default="{ row }">
                <span class="rt-orders" :class="{ 'is-short': row.ordersShort }" title="已达标需单量与时长同时达标；预估仅按时长">
                  {{ row.orders == null ? '—' : row.orders }}<em> / {{ row.orderTarget ? row.orderTarget : '免考核' }}</em>
                </span>
              </template>
            </el-table-column>
            <el-table-column label="有效在线时长" min-width="280" align="center">
              <template #default="{ row }">
                <span class="rt-prog" :title="gapText(row)">
                  <span class="rt-prog-txt" :class="{ 'is-short': !!gapText(row) }">
                    {{ row.doneSec == null ? '—' : fmtH(row.doneSec) }}<em> / {{ row.reqSec ? fmtH(row.reqSec) : '免考核' }}</em>
                  </span>
                  <span class="rt-prog-bar">
                    <i :style="{ width: row.donePct + '%' }" />
                    <em v-if="row.canProject && row.potentialPct > row.donePct"
                        :style="{ left: row.donePct + '%', width: (row.potentialPct - row.donePct) + '%' }" />
                  </span>
                </span>
              </template>
            </el-table-column>
            <el-table-column label="达成状态" min-width="130" align="center">
              <template #default="{ row }">
                <span class="rt-status" :class="row.status.tone">{{ row.status.text }}</span>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div class="rt-pager">
          <el-pagination
            v-model:current-page="page" v-model:page-size="pageSize"
            :page-sizes="[25, 50, 100]" :total="filteredRiders.length"
            layout="total, sizes, prev, pager, next" background
            @size-change="page = 1"
          />
        </div>
      </section>
    </div>

    <div v-else class="rt-empty-board">
      <el-empty description="暂无可展示的时段达成数据" />
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
  riderRows: { type: Array, default: () => [] },
  stationRows: { type: Array, default: () => [] },
  periods: { type: Array, default: () => [] },
  date: { type: String, default: '' },
  fetchedAt: { type: String, default: '' },
});

/* 北京时间时钟：每 30 秒跳一次，让进行中时段的剩余时长持续更新 */
const nowTick = ref(Date.now());
let timer = null;
onMounted(() => { timer = setInterval(() => { nowTick.value = Date.now(); }, 30000); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });

const bj = computed(() => {
  const d = new Date(nowTick.value + 8 * 3600 * 1000);
  return {
    day: d.toISOString().slice(0, 10),
    min: d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60,
  };
});
const isToday = computed(() => String(props.date || '').slice(0, 10) === bj.value.day);
const isFuture = computed(() => String(props.date || '').slice(0, 10) > bj.value.day);

function _hm(v) {
  if (v == null || v === '') return null;
  const a = String(v).split(':');
  if (a.length < 2) return null;
  const h = Number(a[0]), m = Number(a[1]);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}
function _pct(n, d) { return d > 0 ? Math.round((n / d) * 1000) / 10 : null; }
/* 北京时间展示：fetched_at 带 +08:00 偏移，统一按 UTC+8 解析后格式化为 yyyy-mm-dd hh:mm:ss */
function fmtBJ(v) {
  if (!v) return '—';
  const s = String(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return s;
  const [, y, mo, d, h, mi, sec] = m;
  const offset = s.match(/([+-])(\d{2}):(\d{2})$/) || (/Z$/i.test(s) ? ['Z', '+', '00', '00'] : null);
  if (offset) {
    const sign = offset[1] === '-' ? -1 : 1;
    const diffMin = sign * (Number(offset[2]) * 60 + Number(offset[3])) - 8 * 60;
    if (diffMin !== 0) {
      const t = Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec) - diffMin * 60000;
      const b = new Date(t);
      const p = n => String(n).padStart(2, '0');
      return `${b.getUTCFullYear()}-${p(b.getUTCMonth() + 1)}-${p(b.getUTCDate())} ${p(b.getUTCHours())}:${p(b.getUTCMinutes())}:${p(b.getUTCSeconds())}`;
    }
  }
  return `${y}-${mo}-${d} ${h}:${mi}:${sec}`;
}
/* 秒 → 中文时长「X小时X分钟X秒」（精确到秒，不做四舍五入） */
function fmtH(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return `${h}小时${m}分钟${ss}秒`;
}
/* 时长差额提示（精确到秒） */
function gapText(r) {
  if (r.reqSec <= 0 || r.doneSec == null) return '';
  const gap = Math.ceil(r.reqSec - r.doneSec);
  if (gap <= 0) return '';
  return `距时长达标还差 ${fmtH(gap)}`;
}
/* 在线状态：1 上班 / 2 小休 / 3 下班 / 4 申请小休 / 5 申请下班；其余未映射显示「-」 */
function workStatusInfo(row) {
  const ws = row.workStatus;
  if (ws === 2) return { text: '小休', cls: 'is-rest' };
  if (ws === 3) return { text: '下班', cls: 'is-offline' };
  if (ws === 1) return { text: '上班', cls: 'is-online' };
  if (ws === 4) return { text: '申请小休', cls: 'is-leave' };
  if (ws === 5) return { text: '申请下班', cls: 'is-leave' };
  // 其余未映射状态统一占位显示「-」，待后续更正
  return { text: '-', cls: 'is-mute' };
}

/* 时段时序：done / running / not_started + 剩余分钟数（跨日时段按次日结束处理） */
function timing(p) {
  const s = _hm(p.start_time), e = _hm(p.end_time);
  if (s == null || e == null) return { run: 'done', remain: 0, span: 0 };
  const cross = e <= s;
  const span = cross ? (1440 - s) + e : e - s;
  let run, elapsed;
  if (!isToday.value) {
    run = isFuture.value ? 'not_started' : 'done';
    elapsed = run === 'done' ? span : 0;
  } else if (cross) {
    run = bj.value.min >= s ? 'running' : 'not_started';
    elapsed = run === 'running' ? Math.min(span, Math.max(0, bj.value.min - s)) : 0;
  } else if (bj.value.min >= e) {
    run = 'done'; elapsed = span;
  } else if (bj.value.min >= s) {
    run = 'running'; elapsed = Math.min(span, Math.max(0, bj.value.min - s));
  } else {
    run = 'not_started'; elapsed = 0;
  }
  return { run, remain: Math.max(0, span - elapsed), span, cross };
}
function remainText(p) {
  const m = Math.max(0, Math.round(p.remain));
  return m >= 60 ? `${Math.floor(m / 60)}小时${m % 60}分` : `${m}分钟`;
}

/* 单骑手单时段状态 —— 判定只按「有效在线时长」，单量只展示不参与判定。
   已达成时长 + 本时段剩余时长 ≥ 时长要求 → 达标 / 预估可达标；时长要求为 0 视为免考核。 */
function riderStatus(cell, p, info) {
  if (info.run === 'not_started') return { key: 'not_started', text: '未开始', tone: 'mute' };
  if (!cell || !cell.scheduled) return { key: 'unscheduled', text: '未排班', tone: 'mute' };
  if (cell.configured === false) return { key: 'unconfigured', text: '未配置', tone: 'mute' };
  // 已达标：单量达标 且 有效在线时长达标（后端 achieved 即两项都满足的口径）
  if (cell.achieved === true) return { key: 'achieved', text: '达标', tone: 'done' };
  if (info.run === 'done') return { key: 'missed', text: '不可达标', tone: 'bad' };
  // 预估：只看有效在线时长 —— 已达成时长 + 本时段剩余时长 ≥ 时长要求（不看单量）
  const reqSec = Math.max(0, Number(p.online_req_h) || 0) * 3600;
  const doneSec = cell.online_sec == null ? 0 : Math.max(0, Number(cell.online_sec));
  return (reqSec <= 0 || doneSec + info.remain * 60 + 0.5 >= reqSec)
    ? { key: 'projected', text: '预估可达标', tone: 'project' }
    : { key: 'impossible', text: '不可达标', tone: 'bad' };
}

/* 目标人数：跨站点汇总该时段 metrics.target（无目标时回落排班人数） */
function targetOf(tc) {
  let n = 0, has = false;
  for (const sr of props.stationRows || []) {
    const m = (sr.metrics || {})[tc] || {};
    if (m.target == null) continue;
    has = true; n += Number(m.target) || 0;
  }
  return has ? n : null;
}
function scheduledOf(tc) {
  let n = 0, has = false;
  for (const sr of props.stationRows || []) {
    const m = (sr.metrics || {})[tc] || {};
    if (m.scheduled == null) continue;
    has = true; n += Number(m.scheduled) || 0;
  }
  return has ? n : null;
}

const periodCards = computed(() => {
  return (props.periods || [])
    .filter(p => !p.is_full_day && String(p.time_code) !== '9999')
    .map(p => {
      const info = timing(p);
      const tc = String(p.time_code);
      const target = targetOf(tc);
      let achievedN = 0, projectedN = 0, badN = 0;
      for (const r of props.riderRows || []) {
        const st = riderStatus((r.cells || {})[tc], p, info);
        if (st.key === 'achieved') achievedN++;
        else if (st.key === 'projected') projectedN++;
        else if (st.key === 'impossible' || st.key === 'missed') badN++;
      }
      const shown = info.run === 'running' ? achievedN + projectedN : achievedN;
      const scheduled = scheduledOf(tc);
      // 预计达成率 = 预计排班有效（已达标 + 预估可达）/ 排班人数
      const rate = _pct(shown, scheduled);
      return {
        ...p, run: info.run, remain: info.remain, span: info.span,
        target, scheduled, achievedN, projectedN, badN,
        shown, rate, rateShown: rate == null ? null : Math.min(100, rate),
      };
    });
});

/* 本 tab 只展示当前进行中时段；不在任何时段内时 selected 为空，由空状态占位 */
const selected = computed(() =>
  (periodCards.value || []).find(c => c.run === 'running') || null
);

/* 数据取数时间早于当前时段开始 → 提示刷新（实时看板的关键可信度信号） */
const staleForPeriod = computed(() => {
  if (!isToday.value || !props.fetchedAt || !selected.value) return false;
  const m = String(props.fetchedAt).match(/T(\d{2}):(\d{2})/);
  const s = _hm(selected.value.start_time);
  if (!m || s == null) return false;
  return Number(m[1]) * 60 + Number(m[2]) < s;
});

const overview = computed(() => {
  const s = selected.value;
  if (!s) return { rate: null, rateShown: null, target: null, scheduled: null, achievedN: 0, projectedN: 0, badN: 0 };
  return {
    rate: s.rate, rateShown: s.rateShown, target: s.target, scheduled: s.scheduled,
    achievedN: s.achievedN, projectedN: s.projectedN, badN: s.badN,
  };
});
function barWidth(rate) { return Math.max(0, Math.min(100, Number(rate) || 0)) + '%'; }

/* 站点达成情况：按选中时段、以有效在线时长口径从骑手明细逐站汇总；
   目标人数取站点 metrics.target（排班预测人数），无目标回落排班人数。 */
const stationCards = computed(() => {
  const s = selected.value;
  if (!s) return [];
  const info = timing(s);
  const tc = String(s.time_code);
  const byTeam = new Map();
  for (const sr of props.stationRows || []) {
    byTeam.set(String(sr.team_id), {
      team_id: String(sr.team_id), team_name: sr.team_name,
      target: (sr.metrics || {})[tc]?.target ?? null,
      scheduled: (sr.metrics || {})[tc]?.scheduled ?? null,
      achievedN: 0, projectedN: 0, badN: 0,
    });
  }
  for (const r of props.riderRows || []) {
    const g = byTeam.get(String(r.team_id));
    if (!g) continue;
    const st = riderStatus((r.cells || {})[tc], s, info);
    if (st.key === 'achieved') g.achievedN++;
    else if (st.key === 'projected') g.projectedN++;
    else if (st.key === 'impossible' || st.key === 'missed') g.badN++;
  }
  return [...byTeam.values()].map(g => {
    const shown = info.run === 'running' ? g.achievedN + g.projectedN : g.achievedN;
    const rate = _pct(shown, g.target || g.scheduled);
    return { ...g, rate, rateShown: rate == null ? null : Math.min(100, rate) };
  }).sort((a, b) => (a.rateShown ?? Infinity) - (b.rateShown ?? Infinity));
});

const donutStyle = computed(() => {
  const v = Math.max(0, Math.min(100, Number(overview.value.rate) || 0));
  return { background: `conic-gradient(var(--c-brand) 0 ${v}%, var(--c-brand-soft) ${v}% 100%)` };
});

/* 进行中时段的实时在线概况：排班 / 在线 / 在线率 / 未在线（小休 · 下班，下班中再标背单）。
   在线 = workStatus ∉ {2 小休, 3 下班}；背单下班 = workStatus=3 且 deliveryOrder>0。 */
const onlineStats = computed(() => {
  const s = selected.value;
  if (!s || s.run !== 'running') return null;
  const tc = String(s.time_code);
  let sched = 0, online = 0, rest = 0, offline = 0, offlineDeliv = 0;
  for (const r of props.riderRows || []) {
    const cell = (r.cells || {})[tc];
    if (!cell || !cell.scheduled) continue;
    sched++;
    const ws = cell.work_status;
    if (ws === 2) rest++;
    else if (ws === 3) {
      offline++;
      if ((Number(cell.delivery_order) || 0) > 0) offlineDeliv++;
    } else {
      online++;
    }
  }
  return {
    sched, online, rest, offline, offlineDeliv,
    notOnline: rest + offline,
    rate: _pct(online, sched),
  };
});
const onlineDonutStyle = computed(() => {
  const v = Math.max(0, Math.min(100, Number(onlineStats.value?.rate) || 0));
  return { background: `conic-gradient(var(--c-brand) 0 ${v}%, var(--c-brand-soft) ${v}% 100%)` };
});

/* 按站点汇总实时在线：口径与全局一致，只统计本时段排班骑手。
   在线 = workStatus ∉ {2 小休, 3 下班}；背单下班 = workStatus=3 且 deliveryOrder>0。
   按在线率升序（最低站排最前），低于 80% 橙色、低于 60% 正红。 */
const stationOnlineCards = computed(() => {
  const s = selected.value;
  if (!s) return [];
  const tc = String(s.time_code);
  const byTeam = new Map();
  for (const sr of props.stationRows || []) {
    byTeam.set(String(sr.team_id), {
      team_id: String(sr.team_id), team_name: sr.team_name,
      sched: 0, online: 0, rest: 0, offline: 0, restDeliv: 0, offlineDeliv: 0,
    });
  }
  for (const r of props.riderRows || []) {
    const g = byTeam.get(String(r.team_id));
    if (!g) continue;
    const cell = (r.cells || {})[tc];
    if (!cell || !cell.scheduled) continue;
    g.sched++;
    const ws = cell.work_status;
    const hasDeliv = (Number(cell.delivery_order) || 0) > 0;
    if (ws === 2) {
      g.rest++;
      if (hasDeliv) g.restDeliv++;
    } else if (ws === 3) {
      g.offline++;
      if (hasDeliv) g.offlineDeliv++;
    } else {
      g.online++;
    }
  }
  return [...byTeam.values()].map(g => {
    const rate = _pct(g.online, g.sched);
    return {
      ...g, notOnline: g.rest + g.offline, rate,
      tone: rate == null ? '' : rate < 60 ? 'is-bad' : rate < 80 ? 'is-warn' : '',
    };
  }).sort((a, b) => (a.rate ?? Infinity) - (b.rate ?? Infinity));
});

/* 骑手明细行：按选中时段展开，附时长进度（实线=已达成，虚线=剩余可争取） */
const keyword = ref('');
const statusFilter = ref('all');
const schedFilter = ref('');
const wsFilter = ref([]);
/* 筛选项取自当前骑手明细实际出现的在线状态，按固定优先级排序 */
const WS_ORDER = ['上班', '小休', '申请小休', '下班', '申请下班', '未映射'];
const wsOptions = computed(() => {
  const keys = new Set();
  for (const r of allRiderRows.value) {
    const text = workStatusInfo(r).text;
    keys.add(text === '-' ? '未映射' : text);
  }
  return WS_ORDER.filter(k => keys.has(k)).concat([...keys].filter(k => !WS_ORDER.includes(k)).sort());
});
const page = ref(1);
const pageSize = ref(25);
/* 完成单量排序：'' 默认按达成状态 | 'asc' 升序 | 'desc' 降序（由 el-table sort-change 驱动，对全量数据排序） */
const orderSort = ref('');
function onOrderSortChange({ prop, order }) {
  orderSort.value = prop === 'orders' ? (order === 'ascending' ? 'asc' : order === 'descending' ? 'desc' : '') : '';
  page.value = 1;
}

const allRiderRows = computed(() => {
  const s = selected.value;
  if (!s) return [];
  const info = timing(s);
  const tc = String(s.time_code);
  const reqSec = Math.max(0, Number(s.online_req_h) || 0) * 3600;
  const remainSec = info.run === 'running' ? info.remain * 60 : 0;
  return (props.riderRows || []).filter(r => {
    const cell = (r.cells || {})[tc] || {};
    // 骑手明细是跨时段累积的，只展示本时段排班或本时段有单量的骑手
    return cell.scheduled === true || (cell.orders != null && Number(cell.orders) > 0);
  }).map(r => {
    const cell = (r.cells || {})[tc] || {};
    const status = riderStatus(cell, s, info);
    const doneSec = cell.online_sec == null ? null : Math.max(0, Number(cell.online_sec));
    const donePct = reqSec > 0 && doneSec != null ? Math.min(100, doneSec / reqSec * 100) : (status.key === 'achieved' ? 100 : 0);
    const potentialPct = reqSec > 0 ? Math.min(100, ((doneSec || 0) + remainSec) / reqSec * 100) : donePct;
    const orders = cell.orders;
    const orderTarget = Number(s.orders_req) || 0;
    const ordersShort = orderTarget > 0 && orders != null && Number(orders) < orderTarget;
    return {
      rider_id: r.rider_id, rider_name: r.rider_name, team_name: r.team_name,
      status, doneSec, reqSec,
      scheduled: cell.scheduled === true,
      workStatus: cell.work_status, deliveryOrder: Number(cell.delivery_order) || 0,
      orders, orderTarget, ordersShort,
      donePct: Math.round(donePct * 10) / 10,
      potentialPct: Math.round(potentialPct * 10) / 10,
      canProject: info.run === 'running',
    };
  }).sort((a, b) => {
    if (orderSort.value) {
      const dir = orderSort.value === 'asc' ? 1 : -1;
      const diff = (Number(a.orders) || 0) - (Number(b.orders) || 0);
      if (diff) return diff * dir;
      return String(a.rider_name || '').localeCompare(String(b.rider_name || ''), 'zh-Hans-CN');
    }
    const order = { done: 0, project: 1, bad: 2, mute: 3 };
    return (order[a.status.tone] - order[b.status.tone])
      || String(a.team_name || '').localeCompare(String(b.team_name || ''), 'zh-Hans-CN')
      || String(a.rider_name || '').localeCompare(String(b.rider_name || ''), 'zh-Hans-CN');
  });
});

/* 配送中单量筛选：选项去重自当前时段骑手明细的「配送中单量」列，数值升序。
   「全选」是下拉里的普通选项：未全选时点它全选，已全选时点它清空（反选），占位值不参与过滤。 */
const SELECT_ALL = '__ALL__';
const delivFilter = ref([]);
const delivOptions = computed(() =>
  [...new Set((allRiderRows.value || []).map(r => r.deliveryOrder))].sort((a, b) => a - b)
);
function onDelivChange(sel) {
  const arr = Array.isArray(sel) ? sel : [];
  if (!arr.includes(SELECT_ALL)) {
    delivFilter.value = arr.filter(v => v !== SELECT_ALL);
    return;
  }
  const real = arr.filter(v => v !== SELECT_ALL);
  const isAll = delivOptions.value.length > 0 && delivOptions.value.every(v => real.includes(v));
  delivFilter.value = isAll ? [] : delivOptions.value.slice();
}

const filteredRiders = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  const toneOf = { achieved: 'done', projected: 'project', bad: 'bad' };
  const wsOptions = wsFilter.value || [];
  const delivSel = delivFilter.value || [];
  return allRiderRows.value.filter(r => {
    if (statusFilter.value !== 'all' && r.status.tone !== toneOf[statusFilter.value]) {
      return false;
    }
    if (schedFilter.value && (r.scheduled ? 'yes' : 'no') !== schedFilter.value) {
      return false;
    }
    if (wsOptions.length) {
      const info = workStatusInfo(r);
      const key = info.text === '-' ? '未映射' : info.text;
      if (!wsOptions.includes(key)) return false;
    }
    if (delivSel.length && !delivSel.includes(r.deliveryOrder)) return false;
    if (!kw) return true;
    return [r.rider_name, r.rider_id, r.team_name]
      .some(v => String(v || '').toLowerCase().includes(kw));
  });
});
const pagedRiders = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return filteredRiders.value.slice(start, start + pageSize.value);
});
watch([keyword, statusFilter, schedFilter, wsFilter, delivFilter], () => { page.value = 1; });
</script>

<style scoped>
.rt { height: 100%; min-height: 0; display: flex; flex-direction: column; gap: var(--sp-16); overflow: hidden; }

/* ── 顶部品牌横幅 ── */
.rt-hero {
  flex: none; display: flex; align-items: center; justify-content: space-between; gap: var(--sp-16);
  padding: var(--sp-18) var(--sp-24); border-radius: var(--r-modal); color: #fff;
  background: linear-gradient(115deg, var(--c-brand-dark), var(--c-brand));
  box-shadow: 0 12px 30px color-mix(in srgb, var(--c-brand) 24%, transparent);
}
.rt-hero-title { font-size: 22px; font-weight: var(--fw-bold); line-height: 1.4; margin-top: 2px; }
.rt-hero-sub { display: flex; align-items: center; gap: var(--sp-8); margin-top: var(--sp-6); font-size: var(--el-font-size-extra-small); opacity: .88; }
.rt-hero-sub i { width: 3px; height: 3px; border-radius: 50%; background: currentColor; opacity: .7; }
.rt-stale { font-size: 11px; color: #fff; background: color-mix(in srgb, #000 18%, transparent); padding: 3px var(--sp-10); border-radius: var(--r-pill); white-space: nowrap; }

/* ── 主体两栏 ── */
.rt-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(300px, 360px) minmax(0, 1fr); gap: var(--sp-16); }
.rt-left { min-height: 0; display: flex; flex-direction: column; gap: var(--sp-16); }
.rt-online-panel { flex: 1; min-height: 0; }
.rt-station-panel { flex: 1; min-height: 0; }
.rt-panel { min-height: 0; display: flex; flex-direction: column; border: var(--bw) solid var(--el-border-color-lighter); border-radius: var(--r-modal); background: var(--el-bg-color); overflow: hidden; }
.rt-panel-hd { flex: none; display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-12); padding: var(--sp-16) var(--sp-18) var(--sp-12); border-bottom: var(--bw) solid var(--el-border-color-lighter); }
.rt-panel-title { font-size: var(--el-font-size-large); font-weight: var(--fw-bold); color: var(--el-text-color-primary); }
.rt-panel-title em { font-style: normal; font-size: var(--el-font-size-extra-small); font-weight: var(--fw-regular); color: var(--el-text-color-secondary); margin-left: var(--sp-6); }
.rt-panel-sub { font-size: var(--el-font-size-extra-small); color: var(--el-text-color-secondary); margin-top: var(--sp-4); font-variant-numeric: tabular-nums; }

/* 概览：甜甜圈 + 状态分布 */
.rt-donut-row { display: flex; align-items: center; gap: var(--sp-20); padding: var(--sp-12) var(--sp-18) var(--sp-8); }
.rt-donut { flex: none; width: 132px; height: 132px; border-radius: 50%; display: grid; place-items: center; box-shadow: 0 6px 18px color-mix(in srgb, var(--c-brand) 14%, transparent); }
.rt-donut-inner { width: 100px; height: 100px; border-radius: 50%; background: var(--el-bg-color); display: flex; flex-direction: column; align-items: center; justify-content: center; }
.rt-donut-num { font-size: 32px; font-weight: var(--fw-bold); color: var(--c-brand); line-height: 1.1; font-variant-numeric: tabular-nums; }
.rt-donut-pct { font-size: 18px; margin-left: 2px; }
.rt-donut-unit { font-size: 11px; color: var(--el-text-color-secondary); margin-top: var(--sp-2); }
.rt-donut-side { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--sp-10); }
.rt-kv { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-8); font-size: var(--el-font-size-extra-small); color: var(--el-text-color-secondary); }
.rt-kv b { font-size: var(--el-font-size-large); color: var(--el-text-color-primary); font-variant-numeric: tabular-nums; }
.rt-kv.is-brand b { color: var(--c-brand); }
.rt-kv.is-bad b { color: var(--el-color-danger); }
/* 未在线构成明细（位于在线甜甜圈行下方） */
.rt-online-detail { font-size: 11px; color: var(--el-text-color-secondary); margin: 0 var(--sp-18) var(--sp-8); line-height: var(--lh-relaxed); text-align: center; }
.rt-online-tag { display: inline-block; margin-left: var(--sp-6); padding: 1px var(--sp-8); border-radius: var(--r-pill); color: var(--el-color-danger); background: var(--el-color-danger-light-9); }
/* 低在线率着色（与达成列表共通行布局，仅在线行带这两个类） */
.rt-station-rate.is-warn { color: var(--el-color-warning); }
.rt-station-rate.is-bad { color: #FF0000; }
.rt-station-bar i.is-warn { background: var(--el-color-warning); }
.rt-station-bar i.is-bad { background: #FF0000; }

.rt-breakdown { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-8); padding: 0 var(--sp-18) var(--sp-12); }
.rt-brk { display: flex; align-items: center; gap: var(--sp-6); padding: var(--sp-8) var(--sp-10); border-radius: var(--el-border-radius-base); background: var(--el-fill-color-lighter); font-size: var(--el-font-size-extra-small); color: var(--el-text-color-regular); }
.rt-brk b { margin-left: auto; font-size: var(--el-font-size-medium); color: var(--el-text-color-primary); font-variant-numeric: tabular-nums; }
.rt-brk-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.rt-brk.is-done .rt-brk-dot { background: var(--c-brand); }
.rt-brk.is-project .rt-brk-dot { background: var(--c-brand-soft); border: var(--bw) solid var(--c-brand); }
.rt-brk.is-bad .rt-brk-dot { background: var(--el-color-danger); }

/* 站点达成情况 */
.rt-station-list { flex: 1; min-height: 0; overflow-y: auto; padding: var(--sp-12) var(--sp-18); display: flex; flex-direction: column; gap: var(--sp-14); }
.rt-station-row { flex: none; }
.rt-station-top { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-8); }
.rt-station-name { font-size: var(--el-font-size-extra-small); color: var(--el-text-color-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rt-station-rate { font-size: var(--el-font-size-medium); font-weight: var(--fw-bold); color: var(--c-brand); font-variant-numeric: tabular-nums; white-space: nowrap; }
.rt-station-bar { height: 6px; border-radius: var(--r-pill); background: var(--c-brand-soft); overflow: hidden; margin-top: var(--sp-6); }
.rt-station-bar i { display: block; height: 100%; border-radius: var(--r-pill); background: var(--c-brand); transition: width var(--dur-slow); }
.rt-station-foot { font-size: 11px; color: var(--el-text-color-secondary); margin-top: var(--sp-6); font-variant-numeric: tabular-nums; }

/* 骑手明细表 */
.rt-riders-hd { align-items: center; }
.rt-tools { display: flex; align-items: center; gap: var(--sp-8); flex-wrap: wrap; justify-content: flex-end; }
.rt-search { width: 170px; }
.rt-ws-sel { width: 160px; }
.rt-deliv-sel { width: 160px; }
.rt-sched-sel { width: 120px; }
.rt-table { flex: 1; min-height: 0; display: flex; flex-direction: column; }
/* 表头统一主题色底 + 白字（与站点看板等一致） */
.rt-el-table {
  --el-table-header-bg-color: var(--c-brand);
  --el-table-header-text-color: #fff;
  --el-table-row-hover-bg-color: var(--c-brand-soft);
  font-size: var(--el-font-size-extra-small);
}
.rt-el-table :deep(.el-table__cell) { padding: var(--sp-6) 0; }
.rt-el-table :deep(.cell) { padding-left: var(--sp-12); padding-right: var(--sp-12); }
/* 排序图标默认透明但保留占位，避免点击排序时列宽抖动；仅激活态显示箭头 */
.rt-el-table :deep(.caret-wrapper) { visibility: hidden; }
.rt-el-table :deep(.ascending .caret-wrapper),
.rt-el-table :deep(.descending .caret-wrapper) { visibility: visible; }
.rt-rider { display: flex; flex-direction: column; line-height: 1.35; min-width: 0; }
.rt-rider-top { display: flex; align-items: center; gap: var(--sp-6); min-width: 0; }
.rt-rider b { color: var(--el-text-color-primary); font-size: var(--el-font-size-small); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rt-sched-tag { flex: none; padding: 1px var(--sp-6); border-radius: var(--r-pill); font-size: 11px; white-space: nowrap; }
.rt-sched-tag.is-yes { color: var(--c-brand); background: var(--c-brand-soft); }
.rt-sched-tag.is-no { color: var(--el-text-color-secondary); background: var(--el-fill-color-light); }
.rt-rider small { color: var(--el-text-color-secondary); font-variant-numeric: tabular-nums; }
.rt-team { color: var(--el-text-color-regular); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 在线状态徽标 / 配送中单量 */
.rt-ws { display: inline-block; padding: 2px var(--sp-8); border-radius: var(--r-pill); font-size: 11px; font-weight: var(--fw-semibold); white-space: nowrap; }
.rt-ws.is-online { color: var(--el-color-success); background: var(--el-color-success-light-9); }
.rt-ws.is-rest { color: var(--el-color-warning); background: var(--el-color-warning-light-9); }
.rt-ws.is-leave { color: var(--el-color-primary-light-3); background: var(--c-brand-soft); }
.rt-ws.is-offline { color: var(--el-color-danger); background: var(--el-color-danger-light-9); }
.rt-ws.is-mute { color: var(--el-text-color-secondary); background: var(--el-fill-color-light); }
.rt-deliv { color: var(--c-brand); font-weight: var(--fw-semibold); font-variant-numeric: tabular-nums; }
.rt-orders { font-variant-numeric: tabular-nums; color: var(--el-text-color-primary); white-space: nowrap; }
/* 要求值（单量 / 时长）统一置灰弱化，与已达成实绩区分 */
.rt-orders em, .rt-prog-txt em { font-style: normal; color: var(--el-text-color-placeholder); }
.rt-prog { display: flex; flex-direction: column; gap: var(--sp-4); min-width: 0; }
.rt-prog-txt { color: var(--el-text-color-regular); font-variant-numeric: tabular-nums; }
/* 单量 / 时长未达成 → 完成值统一正红；要求值 em 有自己的灰色规则，不受父级影响 */
.rt-orders.is-short, .rt-prog-txt.is-short { color: #FF0000; }
.rt-prog-bar { position: relative; height: 6px; border-radius: var(--r-pill); background: var(--el-fill-color); overflow: hidden; }
.rt-prog-bar i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: var(--r-pill); background: var(--c-brand); transition: width var(--dur-slow); }
.rt-prog-bar em { position: absolute; top: 0; bottom: 0; border-radius: var(--r-pill); border: 1px dashed var(--c-brand); background: color-mix(in srgb, var(--c-brand) 14%, transparent); }
.rt-status { justify-self: start; padding: 3px var(--sp-10); border-radius: var(--r-pill); font-size: 11px; font-weight: var(--fw-semibold); white-space: nowrap; }
.rt-status.is-done { color: #fff; background: var(--c-brand); }
.rt-status.is-project { color: var(--c-brand-dark); background: var(--c-brand-soft); border: var(--bw) dashed var(--c-brand); }
.rt-status.is-bad { color: var(--el-color-danger); background: var(--el-color-danger-light-9); }
.rt-status.is-mute { color: var(--el-text-color-secondary); background: var(--el-fill-color-light); }
.rt-pager { flex: none; display: flex; justify-content: flex-end; padding: var(--sp-10) var(--sp-18); border-top: var(--bw) solid var(--el-border-color-lighter); }
.rt-empty, .rt-empty-board { padding: var(--sp-40) 0; text-align: center; color: var(--el-text-color-secondary); font-size: var(--el-font-size-extra-small); }
.rt-empty-board { flex: 1; display: grid; place-items: center; }
</style>
