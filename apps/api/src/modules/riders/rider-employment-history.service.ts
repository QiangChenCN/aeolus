import { Injectable, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import { PgService } from '../pg/pg.service';
import { beijingNowStr, str } from '../../common/format.util';

/**
 * 骑手入离职生命周期事件流（事实源）+ 上游观测快照。
 *
 * · rider_employment_event：只追加、不修改，双时态（业务生效时间 effective_* / 系统记录时间 recorded_at）。
 * · rider_upstream_snapshot：风神每次刷新的观测值，单独存，避免污染人工确认的人事事实。
 * · rider_roster 仍是当前态投影，knight_id 保持唯一主键；本服务负责事件落库与历史查询。
 */
const DDL = `
CREATE TABLE IF NOT EXISTS rider_employment_event (
  id              BIGSERIAL PRIMARY KEY,
  knight_id       TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  effective_from  DATE,
  effective_to    DATE,
  recorded_at     TEXT NOT NULL,
  payload         JSONB DEFAULT '{}'::jsonb,
  actor           TEXT DEFAULT '',
  source          TEXT DEFAULT '',
  supersedes_id   BIGINT,
  idempotency_key TEXT UNIQUE,
  note            TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_ree_knight
  ON rider_employment_event(knight_id, effective_from DESC, id DESC);
CREATE TABLE IF NOT EXISTS rider_upstream_snapshot (
  id              BIGSERIAL PRIMARY KEY,
  knight_id       TEXT NOT NULL,
  observed_at     TEXT NOT NULL,
  work_status     TEXT DEFAULT '',
  entry_date      DATE,
  leave_date      DATE,
  department_id   TEXT DEFAULT '',
  department_name TEXT DEFAULT '',
  raw             JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_rus_knight
  ON rider_upstream_snapshot(knight_id, observed_at DESC, id DESC);
`;

export type EmploymentEventType =
  | 'entry' | 'leave_apply' | 'leave' | 'rehire' | 'transfer' | 'correction';

export interface EmploymentEventInput {
  knightId: string;
  eventType: EmploymentEventType;
  effectiveFrom?: string;
  effectiveTo?: string;
  payload?: Record<string, unknown>;
  actor?: string;
  source?: string;
  supersedesId?: number;
  idempotencyKey?: string;
  note?: string;
}

export interface UpstreamSnapshotInput {
  knightId: string;
  workStatus: string;
  entryDate?: string;
  leaveDate?: string;
  departmentId?: string;
  departmentName?: string;
  raw?: Record<string, unknown>;
}

type BackfillRow = {
  knight_id: string;
  staff_name: string;
  entry_date: string | null;
  leave_date: string | null;
  apply_date: string | null;
  pre_leave_date: string | null;
  department_id: string;
  department_name: string;
  leave_reason: string;
};

@Injectable()
export class RiderEmploymentHistoryService {
  private readonly logger = new Logger(RiderEmploymentHistoryService.name);

  constructor(private readonly pg: PgService) {}

  /** 建表 + 一次性从当前态回填历史事件；由 rider_roster 初始化完成后调用。 */
  async ensureSchemaAndBackfill(): Promise<void> {
    await this.pg.query(DDL);
    const cnt = await this.pg.queryOne<{ cnt: string }>(
      'SELECT count(*)::text cnt FROM rider_employment_event',
    );
    if (Number(cnt?.cnt || 0) > 0) return;
    await this.pg.tx(async (client) => {
      const res = await client.query<BackfillRow>(
        `SELECT knight_id, staff_name, entry_date::text, leave_date::text,
                apply_date::text, pre_leave_date::text, department_id, department_name, leave_reason
         FROM rider_roster`,
      );
      for (const r of res.rows || []) {
        const kid = str(r.knight_id);
        if (!kid) continue;
        const base = {
          staffName: str(r.staff_name),
          departmentId: str(r.department_id),
          departmentName: str(r.department_name),
        };
        const entry = str(r.entry_date).slice(0, 10);
        const apply = str(r.apply_date || r.pre_leave_date).slice(0, 10);
        const leave = str(r.leave_date).slice(0, 10);
        if (entry) {
          await this.append(client, {
            knightId: kid, eventType: 'entry', effectiveFrom: entry,
            payload: base, source: 'backfill',
            idempotencyKey: `backfill:entry:${kid}:${entry}`,
          });
        }
        if (apply) {
          await this.append(client, {
            knightId: kid, eventType: 'leave_apply', effectiveFrom: apply,
            payload: { ...base, applyDate: str(r.apply_date).slice(0, 10), preLeaveDate: str(r.pre_leave_date).slice(0, 10) },
            source: 'backfill', idempotencyKey: `backfill:apply:${kid}:${apply}`,
          });
        }
        if (leave) {
          await this.append(client, {
            knightId: kid, eventType: 'leave', effectiveFrom: leave,
            payload: { ...base, leaveReason: str(r.leave_reason) },
            source: 'backfill', idempotencyKey: `backfill:leave:${kid}:${leave}`,
          });
        }
      }
      this.logger.log(`入离职事件回填完成：${(res.rows || []).length} 名骑手`);
    });
  }

  /** 追加一条不可变事件；幂等键冲突时静默跳过（上游重复刷新用）。 */
  async append(client: PoolClient, e: EmploymentEventInput): Promise<void> {
    await client.query(
      `INSERT INTO rider_employment_event
        (knight_id, event_type, effective_from, effective_to, recorded_at,
         payload, actor, source, supersedes_id, idempotency_key, note)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        e.knightId, e.eventType, e.effectiveFrom || null, e.effectiveTo || null,
        beijingNowStr(), JSON.stringify(e.payload || {}), e.actor || '', e.source || '',
        e.supersedesId ?? null, e.idempotencyKey || null, e.note || '',
      ],
    );
  }

  /** 保存风神某次刷新的原始观测值（与人工确认事件分开）。 */
  async snapshot(client: PoolClient, observedAt: string, rows: UpstreamSnapshotInput[]): Promise<void> {
    for (const r of rows || []) {
      if (!r.knightId) continue;
      await client.query(
        `INSERT INTO rider_upstream_snapshot
          (knight_id, observed_at, work_status, entry_date, leave_date,
           department_id, department_name, raw)
         VALUES ($1,$2,$3,$4::date,$5::date,$6,$7,$8::jsonb)`,
        [
          r.knightId, observedAt, r.workStatus || '',
          r.entryDate || null, r.leaveDate || null,
          r.departmentId || '', r.departmentName || '',
          JSON.stringify(r.raw || {}),
        ],
      );
    }
  }

  /** 骑手履历时间线：业务生效时间优先，其次系统记录时间。 */
  async list(opts: { knightId?: string; page?: number; pageSize?: number }) {
    const where: string[] = [];
    const params: unknown[] = [];
    const kid = str(opts.knightId);
    if (kid) {
      params.push(kid);
      where.push(`knight_id = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const page = Math.max(1, Number(opts.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 20));
    params.push(pageSize, (page - 1) * pageSize);
    const [rows, cnt] = await Promise.all([
      this.pg.query<Record<string, unknown>>(
        `SELECT id, knight_id AS "knightId", event_type AS "eventType",
                effective_from::text AS "effectiveFrom", effective_to::text AS "effectiveTo",
                recorded_at AS "recordedAt", payload::text AS "payload",
                actor, source, supersedes_id AS "supersedesId", note
         FROM rider_employment_event ${whereSql}
         ORDER BY effective_from DESC NULLS LAST, recorded_at DESC, id DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      ),
      this.pg.queryOne<{ cnt: string }>(
        `SELECT count(*)::text cnt FROM rider_employment_event ${whereSql}`,
        params.slice(0, params.length - 2),
      ),
    ]);
    return {
      ok: true as const,
      total: Number(cnt?.cnt || 0),
      page,
      pageSize,
      rows: (rows || []).map((r) => ({
        ...r,
        payload: r.payload ? JSON.parse(String(r.payload)) : {},
      })),
    };
  }
}
