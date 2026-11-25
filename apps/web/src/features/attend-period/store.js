import { defineStore } from 'pinia';
import { ElMessage } from 'element-plus';
import { fetchAttendTeams, saveAttendTeams, fetchAttendDataset, fetchPreSchedule } from '@shared/api/dashboards.js';

function todayStr() {
  const d = new Date(Date.now() + 8 * 3600 * 1000); // 北京时间
  return d.toISOString().slice(0, 10);
}
function tomorrowStr() {
  const d = new Date(Date.now() + 8 * 3600 * 1000 + 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

// 排班出勤看板的跨 tab 共享态：dataset 只取一次，筛选/分页/折叠状态在切 tab 时保留。
export const useAttendPeriodStore = defineStore('attendPeriod', {
  state: () => ({
    initialized: false,
    datasetKey: '',
    teamsAll: [],
    teamsCfg: [],
    teamSel: '__all__',
    date: todayStr(),
    resp: null,
    loading: false,
    dataError: '',

    cfgVisible: false,
    cfgSel: [],
    cfgSaving: false,

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
    teamOptions(state) {
      return state.teamsAll.filter((t) => !state.teamsCfg.length || state.teamsCfg.includes(String(t.id)));
    },
    isAllTeam(state) { return state.teamSel === '__all__'; },
    selTeamId(state) { return String(state.teamSel); },
    tp(state) { return state.resp?.dataset?.time_period || { rows: [], summary: {} }; },
    station(state) { return state.resp?.dataset?.station_data || { rows: [], periods: [] }; },
    rider(state) { return state.resp?.dataset?.rider_detail || { rows: [], periods: [] }; },
    tpRows() { return this.tp.rows || []; },
    stationRows() { return this.station.rows || []; },
    stationPeriods() { return this.station.periods || []; },
    riderRows() { return this.rider.rows || []; },
    riderPeriods() { return this.rider.periods || []; },
    stationRowsFiltered() {
      return this.isAllTeam ? this.stationRows : this.stationRows.filter((r) => String(r.team_id) === this.selTeamId);
    },
    riderRowsFiltered() {
      return this.isAllTeam ? this.riderRows : this.riderRows.filter((r) => String(r.team_id) === this.selTeamId);
    },
    fetchedAt(state) { return (state.resp && state.resp.fetched_at) || this.tp.fetched_at || ''; },
    isCache(state) { return (state.resp && state.resp.source) === 'cache' || this.tp.source === 'cache'; },
    dataNote(state) { return state.resp?.data_note || ''; },
    needRefresh(state) { return !!state.resp && state.resp.need_refresh === true; },
    hasData() { return this.tpRows.length > 0 || this.stationRows.length > 0 || this.riderRows.length > 0; },
  },
  actions: {
    // 页面壳每次挂载都调用：只第一次取站点配置与数据集，切 tab 重建壳不会重新请求。
    async ensureInit() {
      if (this.initialized) return;
      this.initialized = true;
      try {
        const t = await fetchAttendTeams();
        this.teamsAll = (t && t.all) || [];
        this.teamsCfg = (t && t.teams) || [];
      } catch (e) { /* 站点配置失败不阻断看板 */ }
      await this.loadCached();
    },
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
    openCfg() {
      this.cfgSel = [...this.teamsCfg];
      this.cfgVisible = true;
    },
    async saveCfg() {
      this.cfgSaving = true;
      try {
        const res = await saveAttendTeams(this.cfgSel);
        if (res && res.ok) {
          this.teamsCfg = res.teams || [...this.cfgSel];
          ElMessage.success('站点配置已保存');
          this.cfgVisible = false;
          await this.refresh();
        } else {
          ElMessage.error((res && res.error) || '保存失败');
        }
      } catch (e) {
        ElMessage.error(e.message || '保存失败');
      } finally {
        this.cfgSaving = false;
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
        const ids = this.isAllTeam ? this.teamOptions.map((t) => t.id) : [this.selTeamId];
        if (!ids.length) throw new Error('没有可导出的站点，请先配置展示站点');
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
