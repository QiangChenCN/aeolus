import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PgService } from '../pg/pg.service';
import { PersonnelChangesService } from '../personnel/personnel-changes.service';
import { PositionService } from './position.service';
import { BizError } from '../../common/biz.error';
import { str, beijingNowStr, escapeLike, maskMobile, isYmd } from '../../common/format.util';

/**
 * 人员花名册（除骑手外的其他人员）持久层（PostgreSQL only）。
 *
 * 与骑手花名册（rider_roster）分表：骑手有 knightId / 考勤同步 / 最近出现等事实属性，
 * 内部人员有岗位 / RBAC 账号弱关联，字段与同步来源完全不同，合表只会互相污染。
 *
 * `username` 为弱关联字段：仅记录该人员对应的登录账号名，不外键、不级联——
 * 账号生命周期归「系统设置 → 权限管理」管，人事这里只做提示不自动操作。
 *
 * 数据权限口径：list/create/update/remove 都接受 `allowed`（可见站点 id 集合，
 * null = 不受限）——查询在 SQL 层过滤（含 count），写操作校验目标站点，
 * 避免「分页后内存过滤」导致的页空洞与 total 失真。
 */
const PG_DDL = `
CREATE TABLE IF NOT EXISTS staff_roster (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  mobile      TEXT DEFAULT '',
  team_id     TEXT DEFAULT '',
  team_name   TEXT DEFAULT '',
  position    TEXT DEFAULT '',
  username    TEXT DEFAULT '',
  id_card_last4 TEXT DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'active',
  hired_at    TEXT DEFAULT '',
  left_at     TEXT DEFAULT '',
  note        TEXT DEFAULT '',
  created_at  TEXT,
  updated_at  TEXT,
  updated_by  TEXT);
CREATE INDEX IF NOT EXISTS idx_staff_roster_team ON staff_roster(team_id);
CREATE INDEX IF NOT EXISTS idx_staff_roster_status ON staff_roster(status);
`;
/** 兼容既有部署：幂等补列，并清理已废弃的通知扩展列（钉钉ID 由取数基座缓存承接，花名册不存）。 */
const PG_MIGRATE = `
ALTER TABLE staff_roster ADD COLUMN IF NOT EXISTS id_card_last4 TEXT DEFAULT '';
ALTER TABLE staff_roster DROP COLUMN IF EXISTS dingtalk_userid;`;

export const STAFF_STATUSES = ['active', 'quit', 'suspended'] as const;

export interface StaffRow {
  id: number;
  name: string;
  mobile: string;
  team_id: string;
  team_name: string;
  position: string;
  username: string;
  id_card_last4: string;
  status: string;
  hired_at: string;
  left_at: string;
  note: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
}

const MOBILE_RE = /^[0-9+\-\s]{5,20}$/;
const ID4_RE = /^[0-9Xx]{4}$/;


@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);
  private tableReady = false;

  constructor(
    private readonly pg: PgService,
    private readonly changes: PersonnelChangesService,
    private readonly positions: PositionService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.pg.query(PG_DDL);
      await this.pg.query(PG_MIGRATE);
      this.tableReady = true;
    } catch (e) {
      this.logger.warn(`staff_roster 建表失败（人员花名册不可用）：${(e as Error).message}`);
    }
  }

  private assertReady(): void {
    if (!this.tableReady) throw new Error('人员花名册存储不可用（PostgreSQL 未配置或建表失败）');
  }

  /** 站点名解析：team_id → 已知站点名（未知时回退 id）。空 team_id 表示「不限站点/总部」。 */
  private resolveTeamName(teamId: string, known: { id: string; name: string }[]): string {
    if (!teamId) return '';
    const t = known.find((x) => String(x.id) === String(teamId));
    return t ? t.name : teamId;
  }

  /** 数据权限校验：目标站点必须在可见集合内（空站点=总部，不受限）。 */
  private assertTeamAllowed(teamId: string, allowed: Set<string> | null): void {
    if (!allowed || !teamId) return;
    if (!allowed.has(String(teamId))) throw new BizError('该站点不在你的数据权限范围内');
  }

  /** 字段格式校验（create 校验全量、update 校验合并后的生效值）。 */
  private validateFields(d: {
    mobile?: unknown;
    id_card_last4?: unknown;
    hired_at?: unknown;
    left_at?: unknown;
  }): void {
    const mobile = str(d.mobile);
    if (mobile && !MOBILE_RE.test(mobile)) throw new BizError('手机号格式不正确（5-20 位数字/+/-/空格）');
    const id4 = str(d.id_card_last4);
    if (id4 && !ID4_RE.test(id4)) throw new BizError('证件尾号须为 4 位数字或 X');
    const hired = str(d.hired_at);
    const left = str(d.left_at);
    if (hired && !isYmd(hired)) throw new BizError('入职日期格式须为有效日期 YYYY-MM-DD');
    if (left && !isYmd(left)) throw new BizError('离职日期格式须为有效日期 YYYY-MM-DD');
    if (hired && left && left < hired) throw new BizError('离职日期不能早于入职日期');
  }

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
      where.push(`(name ILIKE $${i} OR mobile ILIKE $${i} OR position ILIKE $${i} OR username ILIKE $${i} OR note ILIKE $${i})`);
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
    const pageSize = Math.min(500, Math.max(1, Number(opts.pageSize) || 50));
    params.push(pageSize);
    params.push((page - 1) * pageSize);

    const [rows, cntRow] = await Promise.all([
      this.pg.query(
        `SELECT * FROM staff_roster ${whereSql} ORDER BY status='active' DESC, team_name, name LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      ),
      this.pg.queryOne<{ cnt: string }>(
        `SELECT count(*)::text cnt FROM staff_roster ${whereSql}`,
        params.slice(0, params.length - 2),
      ),
    ]);
    return { ok: true, total: Number(cntRow?.cnt || 0), page, pageSize, rows: rows as StaffRow[] };
  }

  async create(
    data: Record<string, unknown>,
    teams: { id: string; name: string }[],
    actor: string,
    allowed: Set<string> | null = null,
  ) {
    this.assertReady();
    const name = str(data.name);
    if (!name) throw new BizError('姓名不能为空');
    this.validateFields(data);
    const teamId = str(data.team_id);
    this.assertTeamAllowed(teamId, allowed);
    const position = str(data.position).trim(); // 岗位写入前规范化：去首尾空白
    const now = beijingNowStr();
    let id: number;
    try {
      const res = await this.pg.query(
        `INSERT INTO staff_roster
          (name, mobile, team_id, team_name, position, username, id_card_last4, status, hired_at, left_at, note, created_at, updated_at, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13) RETURNING id`,
        [
          name, str(data.mobile), teamId, this.resolveTeamName(teamId, teams),
          position, str(data.username), str(data.id_card_last4),
          STAFF_STATUSES.includes(str(data.status) as any) ? str(data.status) : 'active',
          str(data.hired_at), str(data.left_at), str(data.note),
          now, actor,
        ],
      );
      id = (res[0] as any).id;
    } catch (e) {
      throw this.wrapPgError(e);
    }
    await this.changes.record({ target_type: 'staff', target_id: id, target_name: name, change_type: 'create', operator: actor });
    const autoRegistered = await this.positions.autoRegisterFromStaff(position, actor);
    return { ok: true, id, autoRegistered: autoRegistered || undefined };
  }

  /** 字段差异 → 异动记录（调店/转岗/状态变更/资料修改）。
   *  注意：必须在主 UPDATE 成功之后调用，避免「更新失败但异动已落库」的假账；
   *  手机号/证件尾号在审计中脱敏，避免敏感信息明文扩散到审计表。 */
  private async logDiffs(
    cur: StaffRow,
    patch: Record<string, unknown>,
    teams: { id: string; name: string }[],
    actor: string,
  ): Promise<void> {
    const fields = ['name', 'mobile', 'team_id', 'position', 'username', 'id_card_last4', 'status', 'hired_at', 'left_at', 'note'];
    for (const f of fields) {
      if (patch[f] === undefined) continue;
      const nv = str(patch[f]);
      const ov = str((cur as unknown as Record<string, unknown>)[f]);
      if (nv === ov) continue;
      const isTeam = f === 'team_id';
      const changeType = isTeam ? 'transfer' : (f === 'position' ? 'transfer_position' : (f === 'status' ? 'status' : 'edit'));
      const audit = (v: string) => (f === 'mobile' ? maskMobile(v) : f === 'id_card_last4' && v ? '****' : v);
      await this.changes.record({
        target_type: 'staff', target_id: cur.id,
        target_name: f === 'name' ? nv : str(cur.name),
        change_type: changeType, field: f,
        old_value: isTeam ? `${ov}|${this.resolveTeamName(ov, teams)}` : audit(ov),
        new_value: isTeam ? `${nv}|${this.resolveTeamName(nv, teams)}` : audit(nv),
        operator: actor,
      });
    }
  }

  async update(
    id: number,
    patch: Record<string, unknown>,
    teams: { id: string; name: string }[],
    actor: string,
    allowed: Set<string> | null = null,
  ) {
    this.assertReady();
    const cur = await this.pg.queryOne<StaffRow>('SELECT * FROM staff_roster WHERE id = $1', [id]);
    if (!cur) throw new BizError(`人员记录 #${id} 不存在`);
    this.assertTeamAllowed(cur.team_id, allowed);
    const sets: string[] = [];
    const params: unknown[] = [];
    const setField = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
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
      setField('team_name', this.resolveTeamName(teamId, teams));
    }
    if (patch.position !== undefined) setField('position', str(patch.position).trim());
    if (patch.username !== undefined) setField('username', str(patch.username));
    if (patch.id_card_last4 !== undefined) setField('id_card_last4', str(patch.id_card_last4));
    if (patch.status !== undefined) {
      const st = str(patch.status);
      if (!STAFF_STATUSES.includes(st as any)) throw new BizError(`未知状态：${st}`);
      setField('status', st);
    }
    if (patch.hired_at !== undefined) setField('hired_at', str(patch.hired_at));
    if (patch.left_at !== undefined) setField('left_at', str(patch.left_at));
    if (patch.note !== undefined) setField('note', str(patch.note));
    if (!sets.length) return { ok: true };
    // 校验用「生效值」（patch 未给的字段沿用现值），避免只改 left_at 时 hired_at 校验被跳过
    this.validateFields({
      mobile: patch.mobile !== undefined ? patch.mobile : cur.mobile,
      id_card_last4: patch.id_card_last4 !== undefined ? patch.id_card_last4 : cur.id_card_last4,
      hired_at: patch.hired_at !== undefined ? patch.hired_at : cur.hired_at,
      left_at: patch.left_at !== undefined ? patch.left_at : cur.left_at,
    });
    params.push(beijingNowStr());
    sets.push(`updated_at = $${params.length}`);
    params.push(actor);
    sets.push(`updated_by = $${params.length}`);
    params.push(id);
    try {
      await this.pg.query(`UPDATE staff_roster SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    } catch (e) {
      throw this.wrapPgError(e);
    }
    // 主更新成功后再记异动，保证审计与事实一致
    await this.logDiffs(cur, patch, teams, actor);
    const autoRegistered = patch.position !== undefined
      ? await this.positions.autoRegisterFromStaff(str(patch.position).trim(), actor)
      : '';
    return { ok: true, autoRegistered: autoRegistered || undefined };
  }

  async remove(id: number, actor: string, allowed: Set<string> | null = null) {
    this.assertReady();
    const cur = await this.pg.queryOne<StaffRow>('SELECT * FROM staff_roster WHERE id = $1', [id]);
    if (!cur) throw new BizError(`人员记录 #${id} 不存在`);
    this.assertTeamAllowed(cur.team_id, allowed);
    const res = await this.pg.query('DELETE FROM staff_roster WHERE id = $1 RETURNING id', [id]);
    if (!res.length) throw new BizError(`人员记录 #${id} 不存在`);
    await this.changes.record({ target_type: 'staff', target_id: id, target_name: str(cur.name), change_type: 'delete', operator: actor });
    return { ok: true };
  }

  /** PG 约束错误 → 友好业务提示（其余原样抛出）。 */
  private wrapPgError(e: unknown): Error {
    const err = e as { code?: string; message?: string };
    if (err?.code === '23505') return new BizError('唯一字段冲突：该记录的姓名/账号等已存在或刚被修改');
    return e as Error;
  }
}
