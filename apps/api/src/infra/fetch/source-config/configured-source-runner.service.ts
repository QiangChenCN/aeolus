import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { netError } from '../../../common/net-error';
import { AeolusCookieService } from '../creds/aeolus-cookie.service';
import { AuthError, TIME_FIELDS, TIME_FIELD } from '../sources/delivery-query.service';
import { parseXlsxBytes } from '../sources/delivery-export.service';
import { normalizeOrderRow } from '../../../modules/delivery/delivery-normalize';
import { SourceConfigService } from './source-config.service';
import {
  SourceConfig,
  buildTemplateContext,
  deepMerge,
  findUnresolved,
  renderTemplate,
  validateSourceConfig,
} from './source-config.model';

/**
 * 配置驱动取数执行器：type 决定唯一 handler，配置只提供参数。
 *   · http-query：单次请求 → 归一 → 预览
 *   · async-export：触发 → 轮询认领 → 签名 URL → 下载 → 解析 → 预览
 * dry-run 走真实上游但截断行数、不落盘、不写 PG；P3 才接生产路径。
 */

const HEADERS_BASE: Record<string, string> = {
  accept: 'application/json, text/plain, */*',
  'content-type': 'application/json',
  origin: 'https://aeolus.ele.me',
  referer: 'https://aeolus.ele.me/',
};
export interface DryRunParams {
  /**
   * 模板变量的实际取值，key 与请求模板里的 {{name}} 一一对应。
   * 页面从模板自动解析变量并让用户填写；后端只负责渲染，不再写死 date/rider 等字段。
   */
  values?: Record<string, unknown>;
  /** 页面当前编辑中的配置（不落库），用于保存前直接试运行。 */
  configOverride?: Partial<SourceConfig>;
}

export interface DryRunStep {
  name: string;
  ok: boolean;
  elapsedMs: number;
  detail: string;
}

export interface DryRunResult {
  ok: true;
  id: string;
  type: string;
  url: string;
  body: Record<string, unknown>;
  steps: DryRunStep[];
  total: number;
  returned: number;
  rows: Record<string, unknown>[];
  elapsedMs: number;
}

/** 试运行上下文（复用 model 的共享构建，口径与生产路径一致）。 */
function buildContext(values: Record<string, unknown>, pageSize: number): Record<string, unknown> {
  return buildTemplateContext(values, pageSize, TIME_FIELDS, TIME_FIELD);
}

@Injectable()
export class ConfiguredSourceRunnerService {
  private readonly logger = new Logger(ConfiguredSourceRunnerService.name);

  constructor(
    private readonly configs: SourceConfigService,
    private readonly cookies: AeolusCookieService,
  ) {}

  /** 试运行：真实打一次上游，返回归一化行预览 + 分步骤耗时。不产生任何落盘/入库。 */
  async dryRun(id: string, params: DryRunParams = {}): Promise<DryRunResult> {
    const base = await this.configs.resolveConfig(id);
    const cfg = params.configOverride
      ? deepMerge<SourceConfig>(base, params.configOverride)
      : base;
    cfg.id = id;
    const errors = validateSourceConfig(cfg);
    if (errors.length) throw new BadRequestException(`配置校验失败：${errors.join('；')}`);
    if (cfg.type === 'async-export') return this.dryRunExport(id, cfg, params);
    if (cfg.type === 'signed-download') return this.dryRunDownload(id, cfg, params);
    if (cfg.type === 'passthrough') {
      throw new BadRequestException(
        `基座 ${id} 是薄封装，配置继承 ${cfg.passthrough?.inherits || '上游'}；请到上游基座试运行`,
      );
    }
    if (cfg.type === 'quark-widget') {
      throw new BadRequestException(`Quark Widget 基座 ${id} 的 payload 与运行时凭证强耦合，暂不支持试运行（仅可改端点）`);
    }
    if (cfg.type !== 'http-query' || !cfg.http) {
      throw new BadRequestException(`基座 ${id} 的类型 ${cfg.type} 暂不支持试运行`);
    }
    const t0 = Date.now();
    const steps: DryRunStep[] = [];
    const pageSize = Math.max(1, Math.min(Number(cfg.limits.maxRows) || 50, 50));

    // 1) 模板渲染（变量来自页面填写，递归支持嵌套对象/数组/动态 key/字符串片段）
    const t1 = Date.now();
    const ctx = buildContext(params.values || {}, pageSize);
    const body = renderTemplate(cfg.http.body ?? {}, ctx);
    const unresolved = findUnresolved(body);
    if (unresolved.length) {
      throw new BadRequestException(`模板变量未填值：${unresolved.join(', ')}`);
    }
    steps.push({
      name: 'render',
      ok: true,
      elapsedMs: Date.now() - t1,
      detail: `变量 ${Object.keys(ctx).length} 个，pageSize=${ctx.pageSize}，teamIds=[${
        Array.isArray(ctx.teamIds) ? ctx.teamIds.join(',') : String(ctx.teamIds || '')
      }]`,
    });

    // 2) 登录态（只存引用，值来自 cookie 体系；失效重登一次）
    const t2 = Date.now();
    let cookie = await this.cookies.ensure();
    steps.push({ name: 'cookie', ok: true, elapsedMs: Date.now() - t2, detail: 'ensure()' });

    // 3) 真实请求（含一次会话失效重试）
    const t3 = Date.now();
    let out: { rows: Record<string, unknown>[]; total: number };
    try {
      out = await this.request(cfg, body, cookie);
    } catch (e) {
      if (e instanceof AuthError) {
        steps.push({ name: 'request', ok: false, elapsedMs: Date.now() - t3, detail: `会话失效：${e.message}，重登重试` });
        const t4 = Date.now();
        cookie = await this.cookies.relogin();
        steps.push({ name: 'relogin', ok: true, elapsedMs: Date.now() - t4, detail: 'relogin()' });
        const t5 = Date.now();
        out = await this.request(cfg, body, cookie);
        steps.push({ name: 'request(retry)', ok: true, elapsedMs: Date.now() - t5, detail: `total=${out.total}` });
      } else {
        steps.push({ name: 'request', ok: false, elapsedMs: Date.now() - t3, detail: (e as Error).message });
        throw e;
      }
    }
    if (!steps.some((s) => s.name.startsWith('request') && s.ok)) {
      steps.push({ name: 'request', ok: true, elapsedMs: Date.now() - t3, detail: `total=${out.total}` });
    }

    // 4) 归一 + maxRows 截断（不落盘、不写库）
    const t6 = Date.now();
    const maxRows = Number(cfg.limits.maxRows) || 200;
    const rows = out.rows.slice(0, maxRows).map(normalizeOrderRow);
    steps.push({
      name: 'normalize',
      ok: true,
      elapsedMs: Date.now() - t6,
      detail: `返回 ${out.rows.length} 行，预览截断至 ${rows.length} 行`,
    });

    this.logger.log(`试运行 ${id}：total=${out.total} returned=${rows.length} elapsed=${Date.now() - t0}ms`);
    return {
      ok: true,
      id,
      type: cfg.type,
      url: cfg.http.url,
      body,
      steps,
      total: out.total,
      returned: rows.length,
      rows,
      elapsedMs: Date.now() - t0,
    };
  }

  private async request(
    cfg: SourceConfig,
    body: Record<string, unknown>,
    cookie: string,
  ): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Number(cfg.limits.timeoutMs) || 40000);
    let j: any;
    try {
      const res = await fetch(cfg.http!.url!, {
        method: cfg.http!.method || 'POST',
        headers: { ...HEADERS_BASE, cookie },
        body: cfg.http!.method === 'GET' ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      j = await res.json();
    } catch (e) {
      throw netError(e);
    } finally {
      clearTimeout(timer);
    }
    const result = j && j.result;
    if (result == null) throw new AuthError('result is null（会话被顶号）');
    const code = String(result.code);
    const msg = String(result.msg ?? '');
    if (code !== '200') {
      if (code.toUpperCase().includes('FREQUENT') || msg.includes('频繁')) {
        throw new Error(`上游限流：${msg || code}`);
      }
      if (code === '401' || msg.includes('下线') || msg.includes('账户')) {
        throw new AuthError(`${code} ${msg}`);
      }
      throw new Error(`code=${code} msg=${msg}`);
    }
    const d = result.data || {};
    return { rows: d.data || [], total: Number(d.total || 0) };
  }

  /**
   * 三段式异步导出试运行：渲染触发体 → 触发 → 轮询认领 → 取签名 URL → 下载 → 解析。
   * 与 DeliveryExportService 同构，但走配置参数；只预览行数，不落盘、不写 PG。
   * 真实触发会在上游产生一个导出任务（异步导出固有的服务端副作用），但本地无写入。
   */
  private async dryRunExport(
    id: string,
    cfg: SourceConfig,
    params: DryRunParams,
  ): Promise<DryRunResult> {
    const e = cfg.export!;
    const t0 = Date.now();
    const steps: DryRunStep[] = [];

    // 1) 渲染触发体（与 http-query 共用模板引擎）
    const t1 = Date.now();
    const ctx = buildContext(params.values || {}, Math.max(1, Number(cfg.limits.maxRows) || 50));
    const triggerBody = renderTemplate(e.triggerBody ?? {}, ctx);
    const unresolved = findUnresolved(triggerBody);
    if (unresolved.length) {
      throw new BadRequestException(`触发体模板变量未填值：${unresolved.join(', ')}`);
    }
    steps.push({
      name: 'render',
      ok: true,
      elapsedMs: Date.now() - t1,
      detail: `变量 ${Object.keys(ctx).length} 个，teamIds=[${
        Array.isArray(ctx.teamIds) ? ctx.teamIds.join(',') : String(ctx.teamIds || '')
      }]`,
    });

    // 2) 登录态
    const t2 = Date.now();
    let cookie = await this.cookies.ensure();
    steps.push({ name: 'cookie', ok: true, elapsedMs: Date.now() - t2, detail: 'ensure()' });

    // 3) 记录当前最大 taskId（用于认领本次导出，避免认领历史任务）
    const t3 = Date.now();
    let maxId = 0;
    if (e.claim.maxIdSnapshot) {
      const tasks = await this.listTasks(cfg, cookie);
      for (const row of tasks) {
        const n = Number(this.pick(row, e.claim.idPath));
        if (Number.isFinite(n) && n > maxId) maxId = n;
      }
    }
    steps.push({ name: 'task-snapshot', ok: true, elapsedMs: Date.now() - t3, detail: `maxId=${maxId}` });

    // 4) 触发导出（会话失效重登后整段重试一次）
    const runExport = async (ck: string) => {
      const j = await this.post(cfg, e.triggerUrl, triggerBody, ck, Number(cfg.limits.timeoutMs) || 40000);
      const res = j && j.result;
      if (res == null) throw new AuthError('触发导出 result is null（会话被顶号）');
      if (String(res.code) !== '200') throw new Error(`触发失败 code=${res.code} msg=${res.msg ?? ''}`);
      if (!res.data) throw new Error('导出触发未受理（data 非 true）');

      const deadline = Date.now() + (Number(e.pollTimeoutMs) || 180000);
      let myId: number | null = null;
      while (Date.now() < deadline) {
        const tasks = await this.listTasks(cfg, ck);
        for (const row of tasks) {
          const idVal = Number(this.pick(row, e.claim.idPath)) || 0;
          const status = Number(this.pick(row, e.claim.statusPath)) || 0;
          if (idVal > maxId && status === Number(e.claim.readyStatus)) {
            myId = idVal;
            break;
          }
        }
        if (myId != null) break;
        await new Promise((r) => setTimeout(r, Number(e.pollIntervalMs) || 3000));
      }
      if (myId == null) throw new Error(`导出任务超时未完成（${e.pollTimeoutMs}ms）`);

      const uj = await this.post(
        cfg,
        e.taskUrlUrl,
        { params: { request: { taskId: myId } } },
        ck,
        Number(cfg.limits.timeoutMs) || 40000,
      );
      const ures = uj && uj.result;
      if (ures == null) throw new AuthError('任务URL result is null（会话被顶号）');
      if (typeof ures.data !== 'string' || !ures.data.startsWith('http')) {
        throw new Error(`任务URL无效 taskId=${myId} data=${ures.data}`);
      }
      return { fileUrl: ures.data as string, taskId: myId };
    };

    const t4 = Date.now();
    let out: { fileUrl: string; taskId: number };
    try {
      out = await runExport(cookie);
    } catch (err) {
      if (!(err instanceof AuthError)) {
        steps.push({ name: 'export', ok: false, elapsedMs: Date.now() - t4, detail: (err as Error).message });
        throw err;
      }
      steps.push({ name: 'export', ok: false, elapsedMs: Date.now() - t4, detail: `会话失效：${err.message}，重登重试` });
      const tr = Date.now();
      cookie = await this.cookies.relogin();
      steps.push({ name: 'relogin', ok: true, elapsedMs: Date.now() - tr, detail: 'relogin()' });
      const trr = Date.now();
      out = await runExport(cookie);
      steps.push({ name: 'export(retry)', ok: true, elapsedMs: Date.now() - trr, detail: `taskId=${out.taskId}` });
    }
    if (!steps.some((s) => s.name.startsWith('export') && s.ok)) {
      steps.push({ name: 'export', ok: true, elapsedMs: Date.now() - t4, detail: `taskId=${out.taskId}` });
    }

    // 5) 下载签名文件（无 cookie，免鉴权）
    const t5 = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Number(e.downloadTimeoutMs) || 120000);
    let buf: Buffer;
    try {
      const res = await fetch(out.fileUrl, {
        headers: { 'user-agent': 'Mozilla/5.0' },
        signal: ctrl.signal,
      });
      buf = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      throw netError(err);
    } finally {
      clearTimeout(timer);
    }
    steps.push({ name: 'download', ok: true, elapsedMs: Date.now() - t5, detail: `${buf.length} bytes` });

    // 6) 解析（复用 DeliveryExportService 的公共字典口径，不落盘）
    const t6 = Date.now();
    if (e.parser !== 'delivery-xlsx') {
      throw new BadRequestException(`试运行暂不支持 parser=${e.parser}（仅 delivery-xlsx）`);
    }
    const parsed = parseXlsxBytes(buf);
    const maxRows = Number(cfg.limits.maxRows) || 200;
    const rows = parsed.slice(0, maxRows);
    steps.push({
      name: 'parse',
      ok: true,
      elapsedMs: Date.now() - t6,
      detail: `解析 ${parsed.length} 行，预览截断至 ${rows.length} 行`,
    });

    this.logger.log(`三段式试运行 ${id}：taskId=${out.taskId} returned=${rows.length} elapsed=${Date.now() - t0}ms`);
    return {
      ok: true,
      id,
      type: cfg.type,
      url: e.triggerUrl,
      body: triggerBody,
      steps,
      total: parsed.length,
      returned: rows.length,
      rows,
      elapsedMs: Date.now() - t0,
    };
  }

  /** 两段式签名下载试运行：渲染触发体 → 触发拿 fileUrl → 下载 → 解析预览。 */
  private async dryRunDownload(
    id: string,
    cfg: SourceConfig,
    params: DryRunParams,
  ): Promise<DryRunResult> {
    const d = cfg.download!;
    const t0 = Date.now();
    const steps: DryRunStep[] = [];

    const ctx = buildContext(params.values || {}, Number(cfg.limits.maxRows) || 50);
    const triggerBody = renderTemplate(d.triggerBody ?? {}, ctx);
    const unresolved = findUnresolved(triggerBody);
    if (unresolved.length) {
      throw new BadRequestException(`触发体模板变量未填值：${unresolved.join(', ')}`);
    }
    steps.push({ name: 'render', ok: true, elapsedMs: 0, detail: `变量 ${Object.keys(ctx).length} 个` });

    let cookie = await this.cookies.ensure();
    const runTrigger = async (ck: string): Promise<string> => {
      const j = await this.post(cfg, d.triggerUrl, triggerBody, ck, Number(cfg.limits.timeoutMs) || 30000);
      const result = j?.result;
      if (result == null) throw new AuthError('触发下载 result is null（会话被顶号）');
      const code = String(result.code || '');
      if (code && code !== '200') throw new Error(`触发下载失败 code=${code} msg=${result.msg}`);
      const urlPath = String(d.urlPath || 'data');
      let fileUrl: unknown = result;
      for (const part of urlPath.split('.')) {
        fileUrl = fileUrl != null && typeof fileUrl === 'object'
          ? (fileUrl as Record<string, unknown>)[part]
          : undefined;
      }
      fileUrl = fileUrl && typeof fileUrl === 'object'
        ? (fileUrl as Record<string, unknown>).fileUrl
        : fileUrl;
      if (typeof fileUrl !== 'string' || !fileUrl.startsWith('http')) {
        throw new Error(`下载链接无效 urlPath=${urlPath} data=${JSON.stringify(result.data).slice(0, 120)}`);
      }
      return fileUrl;
    };

    const t1 = Date.now();
    let fileUrl: string;
    try {
      fileUrl = await runTrigger(cookie);
    } catch (err) {
      if (!(err instanceof AuthError)) {
        steps.push({ name: 'trigger', ok: false, elapsedMs: Date.now() - t1, detail: (err as Error).message });
        throw err;
      }
      steps.push({ name: 'trigger', ok: false, elapsedMs: Date.now() - t1, detail: '会话失效，重登重试' });
      cookie = await this.cookies.relogin();
      fileUrl = await runTrigger(cookie);
    }
    steps.push({ name: 'trigger', ok: true, elapsedMs: Date.now() - t1, detail: fileUrl.slice(0, 90) });

    const t2 = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);
    let buf: Buffer;
    try {
      const res = await fetch(fileUrl, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: ctrl.signal });
      buf = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      throw netError(err);
    } finally {
      clearTimeout(timer);
    }
    steps.push({ name: 'download', ok: true, elapsedMs: Date.now() - t2, detail: `${buf.length} bytes` });

    const t3 = Date.now();
    const maxRows = Number(cfg.limits.maxRows) || 200;
    let parsed: Record<string, unknown>[];
    if (d.parser === 'schedule-xlsx') {
      parsed = parseXlsxBytes(buf);
    } else {
      const text = new TextDecoder('gbk').decode(buf);
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const header = lines[0]?.split(',').map((s) => s.trim()) || [];
      parsed = lines.slice(1).map((line) => {
        const cells = line.split(',');
        const row: Record<string, unknown> = {};
        header.forEach((h, i) => { if (h) row[h] = cells[i]?.trim() ?? ''; });
        return row;
      });
    }
    const rows = parsed.slice(0, maxRows);
    steps.push({ name: 'parse', ok: true, elapsedMs: Date.now() - t3, detail: `解析 ${parsed.length} 行，预览 ${rows.length} 行` });

    this.logger.log(`签名下载试运行 ${id}：${parsed.length} 行，elapsed=${Date.now() - t0}ms`);
    return {
      ok: true, id, type: cfg.type, url: d.triggerUrl, body: triggerBody,
      steps, total: parsed.length, returned: rows.length, rows, elapsedMs: Date.now() - t0,
    };
  }

  /** 从任务行按点路径取字段（如 id / status / data.id）。 */
  private pick(row: Record<string, unknown>, path: string): unknown {
    if (!path) return undefined;
    let cur: unknown = row;
    for (const part of path.split('.')) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = (cur as Record<string, unknown>)[part];
    }
    return cur;
  }

  /** 任务列表响应：data 可能是数组，或 data.list / data.records / data.data。 */
  private async listTasks(cfg: SourceConfig, cookie: string): Promise<Record<string, unknown>[]> {
    const j = await this.post(
      cfg,
      cfg.export!.taskListUrl,
      { params: { request: { activeTabKey: '1' } } },
      cookie,
      Number(cfg.limits.timeoutMs) || 40000,
    );
    const data = (j && j.result && j.result.data) || {};
    if (Array.isArray(data)) return data as Record<string, unknown>[];
    for (const k of ['list', 'records', 'data']) {
      if (Array.isArray(data[k])) return data[k] as Record<string, unknown>[];
    }
    return [];
  }

  /** 风神 xtop POST：统一错误分类（会话失效抛 AuthError 供上层重登重试）。 */
  private async post(
    cfg: SourceConfig,
    url: string,
    payload: unknown,
    cookie: string,
    timeoutMs: number,
  ): Promise<any> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...HEADERS_BASE, cookie },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      return await res.json();
    } catch (err) {
      throw netError(err);
    } finally {
      clearTimeout(timer);
    }
  }
}
