/**
 * 取数基座可编辑配置（P0/P1 最小原型）。
 *
 * 边界：本文件只描述“可编辑参数”，编排逻辑仍留在手写服务里（不做通用流程引擎）。
 * 每个试点 id 在 BUILTIN_DEFAULTS 有一份完整内建默认（取自当前硬编码常量）；
 * 运行时 resolveConfig() = 内建默认 deep-merge DB 中已发布且 enabled 的覆盖项。
 * 关掉 enabled 立刻回退到内建行为 —— 这是生产安全的兜底。
 */

/**
 * 基座类型（决定配置表单与 handler）：
 *   http-query       POST/GET + JSON body（含 GET query 变体）
 *   async-export     三段式异步导出（触发→轮询→签名URL→下载）
 *   signed-download  两段式签名下载（POST 触发即返回 URL→下载，无轮询）
 *   quark-widget     Quark/FBI WidgetAction（form-urlencoded + 运行时凭证）
 *   passthrough      薄封装/SDK 基座，无独立 HTTP 点，配置继承上游
 */
export type SourceType = 'http-query' | 'async-export' | 'signed-download' | 'quark-widget' | 'passthrough';
export type AuthRef = 'aeolus-cookie' | 'quark-cookie' | 'dingtalk' | 'none';

export interface SourceLimits {
  timeoutMs: number;
  maxRows: number;
  maxPages?: number;
}

export interface HttpQueryConfig {
  method: 'GET' | 'POST';
  url: string;
  /** 结构化请求体模板，值支持 {{var}} 占位符；GET 时可省略。 */
  body?: Record<string, unknown>;
  /** GET query-string 模板（knight/orange-storm 等 GET 基座）；与 body 二选一。 */
  query?: Record<string, unknown>;
  page?: { sizeParam: string; maxPages: number };
}

/** 两段式签名下载（POST 触发即返回 fileUrl → GET 下载，无轮询）。 */
export interface SignedDownloadConfig {
  triggerUrl: string;
  triggerBody?: Record<string, unknown>;
  parser: 'violation-csv' | 'schedule-xlsx';
  /** 响应里签名 URL 的字段路径（默认 data）。 */
  urlPath?: string;
}

/** Quark/FBI WidgetAction：form-urlencoded params=JSON，凭证在运行时注入不入配置。 */
export interface QuarkWidgetConfig {
  url: string;
  reportId: string;
  datasetGuid: number;
  widgetId: string;
  queryId: string;
  /** 字段 GUID 列表（业务列），可按看板口径调整。 */
  fieldGuids?: string[];
}

/** 薄封装基座：无独立 HTTP 点，说明配置继承哪个上游基座。 */
export interface PassthroughConfig {
  inherits: string;
  note?: string;
}

export interface AsyncExportConfig {
  triggerUrl: string;
  taskListUrl: string;
  taskUrlUrl: string;
  triggerBody?: Record<string, unknown>;
  claim: {
    idPath: string;
    statusPath: string;
    readyStatus: number;
    maxIdSnapshot: boolean;
  };
  pollIntervalMs: number;
  pollTimeoutMs: number;
  downloadTimeoutMs: number;
  parser: 'delivery-xlsx' | 'violation-csv' | 'schedule-xlsx';
}

export interface SourceConfig {
  id: string;
  type: SourceType;
  enabled: boolean;
  /** 只存引用，绝不存凭证值。 */
  authRef: AuthRef;
  limits: SourceLimits;
  http?: HttpQueryConfig;
  export?: AsyncExportConfig;
  download?: SignedDownloadConfig;
  quark?: QuarkWidgetConfig;
  passthrough?: PassthroughConfig;
}

/**
 * 模板渲染上下文（http-query）。占位符写成字符串 '{{name}}'，渲染时按 name
 * 替换为对应 JS 值（数字/数组保持类型，字符串正常）；key 也可占位，空 key 被丢弃。
 */
export interface TemplateContext {
  startMs: number;
  endMs: number;
  current: number;
  pageSize: number;
  period: string;
  timeField: string;
  teamIds?: number[];
  rider?: string;
  teamIdsField: string;
  riderField: string;
  timeStartKey: string;
  timeEndKey: string;
  timePeriodListKey: string;
}

/** 当前只允许这几个已知上游域，防 SSRF。新增域需改代码评审。 */
export const ALLOWED_HOSTS = new Set([
  'httpizza.ele.me',
  'aeolus.ele.me',
  'app2-edu.ele.me',
  'quark.alibaba.com',
]);

/**
 * 内建默认：与 delivery-query.service.ts / delivery-export.service.ts 的硬编码常量一致。
 * 仅登记 P1 试点可编辑的字段；其它基座暂不支持配置覆盖（读时会回退到原服务）。
 */
export const BUILTIN_DEFAULTS: Record<string, SourceConfig> = {
  'delivery-query': {
    id: 'delivery-query',
    type: 'http-query',
    enabled: false, // 默认关闭：生产仍走 DeliveryQueryService，配置只在 dry-run 生效
    authRef: 'aeolus-cookie',
    limits: { timeoutMs: 40000, maxRows: 200, maxPages: 190 },
    http: {
      method: 'POST',
      url: 'https://httpizza.ele.me/xtop/xtop.agencyTrackingFs.queryTracking/2.0',
      body: {
        params: {
          request: {
            '{{timeStartKey}}': '{{startMs}}',
            '{{timeEndKey}}': '{{endMs}}',
            '{{teamIdsField}}': '{{teamIds}}',
            '{{riderField}}': '{{rider}}',
            merchantConsumerDistanceStart: '0',
            merchantConsumerDistanceEnd: '999999',
            payAmountStart: '0',
            payAmountEnd: '999999',
            weightStart: '0',
            weightEnd: '999999',
            current: '{{current}}',
            pageSize: '{{pageSize}}',
            trackingStateKey: 'all',
            trackingLabelKey: 'all',
            '{{timePeriodListKey}}': ['{{period}}'],
          },
        },
      },
      page: { sizeParam: 'pageSize', maxPages: 190 },
    },
  },

  'orders': {
    id: 'orders',
    type: 'async-export',
    enabled: false, // 默认关闭：生产仍走 OrdersFetchService/DeliveryExportService
    authRef: 'aeolus-cookie',
    limits: { timeoutMs: 40000, maxRows: 200 },
    export: {
      triggerUrl:
        'https://httpizza.ele.me/xtop/xtop.merchant.agencyTrackingFs.exportTracking/2.0',
      taskListUrl:
        'https://httpizza.ele.me/xtop/xtop.merchant.agencyTrackingFs.agencyTrackingFs.queryExportTask/2.0',
      taskUrlUrl:
        'https://httpizza.ele.me/xtop/xtop.merchant.agencyTrackingFs.agencyTrackingFs.queryTaskUrl/2.0',
      triggerBody: {
        params: {
          request: {
            '{{timeStartKey}}': '{{startMs}}',
            '{{timeEndKey}}': '{{endMs}}',
            '{{teamIdsField}}': '{{teamIds}}',
            merchantConsumerDistanceStart: '0',
            merchantConsumerDistanceEnd: '999999',
            payAmountStart: '0',
            payAmountEnd: '999999',
            weightStart: '0',
            weightEnd: '999999',
            trackingStateKey: 'all',
            trackingLabelKey: 'all',
            '{{timePeriodListKey}}': ['{{period}}'],
          },
        },
      },
      claim: { idPath: 'id', statusPath: 'status', readyStatus: 1, maxIdSnapshot: true },
      pollIntervalMs: 3000,
      pollTimeoutMs: 180000,
      downloadTimeoutMs: 120000,
      parser: 'delivery-xlsx',
    },
  },

  // ---- HTTP POST / GET 查询类（在单次请求原语里覆盖 URL/body）----
  'knight-detail-query': {
    id: 'knight-detail-query', type: 'http-query', enabled: false, authRef: 'aeolus-cookie',
    limits: { timeoutMs: 30000, maxRows: 200, maxPages: 100 },
    http: {
      method: 'GET',
      url: 'https://app2-edu.ele.me/kunkka-svr/ehr/staff/knight/list',
      query: {
        pageIndex: '{{current}}', pageSize: '{{pageSize}}',
        '{{staffNameField}}': '{{staffName}}',
        '{{departmentIdField}}': '{{departmentId}}',
        '{{workStatusField}}': '{{workStatus}}',
      },
      page: { sizeParam: 'pageSize', maxPages: 100 },
    },
  },
  'violation-list': {
    id: 'violation-list', type: 'http-query', enabled: false, authRef: 'aeolus-cookie',
    limits: { timeoutMs: 40000, maxRows: 200, maxPages: 200 },
    http: {
      method: 'POST',
      url: 'https://httpizza.ele.me/xtop/xtop.lpd.quality.control.violation.violationOrderAeolusCenterApi.queryList/1.0',
      body: {
        params: { request: {
          violationStartTime: '{{startMs}}', violationEndTime: '{{endMs}}',
          '{{teamIdsField}}': '{{teamIds}}', '{{riderField}}': '{{rider}}',
          pageNo: '{{current}}', pageSize: '{{pageSize}}',
        } },
      },
      page: { sizeParam: 'pageSize', maxPages: 200 },
    },
  },
  'attendance': {
    id: 'attendance', type: 'http-query', enabled: false, authRef: 'aeolus-cookie',
    limits: { timeoutMs: 30000, maxRows: 200 },
    http: {
      method: 'POST',
      url: 'https://httpizza.ele.me/xtop/xtop.fs.special.realtimeattendance.listAttendance/1.0',
      body: { teamId: '{{teamId}}', timeCode: '{{timeCode}}', shiftedOffline: 0 },
    },
  },
  'schedule': {
    id: 'schedule', type: 'http-query', enabled: false, authRef: 'aeolus-cookie',
    limits: { timeoutMs: 40000, maxRows: 200 },
    http: {
      method: 'POST',
      url: 'https://httpizza.ele.me/xtop/xtop.fs.special.schedule.listScheduleStatistics/1.0',
      body: { teamId: '{{teamId}}', startDate: '{{startDate}}', endDate: '{{endDate}}' },
    },
  },
  'board': {
    id: 'board', type: 'http-query', enabled: false, authRef: 'aeolus-cookie',
    limits: { timeoutMs: 40000, maxRows: 200, maxPages: 100 },
    http: {
      method: 'POST',
      url: 'https://httpizza.ele.me/xtop/xtop.ryze.fs.agency.team.task.listByPage/1.0',
      body: { params: { queryVO: { pageSize: '{{pageSize}}', pageIndex: '{{current}}', status: '{{status}}' } } },
      page: { sizeParam: 'pageSize', maxPages: 100 },
    },
  },
  'visit': {
    id: 'visit', type: 'http-query', enabled: false, authRef: 'aeolus-cookie',
    limits: { timeoutMs: 40000, maxRows: 200, maxPages: 20 },
    http: {
      method: 'POST',
      url: 'https://httpizza.ele.me/xtop/xtop.minos.core.IContactTaskService.querySubTaskPage/1.0',
      body: { params: { param: { mainTaskId: '{{mainTaskId}}', pageNo: '{{current}}', pageSize: '{{pageSize}}' } } },
      page: { sizeParam: 'pageSize', maxPages: 20 },
    },
  },
  'ruledoc': {
    id: 'ruledoc', type: 'http-query', enabled: false, authRef: 'aeolus-cookie',
    limits: { timeoutMs: 30000, maxRows: 200 },
    http: {
      method: 'POST',
      url: 'https://httpizza.ele.me/xtop/xtop.robot.admin.ruleInfoViewFs.queryRuleInfo/1.0',
      body: { params: { request: { isHistory: '{{isHistory}}', id: '{{ruleId}}' } } },
    },
  },
  'teams': {
    id: 'teams', type: 'http-query', enabled: false, authRef: 'aeolus-cookie',
    limits: { timeoutMs: 30000, maxRows: 200 },
    http: { method: 'POST', url: 'https://httpizza.ele.me/xtop/xtop.lpd.intelligentConfig.getTeamsAll/1.0', body: {} },
  },
  'orange-storm': {
    id: 'orange-storm', type: 'http-query', enabled: false, authRef: 'aeolus-cookie',
    limits: { timeoutMs: 30000, maxRows: 200, maxPages: 100 },
    http: {
      method: 'GET',
      url: 'https://httpizza.ele.me/alsc-lpd-omp-inspection-prod/qc/fs/judgement/queryQcList',
      query: {
        hitTimeStart: '{{startMs}}', hitTimeEnd: '{{endMs}}',
        pageIndex: '{{current}}', pageSize: '{{pageSize}}',
      },
      page: { sizeParam: 'pageSize', maxPages: 100 },
    },
  },

  // ---- 两段式签名下载 ----
  'violation-csv': {
    id: 'violation-csv', type: 'signed-download', enabled: false, authRef: 'aeolus-cookie',
    limits: { timeoutMs: 30000, maxRows: 200 },
    download: {
      triggerUrl: 'https://httpizza.ele.me/xtop/xtop.lpd.quality.control.violation.violationOrderAeolusCenterApi.download/1.0',
      triggerBody: { params: { request: { violationStartTime: '{{startMs}}', violationEndTime: '{{endMs}}' } } },
      parser: 'violation-csv', urlPath: 'data',
    },
  },
  'schedule-export': {
    id: 'schedule-export', type: 'signed-download', enabled: false, authRef: 'aeolus-cookie',
    limits: { timeoutMs: 40000, maxRows: 200 },
    download: {
      triggerUrl: 'https://httpizza.ele.me/xtop/xtop.fs.special.schedule.exportSchedule/1.0',
      triggerBody: { params: { request: { '{{teamIdsField}}': '{{teamIds}}', startDate: '{{startDate}}', endDate: '{{endDate}}' } } },
      parser: 'schedule-xlsx', urlPath: 'data',
    },
  },

  // ---- Quark/FBI Widget ----
  'contact-im': {
    id: 'contact-im', type: 'quark-widget', enabled: false, authRef: 'quark-cookie',
    limits: { timeoutMs: 40000, maxRows: 200 },
    quark: {
      url: 'https://quark.alibaba.com/fbi/.json?action=report/WidgetAction&event_submit_doGetWidgetData=true&componentName=pivot-table&_widgetId=24lbeuxm&_ts_=mvaejtzm',
      reportId: '473269', datasetGuid: 77667002, widgetId: '24lbeuxm', queryId: 'mmqqcbwty_ujfzj5',
    },
  },
  'equipment': {
    id: 'equipment', type: 'quark-widget', enabled: false, authRef: 'quark-cookie',
    limits: { timeoutMs: 40000, maxRows: 200 },
    quark: {
      url: 'https://quark.alibaba.com/fbi/.json?action=report/WidgetAction&event_submit_doGetWidgetData=true&componentName=fbi-common-table&_widgetId=mmds9k0ty_f1vr3j&_ts_=mszj2wz8',
      reportId: '860325', datasetGuid: 72835376, widgetId: 'mmds9k0ty_f1vr3j', queryId: '',
    },
  },

  // ---- 薄封装 / 特殊基座：继承上游配置 ----
  'assessment-delivery': {
    id: 'assessment-delivery', type: 'passthrough', enabled: false, authRef: 'none',
    limits: { timeoutMs: 40000, maxRows: 200 },
    passthrough: { inherits: 'orders', note: '复用 orders（运单导出）配置' },
  },
  'assessment-violation': {
    id: 'assessment-violation', type: 'passthrough', enabled: false, authRef: 'none',
    limits: { timeoutMs: 40000, maxRows: 200 },
    passthrough: { inherits: 'violation-csv', note: '复用 violation-csv（违规导出）配置' },
  },
  'delivery-timeout': {
    id: 'delivery-timeout', type: 'passthrough', enabled: false, authRef: 'none',
    limits: { timeoutMs: 40000, maxRows: 200 },
    passthrough: { inherits: 'orders', note: '复用 orders（运单导出）配置' },
  },
  'dingtalk-id': {
    id: 'dingtalk-id', type: 'passthrough', enabled: false, authRef: 'dingtalk',
    limits: { timeoutMs: 40000, maxRows: 200 },
    passthrough: { inherits: 'none', note: '钉钉 SDK + 文件缓存 + PG 消歧，无 HTTP 取数点，不提供配置覆盖' },
  },
};

/** 深度合并：仅用 override 的非 undefined 值覆盖 base，数组整体替换。 */
export function deepMerge<T>(base: T, override: unknown): T {
  if (!override || typeof override !== 'object' || Array.isArray(override)) {
    return (override === undefined ? base : (override as T));
  }
  const src = base as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = Array.isArray(base)
    ? ([...(base as unknown as unknown[])] as unknown as Record<string, unknown>)
    : { ...src };
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    if (
      v && typeof v === 'object' && !Array.isArray(v) &&
      out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])
    ) {
      out[k] = deepMerge(out[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

/** 递归渲染 {{var}} 占位符。 */
export function renderTemplate<T>(value: T, ctx: Record<string, unknown>): T {
  if (typeof value === 'string') {
    const m = /^\{\{(\w+)\}\}$/.exec(value.trim());
    if (m && Object.prototype.hasOwnProperty.call(ctx, m[1])) return ctx[m[1]] as T;
    return value.replace(/\{\{(\w+)\}\}/g, (full, name: string) =>
      Object.prototype.hasOwnProperty.call(ctx, name) && ctx[name] != null
        ? String(ctx[name])
        : full,
    ) as T;
  }
  if (Array.isArray(value)) return value.map((v) => renderTemplate(v, ctx)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const key = String(renderTemplate(k, ctx) ?? '');
      if (!key) continue;
      out[key] = renderTemplate(v, ctx);
    }
    return out as T;
  }
  return value;
}

/**
 * 从页面变量构建模板上下文（生产路径与试运行共用，保证渲染口径一致）。
 * 内置变量只作默认，显式传入的值优先；数字/站点 ID 做规范化。
 */
export function buildTemplateContext(
  values: Record<string, unknown> | undefined,
  pageSize: number,
  timeFields: string[],
  defaultTimeField: string,
): Record<string, unknown> {
  const v: Record<string, unknown> = { ...(values || {}) };
  const date = String(v.date || new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10));
  const timeField = timeFields.includes(String(v.timeField || '')) ? String(v.timeField) : defaultTimeField;
  const startMs = v.startMs != null ? Number(v.startMs) : Date.parse(`${date}T00:00:00.000+08:00`);
  const endMs = v.endMs != null ? Number(v.endMs) : Date.parse(`${date}T23:59:59.999+08:00`);
  const teamRaw = v.teamIds;
  const teamIds = Array.isArray(teamRaw)
    ? teamRaw.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0)
    : String(teamRaw || '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
  const rider = String(v.rider || '').trim() || undefined;
  const defaults: Record<string, unknown> = {
    date,
    timeField,
    startMs,
    endMs,
    current: 1,
    pageSize,
    period: '0-86400',
    teamIds,
    rider,
    teamIdsField: teamIds.length ? 'teamIds' : '',
    riderField: rider ? 'knightInfo' : '',
    timeStartKey: `${timeField}Start`,
    timeEndKey: `${timeField}End`,
    timePeriodListKey: `${timeField}TimePeriodList`,
    // GET 类基座的可选过滤字段（空串→渲染时空 key 被丢弃，实现"不传=不过滤"）
    staffNameField: v.staffName ? 'staffName' : '',
    departmentIdField: v.departmentId ? 'departmentId' : '',
    workStatusField: v.workStatus ? 'workStatus' : '',
    // 时间字段别名（violation/schedule/orange-storm 用 startDate/endDate 或 hitTime*）
    startDate: v.startDate || date,
    endDate: v.endDate || date,
    status: v.status || 'started',
    isHistory: v.isHistory ?? false,
  };
  for (const k of ['current', 'pageSize', 'startMs', 'endMs']) {
    if (v[k] != null) v[k] = Number(v[k]);
  }
  if ('teamIds' in v) v.teamIds = teamIds;
  return { ...defaults, ...v };
}

/** 递归找出仍残留的 {{var}}，提示调用方补填。 */
export function findUnresolved(value: unknown, out = new Set<string>()): string[] {
  if (typeof value === 'string') {
    for (const m of value.matchAll(/\{\{(\w+)\}\}/g)) out.add(m[1]);
  } else if (Array.isArray(value)) {
    for (const item of value) findUnresolved(item, out);
  } else if (value && typeof value === 'object') {
    for (const [k, val] of Object.entries(value)) {
      findUnresolved(k, out);
      findUnresolved(val, out);
    }
  }
  return [...out];
}

function checkUrl(url: unknown, label: string): string[] {
  if (typeof url !== 'string' || !url) return [`${label} 不能为空`];
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return [`${label} 协议只允许 http/https`];
    if (!ALLOWED_HOSTS.has(u.hostname)) return [`${label} 域名不在白名单：${u.hostname}`];
    return [];
  } catch {
    return [`${label} 不是合法 URL`];
  }
}

function inRange(n: unknown, min: number, max: number): boolean {
  const v = Number(n);
  return Number.isFinite(v) && v >= min && v <= max;
}

/** 保存/发布前校验：URL 白名单 + 各类上限 + 类型必填字段。返回错误列表（空=通过）。 */
export function validateSourceConfig(cfg: SourceConfig): string[] {
  const errors: string[] = [];
  if (!cfg || typeof cfg !== 'object') return ['配置不能为空'];
  if (!cfg.id) errors.push('id 不能为空');
  const TYPES: SourceType[] = ['http-query', 'async-export', 'signed-download', 'quark-widget', 'passthrough'];
  if (!TYPES.includes(cfg.type)) errors.push(`type 只能是 ${TYPES.join(' / ')}`);
  if (!['aeolus-cookie', 'quark-cookie', 'dingtalk', 'none'].includes(cfg.authRef)) {
    errors.push('authRef 非法');
  }
  if (!inRange(cfg.limits?.timeoutMs, 1, 120000)) errors.push('limits.timeoutMs 需在 1..120000');
  if (!inRange(cfg.limits?.maxRows, 1, 200)) errors.push('limits.maxRows 需在 1..200');
  if (cfg.limits?.maxPages != null && !inRange(cfg.limits.maxPages, 1, 200)) {
    errors.push('limits.maxPages 需在 1..200');
  }
  if (cfg.type === 'http-query') {
    const h = cfg.http;
    if (!h) {
      errors.push('http 配置缺失');
    } else {
      if (h.method !== 'GET' && h.method !== 'POST') errors.push('http.method 只能是 GET / POST');
      errors.push(...checkUrl(h.url, 'http.url'));
      // 请求体允许任意 JSON 结构（对象/数组/字符串/标量），模板变量可出现在
      // 嵌套 key、value、数组元素、字符串片段中，由 renderTemplate 递归渲染。
      if (h.body != null && typeof h.body === 'function') {
        errors.push('http.body 必须是可序列化 JSON');
      }
      if (h.query != null && (typeof h.query !== 'object' || Array.isArray(h.query))) {
        errors.push('http.query 必须是对象');
      }
      if (!h.body && !h.query && h.method === 'GET') {
        // GET 基座允许只配 URL（如 teams），query 可省略
      }
    }
  }
  if (cfg.type === 'signed-download') {
    const d = cfg.download;
    if (!d) {
      errors.push('download 配置缺失');
    } else {
      errors.push(...checkUrl(d.triggerUrl, 'download.triggerUrl'));
      if (!['violation-csv', 'schedule-xlsx'].includes(d.parser)) errors.push('download.parser 非法');
    }
  }
  if (cfg.type === 'quark-widget') {
    const q = cfg.quark;
    if (!q) {
      errors.push('quark 配置缺失');
    } else {
      errors.push(...checkUrl(q.url, 'quark.url'));
      if (!q.reportId) errors.push('quark.reportId 不能为空');
      if (!Number.isFinite(Number(q.datasetGuid))) errors.push('quark.datasetGuid 非法');
    }
  }
  if (cfg.type === 'passthrough' && !cfg.passthrough?.inherits) {
    errors.push('passthrough.inherits 不能为空');
  }
  if (cfg.type === 'async-export') {
    const e = cfg.export;
    if (!e) {
      errors.push('export 配置缺失');
    } else {
      errors.push(...checkUrl(e.triggerUrl, 'export.triggerUrl'));
      errors.push(...checkUrl(e.taskListUrl, 'export.taskListUrl'));
      errors.push(...checkUrl(e.taskUrlUrl, 'export.taskUrlUrl'));
      if (!inRange(e.pollIntervalMs, 100, 60000)) errors.push('export.pollIntervalMs 需在 100..60000');
      if (!inRange(e.pollTimeoutMs, 1, 600000)) errors.push('export.pollTimeoutMs 需在 1..600000');
      if (!inRange(e.downloadTimeoutMs, 1, 600000)) errors.push('export.downloadTimeoutMs 需在 1..600000');
      if (!['delivery-xlsx', 'violation-csv', 'schedule-xlsx'].includes(e.parser)) {
        errors.push('export.parser 非法');
      }
    }
  }
  return errors;
}
