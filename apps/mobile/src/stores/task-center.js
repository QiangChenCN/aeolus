import { defineStore } from 'pinia';
import { useAuthStore } from '@shared/stores/auth.js';

const API_BASE = '/api';
const ARGS_KEY = 'wb_mobile_task_args_v1';

function readArgs() {
  try {
    const raw = uni.getStorageSync(ARGS_KEY);
    return raw && typeof raw === 'object' ? raw : {};
  } catch (e) {
    return {};
  }
}

function persistArgs(args) {
  try { uni.setStorageSync(ARGS_KEY, args); } catch (e) { /* 存储不可用时仅保留内存态 */ }
}

function request(path, options = {}) {
  const { method = 'GET', data, header = {} } = options;
  return new Promise((resolve, reject) => {
    uni.request({
      url: API_BASE + path,
      method,
      data,
      header: Object.assign({ 'Content-Type': 'application/json' }, header),
      withCredentials: true,
      success(res) {
        if (res.statusCode === 401) {
          try { useAuthStore().requireLogin(); } catch (e) { /* ignore */ }
          reject(new Error('登录已失效，请重新登录'));
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }
        const body = res.data || {};
        reject(new Error(body.message || body.error || `请求失败（${res.statusCode}）`));
      },
      fail(err) { reject(new Error(err.errMsg || '网络异常，请稍后重试')); },
    });
  });
}

let es = null;
let reconnectTimer = null;
let pollTimer = null;

export const useTaskCenterStore = defineStore('taskCenter', {
  state: () => ({
    registry: { groups: [], tasks: [] },
    teams: [],
    history: [],
    current: null,
    queuedIds: [],
    runs: {},
    args: readArgs(),
    loaded: false,
    loading: false,
    sseConnected: false,
    error: '',
  }),

  getters: {
    groups: (s) => s.registry.groups || [],
    tasks: (s) => s.registry.tasks || [],
    groupById: (s) => (id) => (s.registry.groups || []).find((g) => g.id === id) || null,
    taskById: (s) => (id) => (s.registry.tasks || []).find((t) => t.id === id) || null,
    countInGroup: (s) => (id) =>
      id === 'all'
        ? (s.registry.tasks || []).length
        : (s.registry.tasks || []).filter((t) => t.group === id).length,
    runningTaskId: (s) => (s.current ? s.current.task_id : null),
  },

  actions: {
    argValue(taskId, key, def) {
      const a = this.args[taskId] || {};
      return a[key] !== undefined ? a[key] : def;
    },
    saveArgs(taskId, form) {
      this.args = Object.assign({}, this.args, { [taskId]: Object.assign({}, form) });
      persistArgs(this.args);
    },
    resetArgs(taskId) {
      if (!this.args[taskId]) return;
      const next = Object.assign({}, this.args);
      delete next[taskId];
      this.args = next;
      persistArgs(this.args);
    },
    setTaskStatus(taskId, status) {
      const t = (this.registry.tasks || []).find((x) => x.id === taskId);
      if (t) t.status = status;
    },
    applyState(data) {
      if (!data) return;
      if (data.registry) this.registry = data.registry;
      const cur = data.current || null;
      const runId = cur ? (cur.runId || cur.run_id || null) : null;
      this.current = cur
        ? { task_id: cur.taskId || cur.task_id || null, run_id: runId }
        : null;
      this.history = data.history || [];
      this.queuedIds = data.queued_ids || [];
      if (cur && runId) {
        this.runs = Object.assign({}, this.runs, {
          [runId]: Object.assign({}, cur, {
            run_id: runId,
            task_id: cur.taskId || cur.task_id || null,
            lines: data.current_lines || cur.lines || [],
          }),
        });
      }
    },
    async load() {
      if (this.loading) return;
      this.loading = true;
      this.error = '';
      try {
        const [state, teams] = await Promise.all([
          request('/state'),
          request('/teams').catch(() => null),
        ]);
        this.applyState(state);
        this.teams = (teams && teams.teams) || [];
        this.loaded = true;
      } catch (e) {
        this.error = e.message || '加载任务失败';
      } finally {
        this.loading = false;
      }
    },
    start() {
      this.load();
      this.connect();
    },
    stop() {
      this.disconnect();
      this.loaded = false;
    },
    connect() {
      if (es || pollTimer) return;
      if (typeof EventSource === 'undefined') {
        pollTimer = setInterval(() => { this.load(); }, 5000);
        return;
      }
      const open = () => {
        es = new EventSource(API_BASE + '/events');
        es.onopen = () => { this.sseConnected = true; };
        es.onerror = () => {
          this.sseConnected = false;
          if (es) { try { es.close(); } catch (e) { /* ignore */ } es = null; }
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(open, 3000);
        };
        const on = (type, fn) => es.addEventListener(type, (evt) => {
          try { fn(JSON.parse(evt.data)); } catch (e) { /* ignore */ }
        });
        on('ping', () => { this.sseConnected = true; });
        on('state', (d) => this.applyState(d));
        on('run_start', (d) => this.onRunStart(d && d.run));
        on('log', (d) => this.onLogLine(d));
        on('run_end', (d) => this.onRunEnd(d && d.run));
        on('history', (d) => { this.history = (d && d.history) || []; });
        on('queue', (d) => { this.queuedIds = ((d && d.queue) || []).map((q) => q.taskId); });
      };
      open();
    },
    disconnect() {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      if (es) { try { es.close(); } catch (e) { /* ignore */ } es = null; }
      this.sseConnected = false;
    },
    onRunStart(run) {
      if (!run || !run.runId) return;
      const id = run.runId;
      const prev = this.runs[id] || {};
      this.runs = Object.assign({}, this.runs, {
        [id]: Object.assign({}, prev, run, {
          run_id: id,
          task_id: run.taskId,
          lines: prev.lines || run.lines || [],
        }),
      });
      this.current = { task_id: run.taskId || null, run_id: id };
      if (run.taskId) this.setTaskStatus(run.taskId, run.status || 'running');
    },
    onLogLine(d) {
      if (!d || !d.run_id) return;
      const id = d.run_id;
      const prev = this.runs[id] || { run_id: id, lines: [] };
      this.runs = Object.assign({}, this.runs, {
        [id]: Object.assign({}, prev, { lines: (prev.lines || []).concat(d.line || '') }),
      });
    },
    onRunEnd(run) {
      if (!run || !run.runId) return;
      const id = run.runId;
      const prev = this.runs[id] || {};
      this.runs = Object.assign({}, this.runs, {
        [id]: Object.assign({}, prev, {
          status: run.status,
          error_kind: run.errorKind || null,
          error_advice: run.errorAdvice || null,
        }),
      });
      if (this.current && this.current.run_id === id) this.current = null;
      if (run.taskId) this.setTaskStatus(run.taskId, run.status);
      this.loadLog(id).catch(() => {});
    },
    async runTask(taskId) {
      const res = await request('/run', {
        method: 'POST',
        data: { items: [{ task_id: taskId, args: this.args[taskId] || {} }] },
      });
      const runId = (res && (res.run_id || (res.run_ids && res.run_ids[0]))) || null;
      this.resetArgs(taskId);
      return runId;
    },
    async stopRun(runId) {
      return request('/stop', { method: 'POST', data: { run_id: runId } });
    },
    async deleteRun(runId) {
      const res = await request('/runs/delete', { method: 'POST', data: { run_ids: [runId] } });
      this.history = (this.history || []).filter((x) => x.run_id !== runId);
      return res;
    },
    async loadLog(runId) {
      const res = await request('/log?run_id=' + encodeURIComponent(runId));
      if (!res || !res.ok) return;
      const prev = this.runs[runId] || { run_id: runId, lines: [], status: 'queued' };
      const lines = res.lines || [];
      const merged = Object.assign({}, prev, {
        lines: lines.length >= (prev.lines || []).length ? lines : prev.lines,
        status: res.status || prev.status,
        error_kind: res.error_kind || prev.error_kind || null,
        error_advice: res.error_advice || prev.error_advice || null,
      });
      if (res.task_id) merged.task_id = res.task_id;
      if (res.name) merged.name = res.name;
      this.runs = Object.assign({}, this.runs, { [runId]: merged });
    },
    async loadArtifacts(taskId) {
      const res = await request('/files?task_id=' + encodeURIComponent(taskId));
      return (res && res.files) || [];
    },
    artifactUrl(rel) {
      return API_BASE + '/file?path=' + encodeURIComponent(rel);
    },
  },
});
