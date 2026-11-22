import { Injectable, Logger } from '@nestjs/common';
import { netError } from '../../../common/net-error';
import { FetchPaceService, MAX_RETRIES, RELOGIN_MAX, RELOGIN_BACKOFF_BASE, BACKOFF_BASE } from '../runners/fetch-pace.service';
import { AeolusCookieService } from '../creds/aeolus-cookie.service';
import { normalizeOrderRow, DeliveryRow } from '../../../modules/delivery/delivery-normalize';

/**
 * 运单明细查询基座（实时点查，不落盘）。
 *
 * 两层职责：
 *   1) 底层单次请求 query()/requestOnce()：发一次 + 判别错误类型，不含重试循环。
 *      移植自 get_data/delivery.py 的 query。OrdersFetchService 导出后对账复用它打第 1 页。
 *      Python 版编排层固定传 retries=1，因为 query 内部遇「请求太频繁」立即 continue 连冲，
 *      实测制造 2.8s/页均值、最长 40.9s 长尾 —— 所以重试责任交给本服务的编排层。
 *   2) 编排层 queryOrders()：按 日期/站点/骑手 实时查明细，含下推、翻页、大单量切片、
 *      会话自愈、限流退避、去重、归一化。供其他程序 / AI 通过 GET /api/fetch/orders-query 调用。
 *
 * 与 OrdersFetchService（异步导出、整站全量、落盘、免限流）互补：本基座交互式点查即时返回，
 * 不落盘。站点/骑手下推上游，通常只命中少量页；全站且无骑手的大单量日才按 4 时段切片。
 */

export class AuthError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'AuthError';
  }
}

export const API = 'https://httpizza.ele.me/xtop/xtop.agencyTrackingFs.queryTracking/2.0';
export const PAGE_SIZE = 50;
export const TIME_FIELD = 'trackingFinish';
export const TIME_FIELDS = ['trackingCreated', 'platformBooked', 'trackingFinish'];
export const REQ_TIMEOUT_MS = 40000;

/** 大单量日切片阈值：全站且无骑手时 total 超过该值按 4 时段切，绕开 current*pageSize<10000 上限。 */
const SEG_SPLIT_THRESHOLD = 9000;
const SEGMENTS_4 = ['0-21600', '21600-43200', '43200-64800', '64800-86400'];
const FULL_DAY = '0-86400';
/** 安全上限：单段最多翻多少页，防止接口异常返回超大 total 把服务拖死。 */
const PAGE_INDEX_CAP = 190;

const HEADERS_BASE: Record<string, string> = {
  accept: 'application/json, text/plain, */*',
  'content-type': 'application/json',
  origin: 'https://aeolus.ele.me',
  referer: 'https://aeolus.ele.me/',
};

export interface QueryResult {
  rows: Record<string, unknown>[];
  total: number;
}

/** 实时查询返回结构。 */
export interface OrdersQueryResult {
  ok: true;
  date: string;
  time_field: string;
  team_ids: number[];
  rider?: string;
  total: number;
  rows: DeliveryRow[];
  elapsed_sec: number;
  truncated: boolean;
  stats: ReturnType<FetchPaceService['statsSnapshot']>;
}

/** 北京时间（UTC+8）某天的 [00:00:00.000, 23:59:59.999] 毫秒区间。 */
function dayRangeMs(date: string): [number, number] {
  return [Date.parse(`${date}T00:00:00.000+08:00`), Date.parse(`${date}T23:59:59.999+08:00`)];
}

function checkTimeField(f?: string): string {
  const t = f || TIME_FIELD;
  if (!TIME_FIELDS.includes(t)) {
    throw new Error(`未知 time_field: ${t}（可用 ${TIME_FIELDS.join('/')}）`);
  }
  return t;
}

/**
 * 站点 ID 归一化：接受数字数组、字符串数组或逗号分隔字符串（GET 查询参数）。
 * 风神接口要数字 ID，这里统一过滤非法值并去重；空数组表示不按站点过滤（全站）。
 */
export function normalizeTeamIds(input?: Array<string | number> | string): number[] {
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

/** 组装单次分页请求体（与 Python build_body 逐字段一致）。teamIds/rider 为可下推过滤。 */
export function buildBody(
  startMs: number,
  endMs: number,
  current: number,
  pageSize: number,
  period = '0-86400',
  timeField?: string,
  teamIds: number[] = [],
  rider?: string,
) {
  const f = checkTimeField(timeField);
  return {
    params: {
      request: {
        [`${f}Start`]: startMs,
        [`${f}End`]: endMs,
        ...(teamIds.length ? { teamIds } : {}),
        ...(rider ? { knightInfo: rider } : {}),
        merchantConsumerDistanceStart: '0',
        merchantConsumerDistanceEnd: '999999',
        payAmountStart: '0',
        payAmountEnd: '999999',
        weightStart: '0',
        weightEnd: '999999',
        current,
        pageSize,
        trackingStateKey: 'all',
        trackingLabelKey: 'all',
        [`${f}TimePeriodList`]: [period],
      },
    },
  };
}

@Injectable()
export class DeliveryQueryService {
  private readonly logger = new Logger(DeliveryQueryService.name);
  private cookie = '';
  private reloginCount = 0;

  constructor(
    private readonly pace: FetchPaceService,
    private readonly cookies: AeolusCookieService,
  ) {}

  /**
   * 单次分页请求（底层原语）：返回 (rows, total)，不含重试循环。
   * 会话失效抛 AuthError；限流抛含「频繁」/FREQUENT 的 Error，交由编排层退避。
   */
  async query(opts: {
    startMs: number;
    endMs: number;
    current: number;
    pageSize?: number;
    period?: string;
    cookie: string;
    timeField?: string;
  }): Promise<QueryResult> {
    return this.requestOnce({
      startMs: opts.startMs, endMs: opts.endMs, current: opts.current,
      pageSize: opts.pageSize || PAGE_SIZE, period: opts.period || FULL_DAY,
      cookie: opts.cookie, timeField: opts.timeField || TIME_FIELD,
    });
  }

  /** 发一次请求 + 错误分类（query 与编排层共用）。 */
  private async requestOnce(opts: {
    startMs: number;
    endMs: number;
    current: number;
    pageSize: number;
    period: string;
    cookie: string;
    timeField: string;
    teamIds?: number[];
    rider?: string;
  }): Promise<QueryResult> {
    const body = buildBody(
      opts.startMs, opts.endMs, opts.current, opts.pageSize,
      opts.period, opts.timeField, opts.teamIds || [], opts.rider,
    );
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQ_TIMEOUT_MS);
    let j: any;
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { ...HEADERS_BASE, cookie: opts.cookie },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      j = await res.json();
    } catch (e) {
      // 展开 cause：只留 `net fetch failed` 无法判断是 DNS / 超时 / 连接重置，
      // 远端排查只能靠猜（详见 common/net-error.ts）。
      throw netError(e);
    } finally {
      clearTimeout(timer);
    }
    const result = j && j.result;
    if (result == null) throw new AuthError('result is null（会话被顶号）');
    const code = String(result.code);
    const msg = String(result.msg ?? '');
    if (code !== '200') {
      if (code.toUpperCase().includes('FREQUENT') || msg.includes('频繁')) throw new Error(msg || 'FREQUENT');
      if (code === '401' || msg.includes('下线') || msg.includes('账户')) throw new AuthError(`${code} ${msg}`);
      throw new Error(`code=${code} msg=${msg}`);
    }
    const d = result.data || {};
    return { rows: d.data || [], total: Number(d.total || 0) };
  }

  private async ensureCookie(): Promise<string> {
    if (!this.cookie) this.cookie = await this.cookies.ensure();
    return this.cookie;
  }

  /** 单次请求 + 会话失效重登、限流/网络失败指数退避。返回一页。 */
  private async call(opts: {
    startMs: number;
    endMs: number;
    current: number;
    pageSize: number;
    period: string;
    timeField: string;
    teamIds: number[];
    rider?: string;
  }): Promise<QueryResult> {
    let attempt = 0;
    for (;;) {
      try {
        this.pace.bump('requests');
        const out = await this.requestOnce({ ...opts, cookie: this.cookie });
        this.pace.reward();
        this.pace.bump('ok');
        return out;
      } catch (e) {
        if (e instanceof AuthError) {
          if (this.reloginCount >= RELOGIN_MAX) {
            throw new Error(`会话连续失效 ${RELOGIN_MAX} 次: ${e.message}`);
          }
          this.reloginCount += 1;
          this.pace.bump('relogin');
          this.logger.warn(`会话失效(${e.message})，重新登录 第${this.reloginCount}次`);
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

  /** 拉某一个时段（period）的全部分页。 */
  private async fetchSegment(base: {
    startMs: number;
    endMs: number;
    timeField: string;
    teamIds: number[];
    rider?: string;
  }, period: string): Promise<{ rows: Record<string, unknown>[]; total: number; truncated: boolean }> {
    const p1 = await this.call({ ...base, current: 1, pageSize: PAGE_SIZE, period });
    const total = p1.total;
    const pages = Math.ceil(total / PAGE_SIZE);
    const rows: Record<string, unknown>[] = [...p1.rows];
    for (let cur = 2; cur <= Math.min(pages, PAGE_INDEX_CAP); cur++) {
      await this.pace.pageSleep();
      const page = await this.call({ ...base, current: cur, pageSize: PAGE_SIZE, period });
      rows.push(...page.rows);
      if (!page.rows.length) break;
    }
    return { rows, total, truncated: pages > PAGE_INDEX_CAP };
  }

  /**
   * 按 日期/站点/骑手 实时查询运单明细（编排层，基座主入口）。
   * 站点 → teamIds、骑手 → knightInfo 下推上游，通常只命中少量页；
   * 全站且无骑手且单日 >9000 单才按 4 时段切片。
   */
  async queryOrders(opts: {
    date?: string;
    timeField?: string;
    teamIds?: Array<string | number> | string;
    rider?: string;
  }): Promise<OrdersQueryResult> {
    const date = opts.date || new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const timeField = TIME_FIELDS.includes(opts.timeField || '') ? opts.timeField! : TIME_FIELD;
    const teamIds = normalizeTeamIds(opts.teamIds);
    const rider = (opts.rider || '').trim() || undefined;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`日期格式非法：${date}（应为 YYYY-MM-DD）`);
    const [startMs, endMs] = dayRangeMs(date);

    this.pace.statsReset();
    this.reloginCount = 0;
    const t0 = Date.now();
    await this.ensureCookie();

    this.logger.log(
      `运单实时查询：date=${date} teamIds=[${teamIds.join(',') || '全站'}] rider=${rider || '—'} timeField=${timeField}`,
    );

    // 先打 1 行拿 total 决定是否切片
    const probe = await this.call({
      startMs, endMs, current: 1, pageSize: 1, period: FULL_DAY, timeField, teamIds, rider,
    });
    const total = probe.total;

    let rows: Record<string, unknown>[] = [];
    let truncated = false;
    if (total > SEG_SPLIT_THRESHOLD && !teamIds.length && !rider) {
      for (const seg of SEGMENTS_4) {
        const part = await this.fetchSegment({ startMs, endMs, timeField, teamIds, rider }, seg);
        rows.push(...part.rows);
        truncated = truncated || part.truncated;
        await this.pace.coarseSleep();
      }
    } else if (total > 0) {
      const part = await this.fetchSegment({ startMs, endMs, timeField, teamIds, rider }, FULL_DAY);
      rows = part.rows;
      truncated = part.truncated;
    }

    // 按 trackingId 去重（分页抖动会整行重复）
    const seen = new Set<string>();
    rows = rows.filter((r) => {
      const tid = r['trackingId'];
      if (tid == null) return true;
      const k = String(tid);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    this.pace.persistFloor();
    return {
      ok: true,
      date,
      time_field: timeField,
      team_ids: teamIds,
      rider,
      total,
      rows: rows.map(normalizeOrderRow),
      elapsed_sec: Math.round((Date.now() - t0) / 100) / 10,
      truncated,
      stats: this.pace.statsSnapshot(),
    };
  }
}
