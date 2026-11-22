import { Injectable, Logger } from '@nestjs/common';
import { AeolusCookieService } from '../creds/aeolus-cookie.service';
import {
  STATIC_HEADERS,
  ViolationApiError,
  isViolationAuthError,
} from './violation-fetch.service';
import {
  FetchPaceService,
  MAX_RETRIES,
  RELOGIN_MAX,
  RELOGIN_BACKOFF_BASE,
} from '../runners/fetch-pace.service';
import { normalizeViolationRow, violationId } from './delivery-field-map';

/**
 * 违规处罚明细列表取数（独立于 `violation-fetch.service.ts` 的 CSV 下载）。
 *
 * 上游：风神 `violationOrderAeolusCenterApi.queryList/1.0`（分页 JSON 列表）。
 * 与 CSV 下载共用请求头、错误类型与会话失效判定；编排层补齐下推、逐日/时段切片、
 * 限流退避、重登自愈与按违规编号去重，字段映射统一走 `delivery-field-map.ts`。
 */
export const VIOLATION_LIST_URL =
  'https://httpizza.ele.me/xtop/xtop.lpd.quality.control.violation.violationOrderAeolusCenterApi.queryList/1.0';

/** 站点 / 骑手下推参数（与运单 queryTracking 同口径）。 */
export interface ViolationPushFilters {
  teamIds?: Array<string | number> | string;
  rider?: string;
}

/** 单日总量超过该阈值且无下推过滤时，按 4 时段切片翻页。 */
const SEG_SPLIT_THRESHOLD = 9000;
/** 当日秒偏移（北京时间）：[0,6h) / [6h,12h) / [12h,18h) / [18h,24h)。 */
const SEGMENTS_4: Array<[number, number]> = [
  [0, 21600],
  [21600, 43200],
  [43200, 64800],
  [64800, 86400],
];
const MAX_PAGES = 200;
const DAY_MS = 86400000;
const OFFSET_MS = 8 * 3600 * 1000;

type ViolationRow = Record<string, string>;

@Injectable()
export class ViolationListFetchService {
  private readonly logger = new Logger(ViolationListFetchService.name);

  constructor(
    private readonly cookies: AeolusCookieService,
    private readonly pace: FetchPaceService,
  ) {}

  /**
   * 单页查询（保留原有位置参数签名，供控制器与排查脚本调用）。
   * 会话失效强制重登后重试；限流 / 网络失败按 AIMD + 指数退避处理。
   */
  async queryList(
    startMs: number,
    endMs: number,
    pageNo = 1,
    pageSize = 10,
    cookie?: string,
    filters?: ViolationPushFilters,
  ): Promise<any> {
    const ck = cookie || (await this.cookies.ensure());
    return this.queryWithCookie(ck, startMs, endMs, pageNo, pageSize, !cookie, filters);
  }

  private async queryWithCookie(
    ck: string,
    startMs: number,
    endMs: number,
    pageNo: number,
    pageSize: number,
    allowRelogin: boolean,
    filters?: ViolationPushFilters,
  ): Promise<any> {
    let current = ck;
    let relogins = 0;
    let attempt = 0;
    for (;;) {
      try {
        this.pace.bump('requests');
        const out = await this.doQuery(current, startMs, endMs, pageNo, pageSize, filters);
        this.pace.reward();
        this.pace.bump('ok');
        return out;
      } catch (e) {
        if (
          e instanceof ViolationApiError &&
          isViolationAuthError(e) &&
          allowRelogin &&
          relogins < RELOGIN_MAX
        ) {
          relogins += 1;
          this.pace.bump('relogin');
          this.logger.warn(`违规列表会话失效，重登第 ${relogins} 次后重试`);
          current = await this.cookies.relogin();
          await this.pace.backoffSleep(RELOGIN_BACKOFF_BASE, relogins - 1);
          attempt = 0;
          continue;
        }
        if (this.pace.isThrottle(e)) {
          this.pace.penalize();
          this.pace.bump('throttle');
        } else {
          this.pace.penalizeNet();
          this.pace.bump('failed');
        }
        if (attempt >= MAX_RETRIES) throw e;
        this.pace.bump('retries');
        await this.pace.backoffSleep(undefined, attempt);
        attempt += 1;
      }
    }
  }

  /** 单次请求（不含重试），成功返回上游 result。 */
  private async doQuery(
    ck: string,
    startMs: number,
    endMs: number,
    pageNo: number,
    pageSize: number,
    filters?: ViolationPushFilters,
  ): Promise<any> {
    const request: Record<string, unknown> = {
      violationStartTime: startMs,
      violationEndTime: endMs,
      pageNo,
      pageSize,
    };
    const teamIds = this.normalizeTeamIds(filters?.teamIds);
    if (teamIds.length) request.teamIds = teamIds;
    if (filters?.rider?.trim()) request.knightInfo = filters.rider.trim();

    const body = JSON.stringify({ params: { request } });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    let res: Response;
    let j: any;
    try {
      res = await fetch(VIOLATION_LIST_URL, {
        method: 'POST',
        headers: { accept: 'application/json, text/plain, */*', ...STATIC_HEADERS, cookie: ck },
        body,
        signal: ctrl.signal,
      });
      if (res.status === 401) {
        throw new ViolationApiError('违规处罚明细列表接口 HTTP 401（未登录）', '401');
      }
      j = await res.json();
    } finally {
      clearTimeout(timer);
    }

    const result = j && typeof j === 'object' ? j.result : null;
    if (result === null || result === undefined) {
      const err = (j || {}).error || {};
      const code = String((j || {}).code || err.name || '');
      const msg = String(err.message || err.gracefulMsg || '');
      throw new ViolationApiError(`违规处罚明细列表接口返回空 result（code=${code} ${msg}）`, code);
    }
    const code = String(result.code || '');
    if (code && code !== '200') {
      throw new ViolationApiError(`违规处罚明细列表接口错误：code=${code} msg=${result.msg}`, code);
    }
    return result;
  }

  /**
   * 从上游 result 中递归找出「列表数组」与「总数」。
   * 不预设字段名：扫描整个响应体（深度≤3），取最大的对象数组作为列表、最大的 total 作为总数。
   */
  private extractList(r: any): { list: any[]; total: number | null } {
    const arrays: any[][] = [];
    const totals: number[] = [];
    const walk = (node: any, depth: number) => {
      if (node == null || typeof node !== 'object' || depth > 3) return;
      if (Array.isArray(node)) {
        arrays.push(node);
        return;
      }
      for (const k of Object.keys(node)) {
        const v = (node as any)[k];
        if (Array.isArray(v)) arrays.push(v);
        else if (typeof v === 'number' && /total/i.test(k)) totals.push(v);
        else if (v && typeof v === 'object') walk(v, depth + 1);
      }
    };
    walk(r, 0);
    let list: any[] = [];
    for (const a of arrays) {
      if (a.length && a.every((x) => x && typeof x === 'object')) {
        if (a.length > list.length) list = a;
      }
    }
    const total = totals.length ? Math.max(...totals) : null;
    return { list, total };
  }

  /**
   * 整段区间全量：先按北京时间自然日切窗口，单日总量超阈值且无下推时再按 4 时段切片；
   * 行按公共字典归一为同构中文行，并按违规编号去重，返回 `{total, rows}`。
   */
  async queryRange(
    startMs: number,
    endMs: number,
    pageSize = 200,
    cookie?: string,
    filters?: ViolationPushFilters,
  ): Promise<{ total: number; rows: ViolationRow[] }> {
    const all: ViolationRow[] = [];
    const seen = new Set<string>();
    for (const [dayStart, dayEnd] of this.dayWindows(startMs, endMs)) {
      const probe = await this.queryList(dayStart, dayEnd, 1, 1, cookie, filters);
      const { total } = this.extractList(probe);
      const segmented = total != null && total > SEG_SPLIT_THRESHOLD && !this.hasFilters(filters);
      const windows: Array<[number, number]> = segmented
        ? SEGMENTS_4.map(([a, b]) => [dayStart + a * 1000, Math.min(dayStart + b * 1000 - 1, dayEnd)])
        : [[dayStart, dayEnd]];

      for (const [ws, we] of windows) {
        const rows = await this.fetchWindow(ws, we, pageSize, cookie, filters);
        for (const row of rows) {
          const id = violationId(row);
          if (id && seen.has(id)) continue;
          if (id) seen.add(id);
          all.push(row);
        }
        if (segmented) await this.pace.coarseSleep();
      }
    }
    return { total: all.length, rows: all };
  }

  /** 单个时间窗自动翻页 + 字典归一。 */
  private async fetchWindow(
    startMs: number,
    endMs: number,
    pageSize: number,
    cookie?: string,
    filters?: ViolationPushFilters,
  ): Promise<ViolationRow[]> {
    const out: ViolationRow[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const r = await this.queryList(startMs, endMs, page, pageSize, cookie, filters);
      const { list, total } = this.extractList(r);
      out.push(...list.map((row) => normalizeViolationRow(row)));
      if (total != null && total > 0 && out.length >= total) break;
      if (list.length < pageSize) break;
      await this.pace.pageSleep();
    }
    return out;
  }

  /** 北京时间自然日切片；上游对单次跨度有限制，逐日最稳。 */
  private dayWindows(startMs: number, endMs: number): Array<[number, number]> {
    const first = Math.floor((startMs + OFFSET_MS) / DAY_MS) * DAY_MS - OFFSET_MS;
    const out: Array<[number, number]> = [];
    for (let s = first; s <= endMs; s += DAY_MS) {
      out.push([Math.max(s, startMs), Math.min(s + DAY_MS - 1, endMs)]);
    }
    return out;
  }

  private hasFilters(filters?: ViolationPushFilters): boolean {
    if (!filters) return false;
    const teams = filters.teamIds;
    const hasTeams = Array.isArray(teams) ? teams.length > 0 : !!teams;
    return hasTeams || !!filters.rider?.trim();
  }

  /** 站点 ID 归一化：数字/字符串/逗号分隔均可，过滤非法值并去重。 */
  private normalizeTeamIds(input?: Array<string | number> | string): number[] {
    if (input == null) return [];
    const arr = Array.isArray(input) ? input : String(input).split(',');
    const out: number[] = [];
    for (const v of arr) {
      const s = String(v).trim();
      if (!s) continue;
      const n = Number(s);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) continue;
      if (!out.includes(n)) out.push(n);
    }
    return out;
  }
}
