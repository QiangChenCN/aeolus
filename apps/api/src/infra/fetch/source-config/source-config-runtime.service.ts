import { Injectable, Logger } from '@nestjs/common';
import { SourceConfigStoreService } from './source-config-store.service';
import {
  BUILTIN_DEFAULTS,
  SourceConfig,
  buildTemplateContext,
  deepMerge,
  findUnresolved,
  renderTemplate,
  validateSourceConfig,
} from './source-config.model';
// 与 delivery-query.service 的常量保持一致，但不 import 它——避免
// DeliveryQueryService 注入本服务时形成循环依赖。
const TIME_FIELDS = ['trackingCreated', 'platformBooked', 'trackingFinish'];
const TIME_FIELD = 'trackingFinish';

/**
 * 生产取数路径的「配置桥」：只对白名单内、已发布且 enabled 的基座生效。
 *
 * 设计要点（生产安全优先）：
 *   · 5s TTL 缓存，避免每次翻页/导出都查 PG；发布/回滚/开关时主动失效。
 *   · 任何读取异常、校验失败、模板残留变量 → 返回 null，调用方回退内建硬编码逻辑。
 *   · 只输出渲染后的参数，不改变各取数服务既有的会话自愈/限流/落盘/对账编排。
 */
@Injectable()
export class SourceConfigRuntimeService {
  private readonly logger = new Logger(SourceConfigRuntimeService.name);
  private readonly cache = new Map<string, { at: number; cfg: SourceConfig | null }>();
  private readonly TTL_MS = 5000;

  constructor(private readonly store: SourceConfigStoreService) {}

  /** 发布/回滚/开关/保存后调用，确保生产路径尽快读到新配置。 */
  invalidate(id: string): void {
    this.cache.delete(id);
  }

  /** 取生产生效配置（enabled + published），失败一律返回 null 让调用方回退内建。 */
  async active(id: string): Promise<SourceConfig | null> {
    if (!Object.prototype.hasOwnProperty.call(BUILTIN_DEFAULTS, id)) return null;
    const hit = this.cache.get(id);
    if (hit && Date.now() - hit.at < this.TTL_MS) return hit.cfg;
    let cfg: SourceConfig | null = null;
    try {
      const row = await this.store.get(id);
      if (row?.enabled && row.published) {
        const merged = deepMerge<SourceConfig>(BUILTIN_DEFAULTS[id], row.published);
        merged.id = id;
        merged.enabled = true;
        const errors = validateSourceConfig(merged);
        if (errors.length) {
          this.logger.warn(`生产配置 ${id} 校验失败，回退内建：${errors.join('；')}`);
        } else {
          cfg = merged;
          this.logger.warn(`生产配置 ${id} 已生效（v${row.published_version}，type=${merged.type}），生产取数将使用配置参数`);
        }
      }
    } catch (e) {
      this.logger.warn(`读取生产配置 ${id} 失败，回退内建：${(e as Error).message}`);
    }
    this.cache.set(id, { at: Date.now(), cfg });
    return cfg;
  }

  /**
   * 通用覆盖：给定基座 id、运行时变量、内建 URL/body，返回 {url, body}。
   * 配置未启用/校验失败/渲染失败 → 原样返回内建值（生产安全兜底）。
   * 供各取数服务在单次请求前一行接入，避免重复样板代码。
   */
  async override(
    id: string,
    values: Record<string, unknown>,
    defaultUrl: string,
    defaultBody: unknown,
    pageSize = 50,
  ): Promise<{ url: string; body: unknown; active: boolean }> {
    const cfg = await this.active(id);
    if (!cfg?.http) return { url: defaultUrl, body: defaultBody, active: false };
    const url = cfg.http.url || defaultUrl;
    let body = defaultBody;
    const rendered = this.renderBody(cfg, cfg.http.body ?? defaultBody, values, pageSize);
    if (rendered != null) body = rendered;
    return { url, body, active: true };
  }

  /** 仅覆盖 URL（Quark Widget 等 payload 与运行时凭证强耦合，只暴露端点）。 */
  async overrideUrl(id: string, defaultUrl: string): Promise<string> {
    const cfg = await this.active(id);
    if (!cfg) return defaultUrl;
    if (cfg.quark?.url) return cfg.quark.url;
    if (cfg.http?.url) return cfg.http.url;
    return defaultUrl;
  }

  /**
   * 签名下载类覆盖：替换触发 URL + body（下载 URL 来自响应，无需配置）。
   */
  async overrideDownload(
    id: string,
    values: Record<string, unknown>,
    defaultUrl: string,
    defaultBody: unknown,
  ): Promise<{ url: string; body: unknown; active: boolean }> {
    const cfg = await this.active(id);
    if (!cfg?.download) return { url: defaultUrl, body: defaultBody, active: false };
    const url = cfg.download.triggerUrl || defaultUrl;
    let body = defaultBody;
    const rendered = this.renderBody(cfg, cfg.download.triggerBody ?? defaultBody, values, 50);
    if (rendered != null) body = rendered;
    return { url, body, active: true };
  }

  /**
   * GET 类覆盖：返回拼好 query-string 的 URL。配置未启用/渲染失败 → 用 defaultQuery 拼内建 URL。
   */
  async overrideQuery(
    id: string,
    values: Record<string, unknown>,
    defaultUrl: string,
    defaultQuery: Record<string, unknown>,
  ): Promise<{ url: string; active: boolean }> {
    const cfg = await this.active(id);
    if (!cfg?.http) {
      return { url: this.appendQuery(defaultUrl, defaultQuery), active: false };
    }
    const rendered = this.renderBody(cfg, cfg.http.query ?? defaultQuery, values, 50);
    const query = rendered && typeof rendered === 'object' && !Array.isArray(rendered)
      ? rendered as Record<string, unknown>
      : defaultQuery;
    return { url: this.appendQuery(cfg.http.url || defaultUrl, query), active: true };
  }

  private appendQuery(url: string, query: Record<string, unknown>): string {
    const parts = Object.entries(query)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    return parts.length ? `${url}${url.includes('?') ? '&' : '?'}${parts.join('&')}` : url;
  }

  /**
   * 渲染请求体模板；变量来自运行时参数（date/teamIds/timeField/...）。
   * 返回 null 表示不可用（未启用 / 未填变量），调用方应回退内建 body。
   */
  renderBody(
    cfg: SourceConfig,
    body: unknown,
    values: Record<string, unknown>,
    pageSize: number,
  ): Record<string, unknown> | unknown[] | string | null {
    const ctx = buildTemplateContext(values, pageSize, TIME_FIELDS, TIME_FIELD);
    try {
      const rendered = renderTemplate(body, ctx);
      const unresolved = findUnresolved(rendered);
      if (unresolved.length) {
        this.logger.warn(`生产配置 ${cfg.id} 模板变量未填：${unresolved.join(', ')}，回退内建`);
        return null;
      }
      return rendered as Record<string, unknown> | unknown[] | string;
    } catch (e) {
      this.logger.warn(`生产配置 ${cfg.id} 模板渲染失败，回退内建：${(e as Error).message}`);
      return null;
    }
  }
}
