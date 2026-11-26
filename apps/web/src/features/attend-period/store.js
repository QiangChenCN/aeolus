import { defineStore } from 'pinia';
import { ElMessage } from 'element-plus';
import { fetchAttendDataset, fetchPreSchedule } from '@shared/api/dashboards.js';

function todayStr() {
  const d = new Date(Date.now() + 8 * 3600 * 1000); // 北京时间
  return d.toISOString().slice(0, 10);
}
function tomorrowStr() {
  const d = new Date(Date.now() + 8 * 3600 * 1000 + 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

// 北京时间展示：fetched_at 带 +08:00 偏移，统一按 UTC+8 解析后格式化为 yyyy-mm-dd hh:mm:ss
export function fmtBJ(v) {
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
      const p = (n) => String(n).padStart(2, '0');
      return `${b.getUTCFullYear()}-${p(b.getUTCMonth() + 1)}-${p(b.getUTCDate())} ${p(b.getUTCHours())}:${p(b.getUTCMinutes())}:${p(b.getUTCSeconds())}`;
    }
  }
  return `${y}-${mo}-${d} ${h}:${mi}:${sec}`;
}

// 排班出勤看板的跨 tab 共享态：dataset 只取一次，筛选/分页/折叠状态在切 tab 时保留。
export const useAttendPeriodStore = defineStore('attendPeriod', {
  state: () => ({
    initialized: false,
    datasetKey: '',
    // 顶部站点多选：初始不勾选任何站点，数据默认展示所有有应排人数的站点；
    // 只有手动选择/反选后才按所选集合过滤（此时空数组 = 不展示任何站点）。
    teamSel: [],
    teamSelTouched: false,
    date: todayStr(),
    resp: null,
    loading: false,
    dataError: '',

    // 站点看板 / 骑手看板 / 时段看板 / 实时看板的本地视图态
    rateFolded: {},
    sortField: '',
    sortOrder: 'asc',
    tpFilterPeriod: [],
    tpFilterTeam: [],
    tpFilterAch: [],
    tpPage: 1,
    tpPageSize: 25,
    keyword: '',
    statusFilter: 'all',
    schedFilter: '',
    wsFilter: [],
    delivFilter: [],
    page: 1,
    pageSize: 25,
    orderSort: '',

    // 预排班独立取数
    preDates: [tomorrowStr(), tomorrowStr()],
    preRaw: { rows: [], periods: [] },
    preLoading: false,
    preLoaded: false,
    preError: '',
  }),
  getters: {
    // 站点候选来自数据集里「有应排人数（target>0）」的站点，不再依赖任何站点配置。
    teamOptions() {
      return this.stationRows
        .filter((r) => Object.values(r.metrics || {}).some((m) => Number(m?.target) > 0))
        .map((r) => ({ id: String(r.team_id), name: r.team_name || String(r.team_id) }));
    },
    allTeamIds() { return this.teamOptions.map((t) => String(t.id)); },
    isAllTeamSelected() {
      return this.allTeamIds.length > 0 && this.allTeamIds.every((id) => this.teamSel.map(String).includes(id));
    },
    // null = 未手动筛选，展示全部数据；数组 = 按选中站点过滤（空数组即不展示任何站点）。
    filterTeamIds(state) { return state.teamSelTouched ? state.teamSel.map(String) : null; },
    tp(state) { return state.resp?.dataset?.time_period || { rows: [], summary: {} }; },
    station(state) { return state.resp?.dataset?.station_data || { rows: [], periods: [] }; },
    rider(state) { return state.resp?.dataset?.rider_detail || { rows: [], periods: [] }; },
    tpRows() { return this.tp.rows || []; },
    stationRows() { return this.station.rows || []; },
    stationPeriods() { return this.station.periods || []; },
    riderRows() { return this.rider.rows || []; },
    riderPeriods() { return this.rider.periods || []; },
    stationRowsFiltered() {
      const ids = this.filterTeamIds;
      return ids === null ? this.stationRows : this.stationRows.filter((r) => ids.includes(String(r.team_id)));
    },
    riderRowsFiltered() {
      const ids = this.filterTeamIds;
      return ids === null ? this.riderRows : this.riderRows.filter((r) => ids.includes(String(r.team_id)));
    },
    fetchedAt(state) { return (state.resp && state.resp.fetched_at) || this.tp.fetched_at || ''; },
    isCache(state) { return (state.resp && state.resp.source) === 'cache' || this.tp.source === 'cache'; },
    dataNote(state) { return state.resp?.data_note || ''; },
    needRefresh(state) { return !!state.resp && state.resp.need_refresh === true; },
    hasData() { return this.tpRows.length > 0 || this.stationRows.length > 0 || this.riderRows.length > 0; },
  },
  actions: {
    // 页面壳每次挂载都调用：只第一次取数据集，切 tab 重建壳不会重新请求。
    async ensureInit() {
      if (this.initialized) return;
      this.initialized = true;
      await this.loadCached();
    },
    // 数据集变化后同步站点多选：未手动操作时保持空选（= 不过滤，展示全部有目标站点）；
    // 手动选过的只保留仍有效的站点。
    syncTeamSelection() {
      if (!this.teamSelTouched) return;
      const ids = this.allTeamIds;
      this.teamSel = this.teamSel.filter((id) => ids.includes(String(id)));
    },
    markTeamTouched() { this.teamSelTouched = true; },
    async loadCached(force = false) {
      if (!force && this.datasetKey === this.date && this.resp !== null) return;
      this.loading = true;
      this.dataError = '';
      try {
        const res = await fetchAttendDataset({ team: '__all__', date: this.date });
        if (res && res.need_refresh) this.resp = { need_refresh: true };
        else if (res && res.dataset) this.resp = res;
        else {
          this.dataError = (res && res.error) || '加载失败';
          this.resp = null;
        }
        this.datasetKey = this.date;
        this.syncTeamSelection();
      } catch (e) {
        this.dataError = e.message || '加载失败';
        this.resp = null;
      } finally {
        this.loading = false;
      }
    },
    async refresh() {
      this.loading = true;
      this.dataError = '';
      try {
        const res = await fetchAttendDataset({ team: '__all__', date: this.date, refresh: true });
        if (res && res.dataset) {
          this.resp = res;
          this.datasetKey = this.date;
          this.syncTeamSelection();
          ElMessage.success('数据已刷新');
        } else {
          this.dataError = (res && res.error) || '刷新失败';
        }
      } catch (e) {
        this.dataError = e.message || '刷新失败';
      } finally {
        this.loading = false;
      }
    },
    invalidatePre() {
      this.preLoaded = false;
      this.preRaw = { rows: [], periods: [] };
    },
    async loadPre(force = false) {
      if (this.preLoading) return;
      if (this.preLoaded && !force) return;
      const [start, end] = this.preDates || [];
      if (!start || !end) {
        this.preError = '请选择日期范围';
        return;
      }
      this.preLoading = true;
      this.preError = '';
      try {
        const ids = this.filterTeamIds === null ? this.allTeamIds : this.filterTeamIds;
        if (!ids.length) throw new Error('没有可导出的站点，请先在顶部选择站点');
        const res = await fetchPreSchedule({ teamIds: ids, start, end });
        if (res && res.ok) {
          this.preRaw = { rows: res.rows || [], periods: res.periods || [] };
          this.preLoaded = true;
        } else {
          this.preError = (res && res.error) || '预排班数据加载失败';
        }
      } catch (e) {
        this.preError = e.message || '预排班数据加载失败';
      } finally {
        this.preLoading = false;
      }
    },
  },
});
