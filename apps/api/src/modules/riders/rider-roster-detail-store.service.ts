import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  KNIGHT_API_KEY_OVERRIDES,
  KNIGHT_COLUMNS,
  KNIGHT_FIELD_LABELS,
  knightDbColumn,
} from '@aeolus/shared';
import { BizError } from '../../common/biz.error';
import { beijingNowStr, escapeLike, str } from '../../common/format.util';
import { PgService } from '../pg/pg.service';
import { readKnownTeams } from '../../infra/fetch/sources/teams-fetch.service';

/**
 * rider_roster：保留表名，按骑手明细新数据重新设计的表结构。
 *
 * 旧花名册列（name/team_id/status/work_type/note/last_seen 等）不再存在；
 * 列与上游原生字段 camelCase → snake_case 一一对应，另加 updated_at 记录更新时间；
 * 上游自身的 updatedAt 落到 upstream_updated_at，避免与表更新时间重名。
 * 启动时检测到旧结构会一次性迁移：能映射的字段尽量带过来，不能映射的旧列丢弃。
 */
const FIELDS = Object.keys(KNIGHT_FIELD_LABELS);
const DB_TO_FIELD = new Map(FIELDS.map((k) => [knightDbColumn(k), k]));
const DETAIL_COLS = [...new Set(FIELDS.map(knightDbColumn))];
const REFRESHED = 'updated_at';
/** 取数基座刷新时覆盖的列（上游字段 + 更新时间）。 */
const ALL_COLS = [...DETAIL_COLS, REFRESHED];
/** 本地人工维护列：不参与上游刷新。 */
const LOCAL_FIELDS: Array<{ col: string; key: string; label: string }> = [
  { col: 'rider_attribute', key: 'riderAttribute', label: '骑手属性' },
  { col: 'entry_source', key: 'entrySource', label: '入职来源' },
  { col: 'source_detail', key: 'sourceDetail', label: '来源详情' },
  { col: 'settlement_method', key: 'settlementMethod', label: '结算方式' },
  { col: 'settlement_price', key: 'settlementPrice', label: '结算单价' },
  { col: 'remark', key: 'remark', label: '备注' },
  { col: 'pre_leave_date', key: 'preLeaveDate', label: '预离职日期' },
  { col: 'apply_date', key: 'applyDate', label: '申请日期' },
  { col: 'delete_account_date', key: 'deleteAccountDate', label: '删号日期' },
  { col: 'delete_operator', key: 'deleteOperator', label: '删号操作人' },
  { col: 'transfer_date', key: 'transferDate', label: '调站日期' },
  { col: 'transfer_operator', key: 'transferOperator', label: '调站操作人' },
  { col: 'transfer_note', key: 'transferNote', label: '调站备注' },
];
const LOCAL_COLS = LOCAL_FIELDS.map((f) => f.col);
const TABLE_COLS = [...ALL_COLS, ...LOCAL_COLS];
/** 真正按 PostgreSQL DATE 存储的列。 */
const DATE_COLS = new Set([
  'entry_date', 'leave_date', 'pre_leave_date', 'apply_date', 'delete_account_date', 'transfer_date',
]);
const apiKey = (field: string) => KNIGHT_API_KEY_OVERRIDES[field] || field;

const colDef = (c: string) =>
  c === 'knight_id'
    ? 'knight_id TEXT PRIMARY KEY'
    : DATE_COLS.has(c)
      ? `${c} DATE`
      : `${c} TEXT DEFAULT ''`;
const CREATE_SQL = `CREATE TABLE IF NOT EXISTS rider_roster (
  ${TABLE_COLS.map(colDef).join(',\n  ')}
)`;
const LOCAL_MIGRATE = LOCAL_COLS
  .map((c) => DATE_COLS.has(c)
    ? `ALTER TABLE rider_roster ADD COLUMN IF NOT EXISTS ${c} DATE;`
    : `ALTER TABLE rider_roster ADD COLUMN IF NOT EXISTS ${c} TEXT DEFAULT '';`)
  .join('\n');
const INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_rider_roster_department ON rider_roster(department_id);
CREATE INDEX IF NOT EXISTS idx_rider_roster_staff_name ON rider_roster(staff_name);
CREATE INDEX IF NOT EXISTS idx_rider_roster_work_status ON rider_roster(work_status);
CREATE INDEX IF NOT EXISTS idx_rider_roster_updated ON rider_roster(updated_at);
`;

const SELECT_COLS = [
  ...FIELDS.map((k) => {
    const col = knightDbColumn(k);
    return `${DATE_COLS.has(col) ? `${col}::text` : col} AS "${apiKey(k)}"`;
  }),
  `${REFRESHED} AS "refreshedAt"`,
  ...LOCAL_FIELDS.map((f) => f.key === 'settlementPrice'
    ? `'' AS "settlementPrice",
       CASE WHEN settlement_price IS NOT NULL AND settlement_price <> '' THEN true ELSE false END AS "hasSettlementPrice"`
    : `${DATE_COLS.has(f.col) ? `${f.col}::text` : f.col} AS "${f.key}"`),
].join(', ');
const COLUMNS = [
  ...KNIGHT_COLUMNS.map((c) => ({ ...c, key: apiKey(c.key) })),
  { key: 'refreshedAt', label: '更新时间' },
  ...LOCAL_FIELDS.map((f) => ({ key: f.key, label: f.label })),
];

function raw(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
}

/** 日期列空字符串写 NULL；其余列保持空字符串。 */
function dbVal(col: string, v: unknown): string | null {
  const s = raw(v);
  return DATE_COLS.has(col) && !s ? null : s;
}

/** 对外日期字段（entryDate/leaveDate）归一化回上游字段名。 */
function pickField(data: Record<string, unknown>, field: string): unknown {
  const alias = apiKey(field);
  return data[field] !== undefined ? data[field] : data[alias];
}

/** 站点名称兜底：忽略误当成名称的站点 ID，按风神站点目录落盘解析真实名称。 */
function resolveDeptName(deptId: string, provided: unknown): string {
  const name = str(provided);
  if (name && name !== deptId) return name;
  return readKnownTeams().find((t) => String(t.id) === deptId)?.name || name || deptId;
}

@Injectable()
export class RiderRosterDetailStoreService implements OnModuleInit {
  private readonly logger = new Logger(RiderRosterDetailStoreService.name);
  private tableReady = false;

  constructor(private readonly pg: PgService) {}

  async onModuleInit(): Promise<void> {
    try {
      const rows = await this.pg.query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'rider_roster'`,
      );
      const cols = new Set((rows || []).map((r) => r.column_name));
      const types = new Map((rows || []).map((r) => [r.column_name, r.data_type] as const));
      let legacyMigrated = false;
      if (cols.has('status')) {
        await this.migrateLegacy();
        legacyMigrated = true;
      } else if (cols.has('refreshed_at')) await this.renameUpdatedColumns(cols);
      if (!legacyMigrated) {
        if (cols.has('entry_time')) await this.migrateDateColumn('entry_time', 'entry_date');
        if (cols.has('leave_time')) await this.migrateDateColumn('leave_time', 'leave_date');
        for (const col of ['entry_date', 'leave_date', 'pre_leave_date', 'apply_date', 'delete_account_date', 'transfer_date']) {
          if (types.get(col) === 'text') await this.convertDateColumn(col);
        }
      }
      if (cols.has('rider_source') && !cols.has('entry_source')) {
        await this.pg.query('ALTER TABLE rider_roster RENAME COLUMN rider_source TO entry_source');
      }
      await this.pg.query(CREATE_SQL);
      await this.pg.query(LOCAL_MIGRATE);
      await this.pg.query(INDEX_SQL);
      this.tableReady = true;
    } catch (e) {
      this.logger.warn(`rider_roster 初始化失败：${(e as Error).message}`);
    }
  }

  /** 一次性改名：上游 updated_at → upstream_updated_at，本表 refreshed_at → updated_at。 */
  private async renameUpdatedColumns(cols: Set<string>): Promise<void> {
    this.logger.warn('检测到 refreshed_at 列，正在更名为 updated_at');
    if (cols.has('updated_at') && !cols.has('upstream_updated_at')) {
      await this.pg.query('ALTER TABLE rider_roster RENAME COLUMN updated_at TO upstream_updated_at');
    }
    await this.pg.query('ALTER TABLE rider_roster RENAME COLUMN refreshed_at TO updated_at');
  }

  private async migrateDateColumn(from: string, to: string): Promise<void> {
    this.logger.warn(`检测到 ${from} 列，正在更名为 ${to} 并转为 DATE`);
    await this.pg.query(`ALTER TABLE rider_roster RENAME COLUMN ${from} TO ${to}`);
    await this.convertDateColumn(to);
  }

  private async convertDateColumn(col: string): Promise<void> {
    await this.pg.query(`ALTER TABLE rider_roster ALTER COLUMN ${col} DROP DEFAULT`);
    await this.pg.query(
      `ALTER TABLE rider_roster ALTER COLUMN ${col} TYPE DATE
       USING CASE WHEN ${col} ~ '^\\d{4}-\\d{2}-\\d{2}' THEN left(${col}, 10)::date ELSE NULL END`,
    );
  }

  /** 一次性迁移：旧表 → 新结构。旧 note/work_type/last_seen 等无对应列，丢弃。 */
  private async migrateLegacy(): Promise<void> {
    this.logger.warn('检测到旧版 rider_roster 结构，正在按骑手明细字段重建表');
    await this.pg.query(`DROP TABLE IF EXISTS rider_roster_new`);
    await this.pg.query(CREATE_SQL.replace('rider_roster', 'rider_roster_new'));
    await this.pg.query(`
      INSERT INTO rider_roster_new
        (knight_id, staff_name, mobile, department_id, department_name,
         work_status, entry_date, leave_date, updated_at)
      SELECT knight_id, name, mobile, team_id, team_name,
             CASE status WHEN 'quit' THEN '2' ELSE '1' END,
             CASE WHEN hired_at ~ '^\\d{4}-\\d{2}-\\d{2}' THEN left(hired_at, 10)::date ELSE NULL END,
             CASE WHEN left_at ~ '^\\d{4}-\\d{2}-\\d{2}' THEN left(left_at, 10)::date ELSE NULL END,
             ''
      FROM rider_roster
      WHERE knight_id IS NOT NULL AND knight_id <> ''
      ON CONFLICT (knight_id) DO NOTHING
    `);
    await this.pg.query('DROP TABLE rider_roster');
    await this.pg.query('ALTER TABLE rider_roster_new RENAME TO rider_roster');
  }

  private assertReady(): void {
    if (!this.tableReady) throw new Error('rider_roster 不可用（PostgreSQL 未配置或初始化失败）');
  }

  /** 全量 upsert：上游字段按新结构直接落库，不保留旧花名册人工字段。 */
  async upsertAll(rows: Record<string, unknown>[], refreshedAt: string) {
    this.assertReady();
    const existing = await this.pg.query<{ knight_id: string }>('SELECT knight_id FROM rider_roster');
    const known = new Set((existing || []).map((r) => str(r.knight_id)));

    const seen = new Set<string>();
    const arrays: (string | null)[][] = ALL_COLS.map(() => []);
    let added = 0;
    let updated = 0;
    for (const row of rows || []) {
      const kid = str(row['knightId'] ?? row['knight_id']);
      if (!kid || seen.has(kid)) continue;
      seen.add(kid);
      if (known.has(kid)) updated++;
      else added++;
      ALL_COLS.forEach((col, i) => {
        arrays[i].push(col === REFRESHED ? refreshedAt : dbVal(col, row[DB_TO_FIELD.get(col) || '']));
      });
    }
    if (!seen.size) return { ok: true as const, total: 0, added: 0, updated: 0 };

    const aliases = ALL_COLS.map((_, i) => `x.c${i}`).join(', ');
    const aliasDefs = ALL_COLS.map((_, i) => `c${i}`).join(', ');
    const unnest = ALL_COLS.map((_, i) => `$${i + 1}::text[]`).join(', ');
    const updateSet = DETAIL_COLS.filter((c) => c !== 'knight_id')
      .map((c) => `${c} = EXCLUDED.${c}`)
      .concat(`${REFRESHED} = EXCLUDED.${REFRESHED}`)
      .join(', ');

    await this.pg.query(
      `INSERT INTO rider_roster (${ALL_COLS.join(', ')})
       SELECT ${aliases}
       FROM unnest(${unnest}) AS x(${aliasDefs})
       ON CONFLICT (knight_id) DO UPDATE SET ${updateSet}`,
      arrays,
    );
    return { ok: true as const, total: seen.size, added, updated };
  }

  /** 手动新增：只填写表单字段，其余列留空；更新时间由服务端生成。 */
  async create(data: Record<string, unknown>, allowed: Set<string> | null = null) {
    this.assertReady();
    const knightId = str(data.knightId ?? data.knight_id);
    const staffName = str(data.staffName ?? data.staff_name);
    const departmentId = str(data.departmentId ?? data.department_id);
    if (!knightId) throw new BizError('骑手ID不能为空');
    if (!staffName) throw new BizError('骑手姓名不能为空');
    if (allowed && departmentId && !allowed.has(departmentId)) {
      throw new BizError('该站点不在你的数据权限范围内');
    }
    const dup = await this.pg.queryOne<{ knight_id: string }>(
      'SELECT knight_id FROM rider_roster WHERE knight_id = $1',
      [knightId],
    );
    if (dup) throw new BizError(`骑手ID ${knightId} 已存在`);

    const values: Record<string, string | null> = {};
    for (const [col, field] of DB_TO_FIELD) values[col] = dbVal(col, pickField(data, field));
    values.knight_id = knightId;
    values.staff_name = staffName;
    values.department_id = departmentId;
    values.department_name = resolveDeptName(departmentId, data.departmentName ?? data.department_name);
    values.work_status = '1';
    values[REFRESHED] = beijingNowStr();
    for (const f of LOCAL_FIELDS) values[f.col] = dbVal(f.col, data[f.key]);

    await this.pg.query(
      `INSERT INTO rider_roster (${TABLE_COLS.join(', ')})
       VALUES (${TABLE_COLS.map((_, i) => `$${i + 1}`).join(', ')})`,
      TABLE_COLS.map((c) => values[c] ?? (DATE_COLS.has(c) ? null : '')),
    );
    return { ok: true as const, knightId };
  }

  /** 手动编辑：只更新表单字段， KnightId 不可变；离职时自动补离职日期。 */
  async update(data: Record<string, unknown>, allowed: Set<string> | null = null) {
    this.assertReady();
    const knightId = str(data.knightId ?? data.knight_id);
    if (!knightId) throw new BizError('骑手ID不能为空');
    const existing = await this.pg.queryOne<Record<string, string>>(
      'SELECT * FROM rider_roster WHERE knight_id = $1',
      [knightId],
    );
    if (!existing) throw new BizError('骑手不存在');
    const currentDept = str(existing.department_id);
    if (allowed && currentDept && !allowed.has(currentDept)) {
      throw new BizError('该站点不在你的数据权限范围内');
    }
    const deptProvided = data.departmentId !== undefined || data.department_id !== undefined;
    const nextDept = deptProvided
      ? str(data.departmentId ?? data.department_id)
      : currentDept;
    if (allowed && nextDept && !allowed.has(nextDept)) {
      throw new BizError('该站点不在你的数据权限范围内');
    }

    const fields: Record<string, string | null> = {};
    for (const [col, field] of DB_TO_FIELD) {
      const v = pickField(data, field);
      if (v !== undefined) fields[col] = dbVal(col, v);
    }
    const staffName = str(data.staffName ?? data.staff_name) || str(existing.staff_name);
    if (!staffName) throw new BizError('骑手姓名不能为空');
    fields.knight_id = knightId;
    fields.staff_name = staffName;
    fields.department_id = nextDept;
    fields.department_name = resolveDeptName(
      nextDept,
      deptProvided ? (data.departmentName ?? data.department_name) : str(existing.department_name),
    );

    if (data.workStatus !== undefined || data.work_status !== undefined) {
      const ws = str(data.workStatus ?? data.work_status);
      if (!['1', '2'].includes(ws)) throw new BizError('在职状态只能是 1 或 2');
      fields.work_status = ws;
      if (ws === '2' && !str(pickField(data, 'leaveTime'))) {
        fields.leave_date = beijingNowStr().slice(0, 10);
      }
      if (ws === '1') fields.leave_date = null;
    }
    for (const f of LOCAL_FIELDS) {
      if (data[f.key] !== undefined) fields[f.col] = dbVal(f.col, data[f.key]);
    }
    fields[REFRESHED] = beijingNowStr();

    const cols = Object.keys(fields).filter((c) => c !== 'knight_id');
    await this.pg.query(
      `UPDATE rider_roster SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}
       WHERE knight_id = $1`,
      [knightId, ...cols.map((c) => fields[c] ?? (DATE_COLS.has(c) ? null : ''))],
    );
    return { ok: true as const, knightId, workStatus: str(fields.work_status || existing.work_status) };
  }

  /** 单独查看结算单价真实值（列表只返回打码占位）。 */
  async settlement(knightId: string, allowed: Set<string> | null = null) {
    this.assertReady();
    const kid = str(knightId);
    if (!kid) throw new BizError('骑手ID不能为空');
    const row = await this.pg.queryOne<{ department_id: string; settlement_price: string }>(
      'SELECT department_id, settlement_price FROM rider_roster WHERE knight_id = $1',
      [kid],
    );
    if (!row) throw new BizError('骑手不存在');
    if (allowed && str(row.department_id) && !allowed.has(str(row.department_id))) {
      throw new BizError('该站点不在你的数据权限范围内');
    }
    return { ok: true as const, knightId: kid, settlementPrice: str(row.settlement_price) };
  }

  /** 页面读库：筛选/权限/分页都在 SQL 层。 */
  async list(opts: {
    keyword?: string;
    team?: string;
    workStatus?: string;
    page?: number;
    pageSize?: number;
    allowed?: Set<string> | null;
  }) {
    this.assertReady();
    const where: string[] = [];
    const params: unknown[] = [];
    const kw = str(opts.keyword);
    if (kw) {
      params.push(`%${escapeLike(kw)}%`);
      const i = params.length;
      where.push(`(staff_name ILIKE $${i} OR knight_id ILIKE $${i} OR mobile ILIKE $${i})`);
    }
    const team = str(opts.team);
    if (team) {
      params.push(team);
      where.push(`department_id = $${params.length}`);
    }
    const workStatus = str(opts.workStatus);
    if (workStatus) {
      params.push(workStatus);
      where.push(`work_status = $${params.length}`);
    }
    const allowed = opts.allowed || null;
    if (allowed && allowed.size === 0) {
      return { ok: true as const, total: 0, page: 1, pageSize: 50, rows: [], columns: COLUMNS };
    }
    if (allowed) {
      params.push([...allowed]);
      where.push(`department_id = ANY($${params.length})`);
    }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const orderBy = workStatus === '1'
      ? `entry_date DESC NULLS LAST,
         CASE WHEN knight_id ~ '^\\d+$' THEN knight_id::bigint END DESC NULLS LAST,
         knight_id DESC`
      : 'department_name, staff_name';
    const page = Math.max(1, Number(opts.page) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(opts.pageSize) || 50));
    params.push(pageSize, (page - 1) * pageSize);

    const [rows, cnt] = await Promise.all([
      this.pg.query<Record<string, unknown>>(
        `SELECT ${SELECT_COLS} FROM rider_roster ${whereSql}
         ORDER BY ${orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      ),
      this.pg.queryOne<{ cnt: string }>(
        `SELECT count(*)::text cnt FROM rider_roster ${whereSql}`,
        params.slice(0, params.length - 2),
      ),
    ]);
    return { ok: true as const, total: Number(cnt?.cnt || 0), page, pageSize, rows, columns: COLUMNS };
  }
}
