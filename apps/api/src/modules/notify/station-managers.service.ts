import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { StationManagersCfg } from './notify-config';
import { DingtalkIdBaseService, ResolvedNames } from '../dingtalk-id/dingtalk-id-base.service';
import { PgService } from '../pg/pg.service';

export type { ResolvedNames };

/** 一致性巡检报告（路由姓名字符串 vs 人员花名册的**客观事实**比对，无岗位语义判定）。 */
export interface ManagersConsistency {
  /** 配置引用但花名册查无此人的姓名（拼写不一致或花名册缺人，任务将无法 @ 到） */
  unknown: string[];
  /** 花名册中已离职/停用但仍被配置引用的姓名 */
  inactive: { name: string; status: string }[];
  /** 未配置任何负责人的站点展示名 */
  no_manager: string[];
}

/**
 * 站点负责人映射的**唯一**运行时存储：由组织架构页维护，
 * 落盘 `apps/api/runtime/station_managers.json`（gitignored 运行时产物）。保存后立即热生效，无需重启。
 *
 * 存在意义：实时在线播报 / 申诉提醒 / 装备点亮等任务需要「按站点 @ 对应负责人」，
 * 而站点负责人会随人事变动更换——不允许再改代码常量。
 *
 * **职责分离**：本服务只负责「站点 → 负责人姓名」映射；
 * 姓名 → openDingTalkId 的解析全部由「钉钉ID 取数基座」（DingtalkIdBaseService）承担，
 * 由任务管线在发送前直接调用基座：
 *  · 解析缓存 → 通讯录搜索（同名手机号消歧，花名册手机号辅助）；
 *  · 解析成功自动落缓存（不写花名册）。
 * 未配置/解析不到就不 @（任务日志告警）。
 *
 * 站点映射同理：station_managers.json 是唯一事实来源，不存在时所有站点都视为未配置。
 */
@Injectable()
export class StationManagersService {
  private readonly logger = new Logger(StationManagersService.name);
  private readonly file: string;

  constructor(
    private readonly config: ConfigService,
    private readonly dingtalkIds: DingtalkIdBaseService,
    private readonly pg: PgService,
  ) {
    const root = path.resolve(
      config.get<string>('PROJECT_ROOT') || path.resolve(process.cwd(), '..'),
    );
    this.file = path.join(root, 'apps', 'api', 'runtime', 'station_managers.json');
  }

  // ── UI 配置文件（station_managers.json）──

  private readFile(): StationManagersCfg | null {
    try {
      const d = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
      if (!d || typeof d !== 'object') return null;
      if (!Array.isArray(d.stations)) return null;
      if (!Array.isArray(d.managers)) d.managers = [];
      return d as StationManagersCfg;
    } catch {
      return null;
    }
  }

  private writeFile(cfg: StationManagersCfg): void {
    const tmp = `${this.file}.tmp`;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmp, this.file);
    try {
      fs.chmodSync(this.file, 0o600);
    } catch {
      /* 权限微调失败不影响写入 */
    }
  }

  /** UI 配置文件是否已存在（true = 已保存过；false = 走硬编码默认）。 */
  isConfigured(): boolean {
    return this.readFile() != null;
  }

  /** 生效配置（UI 展示用）：文件存在则原样返回，否则空配置（无内置默认值）。 */
  read(): StationManagersCfg {
    return this.readFile() || { managers: [], stations: [] };
  }

  // ── 站点 → 负责人姓名 ──

  /**
   * 站点名/团队名 -> 负责人姓名列表。
   * 仅依据 UI 配置文件，按 站点简称 / 站点名称(全称) / 站点ID / teams 别名 精确匹配；
   * 匹配不到或文件不存在都返回空（无内置兜底，由调用方告警）。
   */
  managersForTeam(team: string): string[] {
    const t = (team || '').trim();
    if (!t) return [];
    const cfg = this.readFile();
    if (!cfg) return [];
    for (const s of cfg.stations) {
      if (
        s.name === t ||
        (s.station_name && s.station_name === t) ||
        (s.station_id && s.station_id === t) ||
        (s.teams || []).includes(t)
      ) {
        return [...(s.managers || [])];
      }
    }
    return [];
  }

  /** 立即解析：把配置里引用到的全部负责人姓名都跑一遍自动解析（UI「一键解析」用）。 */
  async resolveAll(): Promise<ResolvedNames & { group: string }> {
    const cfg = this.readFile() || { managers: [], stations: [] };
    const names = new Set<string>();
    for (const s of cfg.stations) for (const m of s.managers) names.add(m);
    for (const m of cfg.managers) names.add(m.name);
    // 姓名解析委托钉钉ID 取数基座（本服务只收集映射里引用到的姓名）
    const r = await this.dingtalkIds.resolveNamesAuto([...names]);
    return { ...r, group: '通讯录' };
  }

  /** 全量 @ 名单（UI 配置的负责人去重），供「一个站点都没匹配到负责人」时兜底。 */
  allManagerIds(): string[] {
    const cfg = this.readFile();
    const ids: string[] = [];
    if (!cfg) return ids;
    for (const m of cfg.managers) {
      if (!m.open_id || ids.includes(m.open_id)) continue;
      ids.push(m.open_id);
    }
    return ids;
  }

  // ── 一致性巡检（双事实来源风险点的对冲） ──

  /**
   * 路由配置姓名 vs 人员花名册的客观比对：查无此人 / 已离职停用 / 站点无负责人。
   * 只报事实不做岗位语义判定（「这个人是不是站长」归岗位字典/人事口径）；
   * 花名册不可用时返回空报告（巡检是辅助展示，绝不阻塞路由功能与任务发送）。
   */
  async consistency(): Promise<ManagersConsistency> {
    const out: ManagersConsistency = { unknown: [], inactive: [], no_manager: [] };
    const cfg = this.read();
    out.no_manager = cfg.stations
      .filter((s) => !(s.managers || []).length)
      .map((s) => s.name || s.station_name || s.station_id || '(未命名站点)');
    const names = new Set<string>();
    for (const s of cfg.stations) for (const m of s.managers || []) if (m.trim()) names.add(m.trim());
    for (const m of cfg.managers || []) if (m.name?.trim()) names.add(m.name.trim());
    if (!names.size) return out;
    let rows: { name: string; status: string }[] = [];
    try {
      rows = await this.pg.query<{ name: string; status: string }>(
        'SELECT name, status FROM staff_roster WHERE name = ANY($1)',
        [[...names]],
      );
    } catch (e) {
      this.logger.warn(`负责人一致性巡检跳过（花名册不可用）：${(e as Error).message.slice(0, 120)}`);
      return { unknown: [], inactive: [], no_manager: out.no_manager };
    }
    const byName = new Map(rows.map((r) => [String(r.name), String(r.status)]));
    for (const n of names) {
      const st = byName.get(n);
      if (!st) out.unknown.push(n);
      else if (st !== 'active') out.inactive.push({ name: n, status: st });
    }
    return out;
  }

  // ── UI 读写 ──

  /** UI 展示快照：站点映射 + 自动解析缓存（含来源标注）。未保存过配置时展示**空列表**，由用户手动添加。 */
  get(): {
    ok: boolean;
    configured: boolean;
    source: 'file' | 'defaults';
    cache_group: string;
    cache_updated_at: string;
    cache: { name: string; open_id: string }[];
  } & StationManagersCfg {
    const cfg = this.isConfigured() ? this.read() : { managers: [], stations: [] };
    const cache = this.dingtalkIds.cacheSnapshot(); // 解析缓存由取数基座持有
    return {
      ok: true,
      configured: this.isConfigured(),
      source: this.isConfigured() ? 'file' : 'defaults',
      cache_group: cache.group,
      cache_updated_at: cache.updated_at,
      cache: Object.entries(cache.ids).map(([name, open_id]) => ({ name, open_id })),
      managers: cfg.managers,
      stations: cfg.stations,
    };
  }

  /**
   * 保存（整体覆盖 stations；managers 可选：不传则沿用现有值）。
   * 钉钉ID 不在保存时解析——由取数基座在任务发送时统一解析（只落解析缓存）。
   */
  async save(
    input: Record<string, unknown>,
  ): Promise<{ ok: boolean; error?: string; warning?: string; missing?: string[]; consistency?: ManagersConsistency } & ReturnType<StationManagersService['get']>> {
    const stationsRaw = Array.isArray(input?.stations) ? input.stations : null;
    if (!stationsRaw) {
      return { ...this.get(), ok: false, error: 'stations 必须是数组' };
    }

    // managers：显式传了才覆盖（一般只有旧数据迁移/手动修正才用）
    const managersRaw = Array.isArray(input?.managers) ? input.managers : null;
    const existing = this.readFile();
    const nameSet = new Set<string>();
    const oidSet = new Set<string>();
    const managers: { name: string; mobile?: string; title?: string; open_id: string }[] = [];
    for (const m of managersRaw || existing?.managers || []) {
      const name = typeof m?.name === 'string' ? m.name.trim() : '';
      const mobile = typeof m?.mobile === 'string' ? m.mobile.trim() : '';
      const title = typeof m?.title === 'string' ? m.title.trim() : '';
      const openId = typeof m?.open_id === 'string' ? m.open_id.trim() : '';
      if (!name) continue; // 只填姓名即可，openDingTalkId 留空由自动解析补齐
      if (nameSet.has(name)) return { ...this.get(), ok: false, error: `负责人姓名重复：${name}` };
      if (openId) {
        if (oidSet.has(openId)) {
          return { ...this.get(), ok: false, error: `openDingTalkId 重复（${name} 与已有人员共用同一 ID）` };
        }
        oidSet.add(openId);
      }
      nameSet.add(name);
      managers.push({
        name,
        ...(mobile ? { mobile } : {}),
        ...(title ? { title } : {}),
        open_id: openId,
      });
    }

    const stationSeen = new Set<string>();
    const stations: { station_id?: string; station_name?: string; name: string; address?: string; teams: string[]; managers: string[] }[] = [];
    for (const s of stationsRaw) {
      const stationId = typeof s?.station_id === 'string' ? s.station_id.trim() : '';
      const stationName = typeof s?.station_name === 'string' ? s.station_name.trim() : '';
      const name = typeof s?.name === 'string' ? s.name.trim() : '';
      const address = typeof s?.address === 'string' ? s.address.trim() : '';
      const teams = Array.isArray(s?.teams)
        ? s.teams.map((t: unknown) => String(t || '').trim()).filter(Boolean)
        : [];
      const ms = Array.isArray(s?.managers)
        ? s.managers.map((x: unknown) => String(x || '').trim()).filter(Boolean)
        : [];
      if (!name && !stationName && !stationId && !teams.length && !ms.length) continue; // 空行跳过
      if (!name && !stationName) return { ...this.get(), ok: false, error: '站点简称/站点名称至少填一个' };
      // 判重键 = 简称优先、全称兜底（两行都留空简称只填全称时，按全称判重而不是空串误报）
      const dedupeKey = name || stationName;
      if (stationSeen.has(dedupeKey)) return { ...this.get(), ok: false, error: `站点重复：${dedupeKey}` };
      stationSeen.add(dedupeKey);
      // 站点名称并入 teams，兼容仅按全称匹配的任务数据（ teams 仍保留以兼容旧文件）
      const allTeams = Array.from(new Set([...teams, ...(stationName ? [stationName] : [])]));
      stations.push({
        ...(stationId ? { station_id: stationId } : {}),
        ...(stationName ? { station_name: stationName } : {}),
        name,
        ...(address ? { address } : {}),
        teams: allTeams,
        managers: Array.from(new Set(ms)) as string[],
      });
    }

    const next: StationManagersCfg = { managers, stations };
    this.writeFile(next);
    this.logger.log(`站点负责人配置已通过 UI 保存（站点 ${stations.length} 个，显式 ID ${managers.length} 条）`);
    const warning = stations.some((s) => !s.managers.length)
      ? '有站点未配置任何负责人：该站点有未上线骑手时将无法 @ 到人（任务日志会给出提示）'
      : undefined;

    // 保存后立即做一致性巡检（花名册比对）：查无此人/已离职引用合并进 warning 一次性透出
    let consistency: ManagersConsistency | null = null;
    try {
      consistency = await this.consistency();
    } catch {
      /* 巡检失败不影响保存结果 */
    }
    const warns: string[] = [];
    if (warning) warns.push(warning);
    if (consistency?.unknown.length) {
      warns.push(`负责人姓名不在人员花名册中（请核对拼写或在「人事管理 → 人员管理」补充）：${consistency.unknown.join('、')}`);
    }
    if (consistency?.inactive.length) {
      warns.push(`以下负责人已离职/停用，建议更换：${consistency.inactive.map((x) => x.name).join('、')}`);
    }

    // 钉钉ID 解析不在这里做：由「钉钉ID 取数基座」在任务发送时统一解析（缓存 → 通讯录搜索），只落解析缓存
    return {
      ...this.get(),
      ok: true,
      ...(consistency ? { consistency } : {}),
      ...(warns.length ? { warning: warns.join('；') } : {}),
    };
  }
}
