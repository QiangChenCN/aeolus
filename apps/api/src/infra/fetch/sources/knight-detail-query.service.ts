import { Injectable, Logger } from '@nestjs/common';
import { KNIGHT_COLUMNS } from '@aeolus/shared';
import { netError } from '../../../common/net-error';
import {
  FetchPaceService,
  MAX_RETRIES,
  RELOGIN_MAX,
  RELOGIN_BACKOFF_BASE,
  BACKOFF_BASE,
} from '../runners/fetch-pace.service';
import { AeolusCookieService } from '../creds/aeolus-cookie.service';
import { SourceConfigRuntimeService } from '../source-config/source-config-runtime.service';

/**
 * 骑手明细查询基座（实时点查，不落盘）。
 *
 * 上游：风神 HR 接口 `kunkka-svr/ehr/staff/knight/list`（GET，pageIndex/pageSize 分页）。
 * 复用 AeolusCookieService 的 AEOLUS_MOZI_TOKEN 登录态（与 Quark getReport 同域同 cookie），
 * 会话失效自动重登，限流/网络抖动走共享 FetchPaceService 的 AIMD + 指数退避。
 *
 * 支持已实拉确认的下推参数：staffName（姓名）、departmentId（站点）、workStatus（在职状态）。
 * knightId 实测不生效（传了 count 不变），故不作为过滤参数暴露。
 * 上游默认不过滤在职状态：要只看在职请显式传 work_status=1。
 */
export const KNIGHT_LIST_URL = 'https://app2-edu.ele.me/kunkka-svr/ehr/staff/knight/list';
/** 单页默认 100；实拉确认上游 pageSize=2000 可一次返回全量。 */
export const DEFAULT_PAGE_SIZE = 100;
export const FULL_PAGE_SIZE = 500;
export const MAX_PAGE_SIZE = 2000;
const REQ_TIMEOUT_MS = 30000;
/** 全量翻页上限（500/页 × 100 页 = 5 万行），防上游异常 count 把服务拖死。 */
const MAX_PAGES = 100;

const HEADERS_BASE: Record<string, string> = {
  accept: 'application/json, text/plain, */*',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-US;q=0.7',
  origin: 'https://artemis.faas.ele.me',
  referer: 'https://artemis.faas.ele.me/',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36 Edg/158.0.0.0',
};

export class KnightAuthError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'KnightAuthError';
  }
}

/** 上游支持的下推过滤（均已用真实接口验证 count 会变化）。 */
export interface KnightFilters {
  staffName?: string;
  departmentId?: string | number;
  workStatus?: string | number;
}

export interface KnightPage {
  rows: Record<string, unknown>[];
  total: number;
}

export interface KnightQueryResult {
  ok: true;
  total: number;
  page_index: number;
  page_size: number;
  rows: Record<string, unknown>[];
  columns: Array<{ key: string; label: string }>;
  elapsed_sec: number;
  stats: ReturnType<FetchPaceService['statsSnapshot']>;
}

export interface KnightAllResult {
  ok: true;
  total: number;
  upstream_total: number;
  pages: number;
  truncated: boolean;
  rows: Record<string, unknown>[];
  columns: Array<{ key: string; label: string }>;
  elapsed_sec: number;
  stats: ReturnType<FetchPaceService['statsSnapshot']>;
}

/** 非空才转成整数；非法值直接报错，避免静默丢掉用户下推条件。 */
function intParam(name: string, v: string | number | undefined, min: number): number | undefined {
  if (v === undefined || v === null || String(v).trim() === '') return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min) {
    throw new Error(`${name} 必须是不小于 ${min} 的整数：${v}`);
  }
  return n;
}

/** 组装上游 query string；只放实拉确认生效的参数。 */
export function buildSearchParams(opts: {
  pageIndex: number;
  pageSize: number;
  filters?: KnightFilters;
}): URLSearchParams {
  const q = new URLSearchParams();
  q.set('pageIndex', String(opts.pageIndex));
  q.set('pageSize', String(opts.pageSize));
  const f = opts.filters || {};
  if (f.staffName?.trim()) q.set('staffName', f.staffName.trim());
  const dept = intParam('department_id', f.departmentId, 1);
  if (dept != null) q.set('departmentId', String(dept));
  const status = intParam('work_status', f.workStatus, 0);
  if (status != null) q.set('workStatus', String(status));
  return q;
}

@Injectable()
export class KnightDetailQueryService {
  private readonly logger = new Logger(KnightDetailQueryService.name);
  private cookie = '';
  private reloginCount = 0;

  constructor(
    private readonly cookies: AeolusCookieService,
    private readonly pace: FetchPaceService,
    private readonly sourceConfig: SourceConfigRuntimeService,
  ) {}

  private async ensureCookie(): Promise<string> {
    if (!this.cookie) this.cookie = await this.cookies.ensure();
    return this.cookie;
  }

  /** 发一次请求 + 错误分类（不含重试循环）。 */
  private async requestOnce(opts: {
    cookie: string;
    pageIndex: number;
    pageSize: number;
    filters?: KnightFilters;
  }): Promise<KnightPage> {
    const params = buildSearchParams(opts);
    const defaultQuery: Record<string, unknown> = {};
    for (const [k, v] of params.entries()) defaultQuery[k] = v;
    const { url: queryUrl } = await this.sourceConfig.overrideQuery(
      'knight-detail-query',
      {
        current: opts.pageIndex, pageSize: opts.pageSize,
        staffName: opts.filters?.staffName,
        departmentId: opts.filters?.departmentId,
        workStatus: opts.filters?.workStatus,
      },
      KNIGHT_LIST_URL, defaultQuery,
    );
    const url = queryUrl;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQ_TIMEOUT_MS);
    let res: Response;
    let j: any;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: { ...HEADERS_BASE, cookie: opts.cookie },
        signal: ctrl.signal,
      });
      j = await res.json();
    } catch (e) {
      throw netError(e);
    } finally {
      clearTimeout(timer);
    }

    const code = String(j?.code ?? '');
    const msg = String(j?.msg ?? '');
    // 实测失效：HTTP 403 + {"code":"400","msg":"token为空，请重新登录"/"未查询到账户信息，请重新登录"}
    if (
      res.status === 403 ||
      code === '401' ||
      code.toUpperCase() === 'UNAUTHORIZED' ||
      /请重新登录|token为空|未查询到账户信息/.test(msg)
    ) {
      throw new KnightAuthError(`骑手明细接口会话失效（HTTP ${res.status} code=${code} msg=${msg}）`);
    }
    if (code !== '200') {
      throw new Error(`骑手明细接口错误：HTTP ${res.status} code=${code} msg=${msg}`);
    }
    const data = j?.data || {};
    return {
      rows: Array.isArray(data.list) ? data.list : [],
      total: Number(data.count || 0),
    };
  }

  /** 单次请求 + 会话失效重登、限流/网络失败指数退避。 */
  private async call(opts: {
    pageIndex: number;
    pageSize: number;
    filters?: KnightFilters;
  }): Promise<KnightPage> {
    let attempt = 0;
    for (;;) {
      try {
        this.pace.bump('requests');
        const out = await this.requestOnce({ ...opts, cookie: this.cookie });
        this.pace.reward();
        this.pace.bump('ok');
        return out;
      } catch (e) {
        if (e instanceof KnightAuthError) {
          if (this.reloginCount >= RELOGIN_MAX) {
            throw new Error(`会话连续失效 ${RELOGIN_MAX} 次: ${e.message}`);
          }
          this.reloginCount += 1;
          this.pace.bump('relogin');
          this.logger.warn(`骑手明细会话失效(${e.message})，重新登录 第${this.reloginCount}次`);
          this.cookie = await this.cookies.relogin();
          await this.pace.backoffSleep(RELOGIN_BACKOFF_BASE, this.reloginCount - 1);
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
        await this.pace.backoffSleep(BACKOFF_BASE, attempt);
        attempt += 1;
      }
    }
  }

  /** 单页查询：按 page_index/page_size 返回一页明细，不落盘。 */
  async queryKnights(opts: {
    pageIndex?: string | number;
    pageSize?: string | number;
    staffName?: string;
    departmentId?: string | number;
    workStatus?: string | number;
  }): Promise<KnightQueryResult> {
    const pageIndex = intParam('page_index', opts.pageIndex, 1) ?? 1;
    const pageSize = Math.min(
      intParam('page_size', opts.pageSize, 1) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );
    const filters: KnightFilters = {
      staffName: opts.staffName,
      departmentId: opts.departmentId,
      workStatus: opts.workStatus,
    };

    this.pace.statsReset();
    this.reloginCount = 0;
    const t0 = Date.now();
    await this.ensureCookie();

    this.logger.log(
      `骑手明细查询：page=${pageIndex}/${pageSize} staff=${filters.staffName || '—'} ` +
        `dept=${filters.departmentId ?? '—'} status=${filters.workStatus ?? '—'}`,
    );
    const page = await this.call({ pageIndex, pageSize, filters });
    this.pace.persistFloor();
    return {
      ok: true,
      total: page.total,
      page_index: pageIndex,
      page_size: pageSize,
      rows: page.rows,
      columns: KNIGHT_COLUMNS,
      elapsed_sec: Math.round((Date.now() - t0) / 100) / 10,
      stats: this.pace.statsSnapshot(),
    };
  }

  /** 全量查询：自动翻页 + 按 knightId（缺失时退化为 id）去重，不落盘。 */
  async queryAllKnights(opts: {
    pageSize?: string | number;
    staffName?: string;
    departmentId?: string | number;
    workStatus?: string | number;
  }): Promise<KnightAllResult> {
    const pageSize = Math.min(
      intParam('page_size', opts.pageSize, 1) ?? FULL_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );
    const filters: KnightFilters = {
      staffName: opts.staffName,
      departmentId: opts.departmentId,
      workStatus: opts.workStatus,
    };

    this.pace.statsReset();
    this.reloginCount = 0;
    const t0 = Date.now();
    await this.ensureCookie();

    const first = await this.call({ pageIndex: 1, pageSize, filters });
    const rows = [...first.rows];
    let page = 1;
    while (rows.length < first.total && page < MAX_PAGES) {
      page += 1;
      await this.pace.pageSleep();
      const part = await this.call({ pageIndex: page, pageSize, filters });
      if (!part.rows.length) break;
      rows.push(...part.rows);
    }

    const seen = new Set<string>();
    const unique = rows.filter((r) => {
      const key = String(r?.['knightId'] ?? r?.['id'] ?? '');
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    this.pace.persistFloor();
    return {
      ok: true,
      total: unique.length,
      upstream_total: first.total,
      pages: page,
      truncated: page >= MAX_PAGES && unique.length < first.total,
      rows: unique,
      columns: KNIGHT_COLUMNS,
      elapsed_sec: Math.round((Date.now() - t0) / 100) / 10,
      stats: this.pace.statsSnapshot(),
    };
  }
}
