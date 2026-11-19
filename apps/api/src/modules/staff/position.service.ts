import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PgService } from '../pg/pg.service';
import { PersonnelChangesService } from '../personnel/personnel-changes.service';
import { BizError } from '../../common/biz.error';
import { str, beijingNowStr } from '../../common/format.util';

/**
 * 岗位字典（人事管理子模块）：统一人员花名册「岗位」字段的取值口径。
 *
 * 定位与边界（评估结论落地）：
 *  · staff_roster.position 仍是岗位事实的**唯一存储**（弱约束：不外键、不校验存在性），
 *    字典只做 UI 收敛（下拉选项 / 排序 / 启停），历史自由文本值合法保留；
 *  · 字典外但仍在职使用的岗位以「未登记」形态出现在列表中，可一键登记；
 *  · 重命名走**显式级联**（rename）：更新花名册 + 逐人落「岗位调整」异动 + 同步字典，
 *    不做隐式触发器，审计路径与人员编辑完全一致；
 *  · 删除受保护：仍有在职人员使用的岗位禁止删除（提示改用重命名转移）；
 *  · 骑手的 work_type（用工性质）不属于岗位，本服务不涉骑手数据；
 *  · 通知路由（站点 → 负责人）归 station-managers，本服务不感知钉钉。
 *
 * 数据权限口径：统计与 rename 的花名册侧变更均按 `allowed`（可见站点集合，
 * null = 不受限）在 SQL 层过滤（team_id 为空 = 总部，始终可见）；
 * rename 对越权站点的同名岗位返回 skipped 计数而非整体失败，避免静默半改名。
 * 注意：字典元数据的增删改是全局动作，不做站点级切分（岗位名是全局口径）。
 */
const PG_DDL = `
CREATE TABLE IF NOT EXISTS position_dict (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  sort       INTEGER NOT NULL DEFAULT 0,
  note       TEXT DEFAULT '',
  enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by TEXT DEFAULT '',
  created_at TEXT,
  updated_at TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_position_dict_name ON position_dict(name);
`;

/** 未登记岗位的排序占位（压到已登记岗位之后，列表尾部按名称排）。 */
const UNREGISTERED_SORT = 1_000_000;

export interface PositionDictRow {
  id: number;
  name: string;
  sort: number;
  note: string;
  enabled: boolean;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface PositionListRow {
  id: number | null;
  name: string;
  sort: number;
  note: string;
  enabled: boolean;
  registered: boolean;
  active_count: number;
  teams: { id: string; count: number }[];
  updated_at: string;
}

@Injectable()
export class PositionService {
  private readonly logger = new Logger(PositionService.name);
  private tableReady = false;

  constructor(private readonly pg: PgService, private readonly changes: PersonnelChangesService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.pg.query(PG_DDL);
      this.tableReady = true;
    } catch (e) {
      this.logger.warn(`position_dict 建表失败（岗位字典不可用）：${(e as Error).message}`);
    }
  }

  private assertReady(): void {
    if (!this.tableReady) throw new Error('岗位字典存储不可用（PostgreSQL 未配置或建表失败）');
  }

  private validateName(name: string): void {
    if (!name) throw new BizError('岗位名不能为空');
    if (name.length > 50) throw new BizError('岗位名过长（≤50 字）');
  }

  /**
   * 岗位列表 = 字典全量 + 花名册在职使用聚合（按数据权限过滤）。
   * 未登记岗位（花名册在用但字典缺失）一并返回，registered=false。
   * 团队名由前端用站点目录映射（服务层不依赖 TeamsFetchService）。
   */
  async list(allowed: Set<string> | null = null) {
    this.assertReady();
    const params: unknown[] = [];
    let scopeSql = '';
    if (allowed) {
      params.push([...allowed]);
      scopeSql = ` AND (team_id = '' OR team_id = ANY($${params.length}))`;
    }
    const [dict, stats] = await Promise.all([
      this.pg.query<PositionDictRow>('SELECT * FROM position_dict ORDER BY sort, id'),
      this.pg.query<{ position: string; team_id: string; cnt: number }>(
        `SELECT position, team_id, count(*)::int cnt FROM staff_roster
          WHERE status = 'active' AND position <> ''${scopeSql} GROUP BY position, team_id`,
        params,
      ),
    ]);
    const byName = new Map<string, { count: number; teams: { id: string; count: number }[] }>();
    for (const s of stats) {
      const name = String(s.position);
      const e = byName.get(name) || { count: 0, teams: [] };
      e.count += Number(s.cnt);
      e.teams.push({ id: String(s.team_id), count: Number(s.cnt) });
      byName.set(name, e);
    }
    const rows: PositionListRow[] = dict.map((d) => {
      const u = byName.get(d.name);
      byName.delete(d.name); // 剩余的即未登记岗位
      return {
        id: d.id, name: d.name, sort: d.sort, note: d.note || '',
        enabled: Boolean(d.enabled), registered: true,
        active_count: u?.count || 0, teams: u?.teams || [],
        updated_at: d.updated_at || '',
      };
    });
    for (const [name, u] of byName) {
      rows.push({
        id: null, name, sort: UNREGISTERED_SORT, note: '', enabled: true,
        registered: false, active_count: u.count, teams: u.teams, updated_at: '',
      });
    }
    rows.sort((a, b) =>
      (a.registered ? a.sort : UNREGISTERED_SORT) - (b.registered ? b.sort : UNREGISTERED_SORT)
      || a.name.localeCompare(b.name, 'zh'));
    return { ok: true, rows };
  }

  /**
   * 人员保存链路的岗位规范化与自动登记（弱约束下的轻量收敛）：
   *  · trim + 精确去重：只对字典里完全不存在的名字执行登记；
   *  · 停用的岗位已存在 → 原样保留其 enabled=false，绝不自动激活（管理员的停用决定优先）；
   *  · 登记失败（重名竞态 / 字典不可用）不阻断人员保存——岗位事实以 staff_roster.position 为准。
   * 返回实际写入字典的岗位名（未写返回空），供调用方在响应中提示。
   */
  async autoRegisterFromStaff(position: string, actor: string): Promise<string> {
    const name = String(position || '').trim();
    if (!name) return '';
    try {
      const exist = await this.pg.queryOne<PositionDictRow>('SELECT * FROM position_dict WHERE name = $1', [name]);
      if (exist) return ''; // 含已停用：保留原状态，不自动激活
      this.validateName(name);
      const now = beijingNowStr();
      await this.pg.query(
        `INSERT INTO position_dict (name, sort, note, enabled, updated_by, created_at, updated_at)
         VALUES ($1, 0, '', TRUE, $2, $3, $3)
         ON CONFLICT (name) DO NOTHING`,
        [name, actor, now],
      );
      return name;
    } catch (e) {
      this.logger.warn(`岗位「${name}」自动登记跳过：${(e as Error).message}`);
      return '';
    }
  }

  /** 登记岗位（字典新增）。重名拒绝——登记是显式动作，不静默去重。 */
  async add(data: Record<string, unknown>, actor: string) {
    this.assertReady();
    const name = str(data.name).trim();
    this.validateName(name);
    const sort = Number(data.sort);
    const now = beijingNowStr();
    try {
      await this.pg.query(
        `INSERT INTO position_dict (name, sort, note, enabled, updated_by, created_at, updated_at)
         VALUES ($1,$2,$3,TRUE,$4,$5,$5)`,
        [name, Number.isFinite(sort) ? Math.min(99999, Math.max(0, Math.trunc(sort))) : 0, str(data.note), actor, now],
      );
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw new BizError(`岗位「${name}」已登记`);
      throw e;
    }
    return { ok: true };
  }

  /** 更新字典元数据（排序 / 备注 / 启停）。岗位名不可在此改，改名走 rename 级联。 */
  async updateMeta(data: Record<string, unknown>, actor: string) {
    this.assertReady();
    const id = Number(data.id);
    if (!Number.isFinite(id) || id <= 0) throw new BizError('缺少有效的 id');
    const cur = await this.pg.queryOne<PositionDictRow>('SELECT * FROM position_dict WHERE id = $1', [id]);
    if (!cur) throw new BizError(`岗位 #${id} 不存在（可能刚被删除）`);
    const sets: string[] = [];
    const params: unknown[] = [];
    const setField = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (data.sort !== undefined) {
      const sort = Number(data.sort);
      if (!Number.isFinite(sort) || sort < 0 || sort > 99999) throw new BizError('排序须为 0-99999 的整数');
      setField('sort', Math.trunc(sort));
    }
    if (data.note !== undefined) setField('note', str(data.note));
    if (data.enabled !== undefined) {
      const en = data.enabled === true || data.enabled === 'true';
      const dis = data.enabled === false || data.enabled === 'false';
      if (!en && !dis) throw new BizError('enabled 须为布尔值');
      setField('enabled', en);
    }
    if (!sets.length) return { ok: true };
    setField('updated_at', beijingNowStr());
    setField('updated_by', actor);
    await this.pg.query(`UPDATE position_dict SET ${sets.join(', ')} WHERE id = $${params.length + 1}`, [...params, id]);
    return { ok: true };
  }

  /**
   * 删除字典条目。保护规则：仍有**在职人员**使用时拒绝（历史离职人员的岗位值
   * 不阻断删除）；花名册数据不受删除影响（弱约束设计的兜底语义）。
   */
  async remove(id: number) {
    this.assertReady();
    const cur = await this.pg.queryOne<PositionDictRow>('SELECT * FROM position_dict WHERE id = $1', [id]);
    if (!cur) throw new BizError(`岗位 #${id} 不存在（可能刚被删除）`);
    const used = await this.pg.queryOne<{ cnt: number }>(
      `SELECT count(*)::int cnt FROM staff_roster WHERE status = 'active' AND position = $1`, [cur.name],
    );
    const n = Number(used?.cnt || 0);
    if (n > 0) {
      throw new BizError(`岗位「${cur.name}」仍有 ${n} 名在职人员使用，请改用「重命名」转移，或先在人员管理中调整这些人员的岗位`);
    }
    await this.pg.query('DELETE FROM position_dict WHERE id = $1', [id]);
    return { ok: true };
  }

  /**
   * 岗位重命名（级联）：花名册全量改名（含离职记录，保证历史口径一致）→
   * 逐人落「岗位调整」异动 → 字典同步（from/to 都在字典时合并；to 缺失时自动登记）。
   * 数据权限：只改可见站点内的记录，越权部分以 skipped 计数返回。
   */
  async rename(
    data: Record<string, unknown>,
    actor: string,
    allowed: Set<string> | null = null,
  ) {
    this.assertReady();
    const from = str(data.from).trim();
    const to = str(data.to).trim();
    this.validateName(from);
    this.validateName(to);
    if (from === to) throw new BizError('新岗位名与原岗位名相同');
    const now = beijingNowStr();
    const note = str(data.note) || '岗位重命名';

    // 花名册级联改名：RETURNING 拿到实际改动的行（原子），再据此落异动，杜绝假账
    const params: unknown[] = [to, now, actor, from];
    let scopeSql = '';
    if (allowed) {
      params.push([...allowed]);
      scopeSql = ` AND (team_id = '' OR team_id = ANY($${params.length}))`;
    }
    const [updated, totalRow] = await Promise.all([
      this.pg.query<{ id: number; name: string }>(
        `UPDATE staff_roster SET position = $1, updated_at = $2, updated_by = $3
          WHERE position = $4${scopeSql} RETURNING id, name`,
        params,
      ),
      this.pg.queryOne<{ cnt: number }>('SELECT count(*)::int cnt FROM staff_roster WHERE position = $1', [from]),
    ]);
    const changed = updated.length;
    const skipped = Math.max(0, Number(totalRow?.cnt || 0) - changed);
    if (changed) {
      await Promise.all(updated.map((r) => this.changes.record({
        target_type: 'staff', target_id: r.id, target_name: r.name,
        change_type: 'transfer_position', field: 'position',
        old_value: from, new_value: to, note, operator: actor,
      })));
    }

    // 字典同步：from 存在 → 改名或并入 to；from 不存在且 to 也未登记 → 自动登记 to
    const dictRows = await this.pg.query<{ name: string }>(
      'SELECT name FROM position_dict WHERE name = ANY($1)', [[from, to]],
    );
    const hasFrom = dictRows.some((d) => d.name === from);
    const hasTo = dictRows.some((d) => d.name === to);
    let registered = false;
    if (hasFrom && hasTo) {
      await this.pg.query('DELETE FROM position_dict WHERE name = $1', [from]); // 合并进 to
    } else if (hasFrom) {
      await this.pg.query(
        'UPDATE position_dict SET name = $1, updated_at = $2, updated_by = $3 WHERE name = $4',
        [to, now, actor, from],
      );
    } else if (!hasTo) {
      await this.pg.query(
        `INSERT INTO position_dict (name, sort, note, enabled, updated_by, created_at, updated_at)
         VALUES ($1, 100000, '岗位重命名时自动登记', TRUE, $2, $3, $3)
         ON CONFLICT (name) DO NOTHING`,
        [to, actor, now],
      );
      registered = true;
    }
    return { ok: true, changed, skipped, registered, to };
  }
}
