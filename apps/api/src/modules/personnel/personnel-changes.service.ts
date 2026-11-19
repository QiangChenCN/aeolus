import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PgService } from '../pg/pg.service';
import { beijingNowStr } from '../../common/format.util';

/**
 * 人事异动记录（人员/骑手通用）持久层（PostgreSQL only）。
 *
 * 定位：花名册的**事件流**（audit trail）——调店、转岗、状态变更、资料修改、
 * 新增/删除均自动落一条记录，页面以时间线展示。设计参考 frappe/hrms 的
 * employee lifecycle 与 Horilla 的 employee 事件模型，但只保留本项目需要的最小集。
 *
 * 记录写入失败**静默跳过**（仅告警）：异动是辅助审计，绝不阻塞花名册主流程。
 * 保留期：init 时清理 400 天前的旧记录（审计无需永久保留，防表无限膨胀）。
 */
const PG_DDL = `
CREATE TABLE IF NOT EXISTS personnel_changes (
  id          SERIAL PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id   INTEGER NOT NULL,
  target_name TEXT DEFAULT '',
  change_type TEXT NOT NULL,
  field       TEXT DEFAULT '',
  old_value   TEXT DEFAULT '',
  new_value   TEXT DEFAULT '',
  note        TEXT DEFAULT '',
  operator    TEXT DEFAULT '',
  created_at  TEXT);
CREATE INDEX IF NOT EXISTS idx_personnel_changes_target ON personnel_changes(target_type, target_id);
`;

/** 异动记录保留天数（超出部分启动时静默清理）。 */
const RETENTION_DAYS = 400;

export type ChangeTargetType = 'rider' | 'staff';
export type ChangeType = 'create' | 'delete' | 'transfer' | 'transfer_position' | 'status' | 'edit';

export interface PersonnelChangeRow {
  id: number;
  target_type: string;
  target_id: number;
  target_name: string;
  change_type: string;
  field: string;
  old_value: string;
  new_value: string;
  note: string;
  operator: string;
  created_at: string;
}

export interface PersonnelChangeEntry {
  target_type: ChangeTargetType;
  target_id: number;
  target_name: string;
  change_type: ChangeType;
  field?: string;
  old_value?: string;
  new_value?: string;
  note?: string;
  operator?: string;
}

@Injectable()
export class PersonnelChangesService {
  private readonly logger = new Logger(PersonnelChangesService.name);
  private tableReady = false;
  private warned = false;

  constructor(private readonly pg: PgService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.pg.query(PG_DDL);
      this.tableReady = true;
      await this.cleanupExpired();
    } catch (e) {
      this.logger.warn(`personnel_changes 建表失败（异动记录不可用）：${(e as Error).message}`);
    }
  }

  /** 清理超保留期的旧异动（失败仅告警，不影响服务可用）。 */
  private async cleanupExpired(): Promise<void> {
    try {
      const cutoff = beijingNowStr(new Date(Date.now() - RETENTION_DAYS * 86400_000));
      await this.pg.query('DELETE FROM personnel_changes WHERE created_at < $1', [cutoff]);
    } catch (e) {
      this.logger.warn(`异动记录清理失败：${(e as Error).message}`);
    }
  }

  /** 记录一条异动。存储不可用 / 写入失败仅告警，不抛错（辅助审计不阻塞主流程）。 */
  async record(e: PersonnelChangeEntry): Promise<void> {
    if (!this.tableReady) {
      if (!this.warned) {
        this.warned = true;
        this.logger.warn('personnel_changes 未就绪，异动记录被跳过');
      }
      return;
    }
    try {
      await this.pg.query(
        `INSERT INTO personnel_changes
          (target_type, target_id, target_name, change_type, field, old_value, new_value, note, operator, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          e.target_type, e.target_id, e.target_name || '', e.change_type,
          e.field || '', e.old_value || '', e.new_value || '',
          e.note || '', e.operator || '', beijingNowStr(),
        ],
      );
    } catch (err) {
      this.logger.warn(`异动记录写入失败：${(err as Error).message}`);
    }
  }

  /** 异动列表（按时间倒序），支持按对象过滤。 */
  async list(opts: { targetType?: string; targetId?: number; page?: number; pageSize?: number }) {
    if (!this.tableReady) return { ok: true, total: 0, page: 1, pageSize: 20, rows: [] as PersonnelChangeRow[] };
    const where: string[] = [];
    const params: unknown[] = [];
    const tt = String(opts.targetType || '').trim();
    if (tt) {
      params.push(tt);
      where.push(`target_type = $${params.length}`);
    }
    const tid = Number(opts.targetId);
    if (Number.isFinite(tid) && tid > 0) {
      params.push(tid);
      where.push(`target_id = $${params.length}`);
    }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const page = Math.max(1, Number(opts.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 20));
    params.push(pageSize);
    params.push((page - 1) * pageSize);
    const [rows, cnt] = await Promise.all([
      this.pg.query(
        `SELECT * FROM personnel_changes ${whereSql} ORDER BY id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      ),
      this.pg.queryOne<{ cnt: string }>(
        `SELECT count(*)::text cnt FROM personnel_changes ${whereSql}`,
        params.slice(0, params.length - 2),
      ),
    ]);
    return { ok: true, total: Number(cnt?.cnt || 0), page, pageSize, rows: rows as PersonnelChangeRow[] };
  }
}
