import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { dirs } from '../../config/paths';
import { TeamRef, readKnownTeams } from '../../infra/fetch/sources/teams-fetch.service';
import { todayYmd } from '../../infra/fetch/storage/raw-cache.service';
import { PgService } from '../pg/pg.service';
import { PersonnelChangesService } from '../personnel/personnel-changes.service';
import { BizError } from '../../common/biz.error';
import { str, beijingNowStr, escapeLike, maskMobile, isYmd } from '../../common/format.util';

/**
 * 骑手花名册（人事主数据）持久层（PostgreSQL only）。
 *
 * 定位：**本地人事主数据**（花名册），区别于考勤快照的只读投影——
 * 姓名/手机号/站点/工作类型/在职状态/入职离职日期/备注由运营维护，
 * 风神考勤名册只作为「同步来源」：一键把快照里的骑手 upsert 进花名册
 * （新增缺失的、刷新已有人的姓名/手机号/站点与最近出现日期），状态仍由人管。
 *
 * 数据权限口径与 staff 相同：list/create/update/remove 接受 `allowed`，
 * 查询 SQL 层过滤（含 count），写操作校验目标站点。
 *
 * 建表幂等（CREATE TABLE IF NOT EXISTS），与 delivery/operation-log 同一范式。
 */
const PG_DDL = `
CREATE TABLE IF NOT EXISTS rider_roster (
  id          SERIAL PRIMARY KEY,
  knight_id   TEXT UNIQUE,
  name        TEXT NOT NULL,
  mobile      TEXT DEFAULT '',
  team_id     TEXT DEFAULT '',
  team_name   TEXT DEFAULT '',
  work_type   TEXT DEFAULT '全职',
  status      TEXT NOT NULL DEFAULT 'active',
  hired_at    TEXT DEFAULT '',
  left_at     TEXT DEFAULT '',
  note        TEXT DEFAULT '',
  last_seen   TEXT DEFAULT '',
  created_at  TEXT,
  updated_at  TEXT,
  updated_by  TEXT);
CREATE INDEX IF NOT EXISTS idx_rider_roster_team ON rider_roster(team_id);
CREATE INDEX IF NOT EXISTS idx_rider_roster_status ON rider_roster(status);
`;

const ATT_RE = /^att_(\d+)_(\d{4}-\d{2}-\d{2})\.json$/;

/** 状态枚举：active 在职 / quit 离职 / suspended 停用。 */
export const ROSTER_STATUSES = ['active', 'quit', 'suspended'] as const;
/** 工作类型枚举（展示用，自由字符串但前端给固定选项）。 */
export const ROSTER_WORK_TYPES = ['全职', '兼职', '众包'] as const;

export interface RosterRow {
  id: number;
  knight_id: string;
  name: string;
  mobile: string;
  team_id: string;
  team_name: string;
  work_type: string;
  status: string;
  hired_at: string;
  left_at: string;
  note: string;
  last_seen: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
}

const MOBILE_RE = /^[0-9+\-\s]{5,20}$/;


@Injectable()
export class RidersService {
  private readonly logger = new Logger(RidersService.name);
  private readonly dataDir = dirs.runtime('raw');
  private tableReady = false;
  /** 同步进行中标记（单实例内存锁）：防两人同时点同步造成并发覆盖。 */
  private syncing = false;

  constructor(private readonly pg: PgService, private readonly changes: PersonnelChangesService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.pg.query(PG_DDL);
      this.tableReady = true;
    } catch (e) {
      // DATABASE_URL 未配置或 PG 不可达：花名册功能不可用，但不要拖垮整个 API 启动
      this.logger.warn(`rider_roster 建表失败（花名册功能不可用）：${(e as Error).message}`);
    }
  }

  private assertReady(): void {
    if (!this.tableReady) throw new Error('花名册存储不可用（PostgreSQL 未配置或建表失败）');
  }

  /** 站点名解析：team_id → 已知站点名（未知时回退 id）。 */
  private resolveTeamName(teamId: string): string {
    if (!teamId) return '';
    const known = readKnownTeams().find((t: TeamRef) => String(t.id) === String(teamId));
    return known ? known.name : teamId;
  }

  /** 数据权限校验：目标站点必须在可见集合内（空站点=总部，不受限）。 */
  private assertTeamAllowed(teamId: string, allowed: Set<string> | null): void {
    if (!allowed || !teamId) return;
    if (!allowed.has(String(teamId))) throw new BizError('该站点不在你的数据权限范围内');
  }

  /** 字段格式校验（create 校验全量、update 校验合并后的生效值）。 */
  private validateFields(d: { mobile?: unknown; hired_at?: unknown; left_at?: unknown }): void {
    const mobile = str(d.mobile);
    if (mobile && !MOBILE_RE.test(mobile)) throw new BizError('手机号格式不正确（5-20 位数字/+/-/空格）');
    const hired = str(d.hired_at);
    const left = str(d.left_at);
    if (hired && !isYmd(hired)) throw new BizError('入职日期格式须为有效日期 YYYY-MM-DD');
    if (left && !isYmd(left)) throw new BizError('离职日期格式须为有效日期 YYYY-MM-DD');
    if (hired && left && left < hired) throw new BizError('离职日期不能早于入职日期');
  }

  /** ============ 花名册 CRUD ============ */

  async list(opts: {
    keyword?: string;
    team?: string;
    status?: string;
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
      where.push(`(name ILIKE $${i} OR knight_id ILIKE $${i} OR mobile ILIKE $${i} OR note ILIKE $${i})`);
    }
    const team = str(opts.team);
    if (team) {
      params.push(team);
      where.push(`team_id = $${params.length}`);
    }
    const status = str(opts.status);
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    // 数据权限下沉 SQL 层：team_id 为空（总部/不限站点）始终可见，其余须在可见集合内
    if (opts.allowed) {
      params.push([...opts.allowed]);
      where.push(`(team_id = '' OR team_id = ANY($${params.length}))`);
    }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const page = Math.max(1, Number(opts.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(opts.pageSize) || 50));
    params.push(pageSize);
    params.push((page - 1) * pageSize);

    const [rows, cntRow] = await Promise.all([
      this.pg.query(
        `SELECT * FROM rider_roster ${whereSql} ORDER BY status='active' DESC, team_name, name LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      ),
      this.pg.queryOne<{ cnt: string }>(
        `SELECT count(*)::text cnt FROM rider_roster ${whereSql}`,
        params.slice(0, params.length - 2),
      ),
    ]);
    return { ok: true, total: Number(cntRow?.cnt || 0), page, pageSize, rows: rows as RosterRow[] };
  }

  async create(data: Record<string, unknown>, actor: string, allowed: Set<string> | null = null) {
    this.assertReady();
    const name = str(data.name);
    if (!name) throw new BizError('姓名不能为空');
    this.validateFields(data);
    const knightId = str(data.knight_id);
    if (knightId) {
      const dup = await this.pg.queryOne('SELECT id FROM rider_roster WHERE knight_id = $1', [knightId]);
      if (dup) throw new BizError(`骑手ID ${knightId} 已存在于花名册（#${(dup as any).id}）`);
    }
    const teamId = str(data.team_id);
    this.assertTeamAllowed(teamId, allowed);
    const now = beijingNowStr();
    let id: number;
    try {
      const res = await this.pg.query(
        `INSERT INTO rider_roster
          (knight_id, name, mobile, team_id, team_name, work_type, status, hired_at, left_at, note, created_at, updated_at, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12) RETURNING id`,
        [
          // 空串入库会让 UNIQUE(knight_id) 挡住第二个「无骑手ID」的手工记录，空一律存 NULL
          knightId || null, name, str(data.mobile), teamId, this.resolveTeamName(teamId),
          str(data.work_type) || '全职', ROSTER_STATUSES.includes(str(data.status) as any) ? str(data.status) : 'active',
          str(data.hired_at), str(data.left_at), str(data.note), now, actor,
        ],
      );
      id = (res[0] as any).id;
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        throw new BizError(`骑手ID ${knightId} 已存在（或刚被其他操作占用），请刷新后重试`);
      }
      throw e;
    }
    await this.changes.record({ target_type: 'rider', target_id: id, target_name: name, change_type: 'create', operator: actor });
    return { ok: true, id };
  }

  /** 字段差异 → 异动记录（调店/转岗/状态变更/资料修改）。
   *  必须在主 UPDATE 成功之后调用（避免假账）；手机号审计脱敏。 */
  private async logDiffs(cur: RosterRow, patch: Record<string, unknown>, actor: string): Promise<void> {
    const fields = ['name', 'knight_id', 'mobile', 'team_id', 'work_type', 'status', 'hired_at', 'left_at', 'note'];
    for (const f of fields) {
      if (patch[f] === undefined) continue;
      const nv = str(patch[f]);
      const ov = str((cur as unknown as Record<string, unknown>)[f]);
      if (nv === ov) continue;
      const isTeam = f === 'team_id';
      const changeType = isTeam ? 'transfer' : (f === 'work_type' ? 'transfer_position' : (f === 'status' ? 'status' : 'edit'));
      await this.changes.record({
        target_type: 'rider', target_id: cur.id,
        target_name: f === 'name' ? nv : str(cur.name),
        change_type: changeType, field: f,
        old_value: isTeam ? `${ov}|${this.resolveTeamName(ov)}` : (f === 'mobile' ? maskMobile(ov) : ov),
        new_value: isTeam ? `${nv}|${this.resolveTeamName(nv)}` : (f === 'mobile' ? maskMobile(nv) : nv),
        operator: actor,
      });
    }
  }

  async update(id: number, patch: Record<string, unknown>, actor: string, allowed: Set<string> | null = null) {
    this.assertReady();
    const cur = await this.pg.queryOne<RosterRow>('SELECT * FROM rider_roster WHERE id = $1', [id]);
    if (!cur) throw new BizError(`花名册记录 #${id} 不存在`);
    this.assertTeamAllowed(cur.team_id, allowed);
    const sets: string[] = [];
    const params: unknown[] = [];
    const setField = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (patch.knight_id !== undefined) {
      const kid = str(patch.knight_id);
      if (kid) {
        const dup = await this.pg.queryOne('SELECT id FROM rider_roster WHERE knight_id = $1 AND id <> $2', [kid, id]);
        if (dup) throw new BizError(`骑手ID ${kid} 已被记录 #${(dup as any).id} 使用`);
      }
      setField('knight_id', kid || null);
    }
    if (patch.name !== undefined) {
      const name = str(patch.name);
      if (!name) throw new BizError('姓名不能为空');
      setField('name', name);
    }
    if (patch.mobile !== undefined) setField('mobile', str(patch.mobile));
    if (patch.team_id !== undefined) {
      const teamId = str(patch.team_id);
      this.assertTeamAllowed(teamId, allowed);
      setField('team_id', teamId);
      setField('team_name', this.resolveTeamName(teamId));
    }
    if (patch.work_type !== undefined) setField('work_type', str(patch.work_type) || '全职');
    if (patch.status !== undefined) {
      const st = str(patch.status);
      if (!ROSTER_STATUSES.includes(st as any)) throw new BizError(`未知状态：${st}`);
      setField('status', st);
    }
    if (patch.hired_at !== undefined) setField('hired_at', str(patch.hired_at));
    if (patch.left_at !== undefined) setField('left_at', str(patch.left_at));
    if (patch.note !== undefined) setField('note', str(patch.note));
    if (!sets.length) return { ok: true };
    // 校验用「生效值」（patch 未给的字段沿用现值）
    this.validateFields({
      mobile: patch.mobile !== undefined ? patch.mobile : cur.mobile,
      hired_at: patch.hired_at !== undefined ? patch.hired_at : cur.hired_at,
      left_at: patch.left_at !== undefined ? patch.left_at : cur.left_at,
    });
    params.push(beijingNowStr());
    sets.push(`updated_at = $${params.length}`);
    params.push(actor);
    sets.push(`updated_by = $${params.length}`);
    params.push(id);
    try {
      await this.pg.query(`UPDATE rider_roster SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        throw new BizError('骑手ID 已被其他记录使用，请刷新后重试');
      }
      throw e;
    }
    // 主更新成功后再记异动，保证审计与事实一致
    await this.logDiffs(cur, patch, actor);
    return { ok: true };
  }

  async remove(id: number, actor: string, allowed: Set<string> | null = null) {
    this.assertReady();
    const cur = await this.pg.queryOne<RosterRow>('SELECT * FROM rider_roster WHERE id = $1', [id]);
    if (!cur) throw new BizError(`花名册记录 #${id} 不存在`);
    this.assertTeamAllowed(cur.team_id, allowed);
    const res = await this.pg.query('DELETE FROM rider_roster WHERE id = $1 RETURNING id', [id]);
    if (!res.length) throw new BizError(`花名册记录 #${id} 不存在`);
    await this.changes.record({ target_type: 'rider', target_id: id, target_name: str(cur.name), change_type: 'delete', operator: actor });
    return { ok: true };
  }

  /**
   * 从考勤快照同步花名册（批量，单条 UPSERT 语句 + 内存锁）：
   *  · 快照里骑手（有 knightId 且有姓名）不在花名册 → 新增（状态=在职，记录 last_seen）
   *  · 已在花名册 → 刷新 姓名/手机号/站点（快照值优先，快照为空沿用现值）与 last_seen；状态不动（人管）
   *  · 当天无快照的站点（其他日期有）会记入 stale_teams 提示，避免「以为全量同步了」
   * 返回 {date, total, added, updated, stale_teams?}。
   */
  async syncFromSnapshot() {
    this.assertReady();
    if (this.syncing) throw new BizError('同步正在进行中，请稍后再试');
    this.syncing = true;
    try {
      const snap = this.listSnapshot();
      const date = snap.date;
      const now = beijingNowStr();
      // 无名骑手不入库（name NOT NULL 挡不住空串，必须在源头过滤）
      const rows = snap.rows.filter((r) => r.rider_id && r.rider_name);
      const existing = await this.pg.query<{ knight_id: string | null }>('SELECT knight_id FROM rider_roster');
      const known = new Set((existing || []).map((r) => String(r.knight_id || '')));
      let added = 0;
      let updated = 0;
      const ids: string[] = [];
      const names: string[] = [];
      const mobiles: string[] = [];
      const teamIds: string[] = [];
      const teamNames: string[] = [];
      const seens: string[] = [];
      for (const r of rows) {
        if (known.has(r.rider_id)) updated++;
        else added++;
        ids.push(r.rider_id);
        names.push(r.rider_name);
        mobiles.push(r.mobile);
        teamIds.push(r.team_id);
        teamNames.push(r.team_name);
        seens.push(date);
      }
      if (ids.length) {
        // 单条语句完成全部新增与更新（knight_id 有 UNIQUE 约束，ON CONFLICT 兜底并发）
        await this.pg.query(
          `INSERT INTO rider_roster
             (knight_id, name, mobile, team_id, team_name, work_type, status, last_seen, created_at, updated_at, updated_by)
           SELECT x.knight_id, x.name, x.mobile, x.team_id, x.team_name, '全职', 'active', x.seen, $1, $1, 'sync'
           FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[])
                AS x(knight_id, name, mobile, team_id, team_name, seen)
           ON CONFLICT (knight_id) DO UPDATE SET
             name      = COALESCE(NULLIF(EXCLUDED.name, ''), rider_roster.name),
             mobile    = COALESCE(NULLIF(EXCLUDED.mobile, ''), rider_roster.mobile),
             team_id   = COALESCE(NULLIF(EXCLUDED.team_id, ''), rider_roster.team_id),
             team_name = COALESCE(NULLIF(EXCLUDED.team_name, ''), rider_roster.team_name),
             last_seen = EXCLUDED.last_seen,
             updated_at = EXCLUDED.updated_at,
             updated_by = 'sync'`,
          [now, ids, names, mobiles, teamIds, teamNames, seens],
        );
      }
      const result: { ok: boolean; date: string; total: number; added: number; updated: number; stale_teams?: string[] } = {
        ok: true, date, total: rows.length, added, updated,
      };
      if (snap.staleTeams.length) result.stale_teams = snap.staleTeams.map((t: string) => this.resolveTeamName(t));
      return result;
    } finally {
      this.syncing = false;
    }
  }

  /** ============ 考勤快照读取（同步数据源，只读） ============ */

  private attFiles(): { team: string; date: string; file: string }[] {
    let names: string[] = [];
    try {
      names = fs.readdirSync(this.dataDir);
    } catch {
      return [];
    }
    const out: { team: string; date: string; file: string }[] = [];
    for (const n of names) {
      const m = ATT_RE.exec(n);
      if (m) out.push({ team: m[1], date: m[2], file: path.join(this.dataDir, n) });
    }
    return out;
  }

  /**
   * 最近有考勤数据的日期的合并名册（knightId 去重）。
   * 同时返回 stale_teams：有历史快照但当日缺档的站点（提示同步结果不完整）。
   */
  private listSnapshot() {
    const files = this.attFiles();
    const dates = [...new Set(files.map((f) => f.date))].sort();
    const usedDate = dates[dates.length - 1] || todayYmd();
    const picked = files.filter((f) => f.date === usedDate);
    // 站点级缺档检测：该站点有过快照，但选中日期没有 → 本次同步对它是不完整的
    const teamDates = new Map<string, Set<string>>();
    for (const f of files) {
      let s = teamDates.get(f.team);
      if (!s) teamDates.set(f.team, (s = new Set()));
      s.add(f.date);
    }
    const staleTeams = [...teamDates.entries()].filter(([, ds]) => !ds.has(usedDate)).map(([t]) => t);

    const teamNames = new Map<string, string>(
      readKnownTeams().map((t: TeamRef) => [String(t.id), t.name]),
    );
    const byId = new Map<string, Record<string, any>>();
    for (const f of picked) {
      try {
        const payload = JSON.parse(fs.readFileSync(f.file, 'utf-8'));
        const rows: any[] = Array.isArray(payload?.rows) ? payload.rows : [];
        for (const r of rows) {
          if (!r || typeof r !== 'object') continue;
          const kid = String(r.knightId ?? '').trim();
          if (!kid || byId.has(kid)) continue;
          byId.set(kid, r);
        }
      } catch (e) {
        this.logger.warn(`考勤快照读取失败 ${path.basename(f.file)}: ${(e as Error).message}`);
      }
    }
    const rows = [...byId.values()].map((r) => {
      const teamId = r.teamId == null ? '' : String(r.teamId);
      return {
        rider_id: String(r.knightId ?? ''),
        rider_name: String(r.knightName ?? '').trim(),
        mobile: r.mobile == null ? '' : String(r.mobile),
        team_id: teamId,
        team_name: teamId ? (teamNames.get(teamId) ?? teamId) : '',
      };
    });
    return { date: usedDate, rows, staleTeams };
  }
}
