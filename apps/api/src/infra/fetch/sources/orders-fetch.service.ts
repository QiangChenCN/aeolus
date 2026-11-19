import { Injectable, Logger } from '@nestjs/common';
import { FetchPaceService, MAX_RETRIES, RELOGIN_MAX, RELOGIN_BACKOFF_BASE, BACKOFF_BASE } from '../runners/fetch-pace.service';
import { DeliveryQueryService, AuthError, PAGE_SIZE, normalizeTeamIds } from './delivery-query.service';
import { AeolusCookieService } from '../creds/aeolus-cookie.service';
import { DeliveryExportService } from './delivery-export.service';

/** 全天时段（仅用于导出后对账的那一次第 1 页请求）。 */
export const FULL_DAY = '0-86400';

// ---- 完整性校验（对应 Python 的 VERIFY_EXPORT_TOTAL / TOTAL_SHORT_TOLERANCE*）----
// 为什么必须有：运单接口**成功不等于完整**。2026-09-17 实测导出拿回 5793 行、
// 同期接口 total=5820，静默少 27 行且全程无报错 —— 下游「标准达成」按单量判定，
// 少几行就表现为个别骑手少算一单。因此固定做一次「行数 vs 接口 total」对账。
// 容忍 = 比例容忍(0) + 绝对行数豁免(20)：导出是异步快照、total 是实时值，
// 二者天然有 ±几行的边界差额（抓取期间新增的运单），这种缺口不该触发重取。
export const VERIFY_TOTAL = true;
export const TOTAL_SHORT_TOLERANCE = 0.0;
export const TOTAL_SHORT_TOLERANCE_MIN = 20;

function shortTolerance(total: number): number {
  return Math.floor(total * TOTAL_SHORT_TOLERANCE) + TOTAL_SHORT_TOLERANCE_MIN;
}

export type OrderRow = Record<string, unknown>;

/**
 * 运单抓取编排层（移植自 dashboard/standard/orders_fetch.py 的 Session + fetch_orders）。
 *
 * 职责边界：只走异步导出取数；导出结果的去重、完整性对账在这里；
 * 单次 HTTP 在 DeliveryQueryService（仅对账时打 1 次第 1 页，不分页拉全量）。
 */
@Injectable()
export class OrdersFetchService {
  private readonly logger = new Logger(OrdersFetchService.name);
  private cookie = '';
  private reloginCount = 0;

  constructor(
    private readonly pace: FetchPaceService,
    private readonly query: DeliveryQueryService,
    private readonly cookies: AeolusCookieService,
    private readonly exportSvc: DeliveryExportService,
  ) {}

  /**
   * 懒取 cookie：登录现在是异步的（validToken 探针 + 必要时 SSO），不能在构造函数里做。
   * 每次抓取入口调一次即可 —— 服务内已有进程内缓存，重复调用不产生额外请求。
   */
  private async ensureCookie(): Promise<string> {
    if (!this.cookie) this.cookie = await this.cookies.ensure();
    return this.cookie;
  }

  /**
   * 打一次接口：AuthError → 自动重登；其它失败（限流/网络）→ 指数退避重试。
   * 与 Python Session.call 逐一对应。
   */
  private async call(
    startMs: number,
    endMs: number,
    current: number,
    pageSize: number,
    period: string,
    timeField?: string,
  ): Promise<{ rows: OrderRow[]; total: number }> {
    let attempt = 0;
    for (;;) {
      try {
        this.pace.bump('requests');
        const out = await this.query.query({
          startMs, endMs, current, pageSize, period, cookie: this.cookie, timeField,
        });
        this.pace.reward(); // 成功一页 → 间隔往小调（慢慢探快）
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
          attempt = 0; // 新会话，退避计数归零
          continue;
        }
        // 被限流 → 抬下限（碰撞学习）；网络等其它失败 → 只退当前间隔（详见 pace.penalizeNet）
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

  /** 按 trackingId 去重（时段切片边界可能重复）。 */
  private dedup(rows: OrderRow[]): OrderRow[] {
    const seen = new Set<string>();
    const out: OrderRow[] = [];
    for (const r of rows) {
      const tid = r['trackingId'];
      if (tid == null) {
        out.push(r);
        continue;
      }
      const k = String(tid);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(r);
    }
    return out;
  }

  /**
   * 拉时间窗内全部运单明细：只走异步导出，**无分页兜底**。
   *
   * 导出失败 / 返回空 / 完整性核对发现残缺，一律抛错 —— 绝不静默返回空或部分数据：
   * 下游看板是整日覆盖写 PG 或 raw 文件，拿到残缺结果会直接污染数据。
   */
  async fetchOrders(
    startMs: number,
    endMs: number,
    timeField?: string,
    rawTeamIds?: Array<string | number> | string,
  ): Promise<OrderRow[]> {
    this.pace.reset(); // 新一次抓取重置节奏，不继承上次的惩罚/加速状态
    await this.ensureCookie(); // 登录是异步的（探针 + 必要时 SSO），在抓取前拿到会话
    const teamIds = normalizeTeamIds(rawTeamIds);

    this.logger.log(
      `运单取数：异步导出（无分页兜底）${teamIds.length ? `，站点 ${teamIds.join(',')}` : '，全站'}...`,
    );
    let rows: OrderRow[];
    try {
      rows = await this.exportSvc.exportOrders(startMs, endMs, timeField, this.cookie, teamIds);
    } catch (e) {
      throw new Error(`运单导出失败（已禁用分页兜底）：${(e as Error).message}`);
    }
    if (!rows.length) {
      throw new Error('运单导出返回空（已禁用分页兜底）');
    }

    const deduped = this.dedup(rows);
    this.logger.log(`导出成功：拿回 ${deduped.length} 行（无分页请求）`);

    // 完整性核对：仅全站导出时做。按站点导出时 queryTracking 的 total 口径无法保证与
    // teamIds 一致（若忽略该参数会返回全站 total），差行会误判残缺，故跳过。
    const total = teamIds.length ? null : await this.queryTotal(startMs, endMs, timeField);
    if (VERIFY_TOTAL && total != null) {
      const gap = Math.max(0, total - deduped.length);
      const tol = shortTolerance(total);
      this.logger.log(`完整性核对：导出 ${deduped.length} 行 / 接口 total=${total}，差 ${gap} 行`);
      if (gap > tol) {
        throw new Error(
          `运单导出残缺：导出 ${deduped.length} 行 / 接口 total=${total}，少 ${gap} 行` +
            `（容忍 ${tol}，已禁用分页兜底）`,
        );
      }
      this.logger.log(`差 ${gap} 行在容忍范围内（≤${tol}），沿用导出结果`);
    }

    this.pace.bump('requests');
    this.pace.bump('ok');
    this.pace.persistFloor();
    return deduped;
  }

  /** 只拿接口 total（一次第 1 页请求），供导出后完整性核对。失败返回 null。 */
  private async queryTotal(
    startMs: number,
    endMs: number,
    timeField?: string,
  ): Promise<number | null> {
    try {
      const p1 = await this.call(startMs, endMs, 1, PAGE_SIZE, FULL_DAY, timeField);
      return p1.total;
    } catch {
      return null;
    }
  }

}
