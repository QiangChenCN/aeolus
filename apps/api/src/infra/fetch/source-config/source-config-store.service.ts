import { Injectable, Logger } from '@nestjs/common';
import { PgService } from '../../../modules/pg/pg.service';
import { SourceConfig } from './source-config.model';

/**
 * 取数基座配置持久层（PG only，OnModuleInit 自动建表）。
 *
 * draft = 正在编辑的草稿；published = 已发布生效版本。历史版本只增不改，
 * 供审计与回滚。所有写操作用事务保证 published_version 与 history 一致。
 */
const PG_DDL = `
CREATE TABLE IF NOT EXISTS source_config (
  id                TEXT PRIMARY KEY,
  type              TEXT NOT NULL,
  enabled           BOOLEAN NOT NULL DEFAULT false,
  draft             JSONB,
  published         JSONB,
  published_version INT NOT NULL DEFAULT 0,
  updated_by        TEXT,
  updated_at        TEXT
);
CREATE TABLE IF NOT EXISTS source_config_history (
  id         SERIAL PRIMARY KEY,
  config_id  TEXT NOT NULL,
  version    INT NOT NULL,
  config     JSONB NOT NULL,
  actor      TEXT,
  reason     TEXT,
  created_at TEXT,
  UNIQUE(config_id, version)
);
CREATE INDEX IF NOT EXISTS idx_source_config_history ON source_config_history(config_id, version);
`;

type ConfigRow = {
  id: string;
  type: string;
  enabled: boolean;
  draft: SourceConfig | null;
  published: SourceConfig | null;
  published_version: number;
  updated_by: string | null;
  updated_at: string | null;
};

type HistoryRow = {
  id: number;
  config_id: string;
  version: number;
  config: SourceConfig;
  actor: string | null;
  reason: string | null;
  created_at: string | null;
};

@Injectable()
export class SourceConfigStoreService {
  private readonly logger = new Logger(SourceConfigStoreService.name);

  constructor(private readonly pg: PgService) {}

  private nowStr(): string {
    const d = new Date(Date.now() + 8 * 3600 * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(
      d.getUTCHours(),
    )}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  }

  async onModuleInit(): Promise<void> {
    await this.pg.query(PG_DDL);
    this.logger.log('取数基座配置 PG 表已就绪');
  }

  async get(id: string): Promise<ConfigRow | null> {
    return this.pg.queryOne<ConfigRow>('SELECT * FROM source_config WHERE id=$1', [id]);
  }

  async list(): Promise<ConfigRow[]> {
    return this.pg.query<ConfigRow>('SELECT * FROM source_config ORDER BY id');
  }

  /** 保存草稿：首次写入时按内建默认 type 建行（published 为空）。 */
  async saveDraft(cfg: SourceConfig, actor: string): Promise<void> {
    const now = this.nowStr();
    await this.pg.query(
      `INSERT INTO source_config (id, type, enabled, draft, updated_by, updated_at)
       VALUES ($1,$2,false,$3,$4,$5)
       ON CONFLICT(id) DO UPDATE SET
         draft=excluded.draft, updated_by=excluded.updated_by, updated_at=excluded.updated_at`,
      [cfg.id, cfg.type, JSON.stringify(cfg), actor, now],
    );
  }

  /** 切换启用开关（只影响运行时是否用 DB 覆盖内建默认）。 */
  async setEnabled(id: string, enabled: boolean, actor: string): Promise<boolean> {
    const r = await this.pg.query<{ id: string }>(
      'UPDATE source_config SET enabled=$2, updated_by=$3, updated_at=$4 WHERE id=$1 RETURNING id',
      [id, enabled, actor, this.nowStr()],
    );
    return r.length > 0;
  }

  /** 发布：draft → published，版本号 +1，并写入历史。返回新版本号。 */
  async publish(id: string, actor: string, reason = 'publish'): Promise<number> {
    return this.pg.tx(async (client) => {
      const r = await client.query<ConfigRow>(
        'SELECT * FROM source_config WHERE id=$1 FOR UPDATE',
        [id],
      );
      const row = r.rows[0];
      if (!row) throw new Error(`配置不存在：${id}`);
      if (!row.draft) throw new Error(`没有可发布的草稿：${id}`);
      const version = Number(row.published_version || 0) + 1;
      await client.query(
        'UPDATE source_config SET published=$2, published_version=$3, updated_by=$4, updated_at=$5 WHERE id=$1',
        [id, JSON.stringify(row.draft), version, actor, this.nowStr()],
      );
      await client.query(
        `INSERT INTO source_config_history (config_id, version, config, actor, reason, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT(config_id, version) DO UPDATE SET config=excluded.config, actor=excluded.actor,
           reason=excluded.reason, created_at=excluded.created_at`,
        [id, version, JSON.stringify(row.draft), actor, reason, this.nowStr()],
      );
      return version;
    });
  }

  /** 回滚：把指定历史版本复制为新版本发布（版本只增不减，可追溯）。 */
  async rollback(id: string, version: number, actor: string): Promise<number> {
    return this.pg.tx(async (client) => {
      const h = await client.query<HistoryRow>(
        'SELECT * FROM source_config_history WHERE config_id=$1 AND version=$2',
        [id, version],
      );
      if (!h.rows[0]) throw new Error(`历史版本不存在：${id} v${version}`);
      const cur = await client.query<{ published_version: number }>(
        'SELECT published_version FROM source_config WHERE id=$1 FOR UPDATE',
        [id],
      );
      if (!cur.rows[0]) throw new Error(`配置不存在：${id}`);
      const next = Number(cur.rows[0].published_version || 0) + 1;
      const cfg = h.rows[0].config;
      await client.query(
        'UPDATE source_config SET published=$2, published_version=$3, draft=$2, updated_by=$4, updated_at=$5 WHERE id=$1',
        [id, JSON.stringify(cfg), next, actor, this.nowStr()],
      );
      await client.query(
        `INSERT INTO source_config_history (config_id, version, config, actor, reason, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT(config_id, version) DO UPDATE SET config=excluded.config, actor=excluded.actor,
           reason=excluded.reason, created_at=excluded.created_at`,
        [id, next, JSON.stringify(cfg), actor, `rollback to v${version}`, this.nowStr()],
      );
      return next;
    });
  }

  async history(id: string): Promise<Array<{ version: number; actor: string | null; reason: string | null; created_at: string | null }>> {
    const rows = await this.pg.query<HistoryRow>(
      'SELECT version, actor, reason, created_at FROM source_config_history WHERE config_id=$1 ORDER BY version DESC',
      [id],
    );
    return rows.map((r) => ({ version: r.version, actor: r.actor, reason: r.reason, created_at: r.created_at }));
  }

  async historyConfig(id: string, version: number): Promise<SourceConfig | null> {
    const row = await this.pg.queryOne<HistoryRow>(
      'SELECT config FROM source_config_history WHERE config_id=$1 AND version=$2',
      [id, version],
    );
    return row?.config || null;
  }
}
