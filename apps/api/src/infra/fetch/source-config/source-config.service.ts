import { BadRequestException, Injectable } from '@nestjs/common';
import { SourceConfigStoreService } from './source-config-store.service';
import { SourceConfigRuntimeService } from './source-config-runtime.service';
import {
  BUILTIN_DEFAULTS,
  SourceConfig,
  deepMerge,
  validateSourceConfig,
} from './source-config.model';

/** 配置服务：内建默认 + DB 覆盖的合并、草稿/发布/回滚编排、校验。 */
@Injectable()
export class SourceConfigService {
  constructor(
    private readonly store: SourceConfigStoreService,
    private readonly runtime: SourceConfigRuntimeService,
  ) {}

  /** 仅 P0/P1 登记的试点基座可编辑；其它基座继续走原手写服务。 */
  private assertSupported(id: string): void {
    if (!Object.prototype.hasOwnProperty.call(BUILTIN_DEFAULTS, id)) {
      throw new BadRequestException(`取数基座 ${id} 暂不支持配置编辑（P0/P1 试点仅 delivery-query）`);
    }
  }

  /**
   * 运行时生效配置：内建默认 deep-merge 已发布覆盖（仅 enabled=true 时）。
   * DB 无记录 / 未发布 / 关闭开关 → 完全等于内建默认。
   */
  async resolveConfig(id: string): Promise<SourceConfig> {
    this.assertSupported(id);
    const base = BUILTIN_DEFAULTS[id];
    const row = await this.store.get(id);
    if (!row?.enabled || !row.published) return base;
    const merged = deepMerge<SourceConfig>(base, row.published);
    merged.id = id;
    merged.enabled = true;
    return merged;
  }

  /** 列表：每个试点一项，带草稿/发布状态（P0 只读展示用）。 */
  async list(): Promise<Array<Record<string, unknown>>> {
    const rows = await this.store.list();
    const byId = new Map(rows.map((r) => [r.id, r]));
    return Object.keys(BUILTIN_DEFAULTS).map((id) => {
      const row = byId.get(id);
      return {
        id,
        type: BUILTIN_DEFAULTS[id].type,
        enabled: Boolean(row?.enabled),
        hasDraft: Boolean(row?.draft),
        hasPublished: Boolean(row?.published),
        publishedVersion: Number(row?.published_version || 0),
        updatedBy: row?.updated_by || '',
        updatedAt: row?.updated_at || '',
      };
    });
  }

  /** 详情：内建默认 + 草稿 + 已发布 + 历史摘要。 */
  async detail(id: string): Promise<Record<string, unknown>> {
    this.assertSupported(id);
    const [row, history] = await Promise.all([this.store.get(id), this.store.history(id)]);
    return {
      id,
      builtin: BUILTIN_DEFAULTS[id],
      draft: row?.draft || null,
      published: row?.published || null,
      enabled: Boolean(row?.enabled),
      publishedVersion: Number(row?.published_version || 0),
      updatedBy: row?.updated_by || '',
      updatedAt: row?.updated_at || '',
      history,
    };
  }

  /** 保存草稿：payload 与内建默认 deep-merge 后整体校验，拒绝非法配置入库。 */
  async saveDraft(id: string, payload: Partial<SourceConfig>, actor: string): Promise<SourceConfig> {
    this.assertSupported(id);
    const cfg = deepMerge<SourceConfig>(BUILTIN_DEFAULTS[id], payload || {});
    cfg.id = id;
    cfg.type = BUILTIN_DEFAULTS[id].type; // 类型由基座固定，不允许改
    const errors = validateSourceConfig(cfg);
    if (errors.length) throw new BadRequestException(`配置校验失败：${errors.join('；')}`);
    await this.store.saveDraft(cfg, actor);
    this.runtime.invalidate(id);
    return cfg;
  }

  async publish(id: string, actor: string): Promise<number> {
    this.assertSupported(id);
    const row = await this.store.get(id);
    if (!row?.draft) throw new BadRequestException(`没有可发布的草稿：${id}`);
    const errors = validateSourceConfig(row.draft);
    if (errors.length) throw new BadRequestException(`配置校验失败：${errors.join('；')}`);
    const version = await this.store.publish(id, actor);
    this.runtime.invalidate(id);
    return version;
  }

  async rollback(id: string, version: number, actor: string): Promise<number> {
    this.assertSupported(id);
    if (!Number.isInteger(version) || version <= 0) throw new BadRequestException('version 必须是正整数');
    const v = await this.store.rollback(id, version, actor);
    this.runtime.invalidate(id);
    return v;
  }

  async setEnabled(id: string, enabled: boolean, actor: string): Promise<boolean> {
    this.assertSupported(id);
    const ok = await this.store.setEnabled(id, enabled, actor);
    if (!ok) throw new BadRequestException(`配置不存在：${id}（请先保存草稿）`);
    this.runtime.invalidate(id);
    return enabled;
  }

  async historyConfig(id: string, version: number): Promise<SourceConfig | null> {
    this.assertSupported(id);
    return this.store.historyConfig(id, version);
  }
}
