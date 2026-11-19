import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { DingtalkService } from '../dingtalk/dingtalk.service';
import { PgService } from '../pg/pg.service';

export interface ResolvedNames {
  /** [姓名, openDingTalkId]，已按姓名去重排序。 */
  resolved: [string, string][];
  /** 未解析到 openDingTalkId 的姓名。 */
  missing: string[];
}

/** 解析缓存落盘结构（apps/api/runtime/manager_ids_cache.json）。 */
interface IdCacheFile {
  /** 缓存来源群（openDingTalkId 只在群成员语义下稳定）。 */
  group: string;
  ids: Record<string, string>;
  updated_at: string;
}

/**
 * **钉钉ID 取数基座**：全系统唯一的 openDingTalkId 获取入口，由任务管线调用。
 *
 * 职责边界（职责分离改造）：
 *  · 站点 → 负责人**姓名**映射：NotifyModule 的 StationManagersService（组织架构页维护）；
 *  · 姓名 → openDingTalk**ID** 解析：本基座（任务管线直接注入调用，不在映射层解析）。
 *
 * 解析优先级（与发送目标群无关，发哪个群都能 @ 对）：
 *  1. 解析缓存 `manager_ids_cache.json`（解析成功即落盘，下次零成本命中）；
 *  2. 通讯录按姓名搜索（dws contact +search-user 直接返回 openDingTalkId，
 *     要求姓名精确相等且唯一；同名多人且有手机号 → `+by-mobile` 反查 userId 消歧，
 *     手机号来自人员花名册 staff_roster，由「人事管理 → 人员管理」维护）。
 *
 * **不降级**：通讯录不可用直接抛错（调用方按任务失败/接口错误透出），不做群成员兜底。
 * **不写花名册**：解析结果只落解析缓存，人员花名册不存钉钉ID（花名册只提供手机号辅助消歧）。
 */
@Injectable()
export class DingtalkIdBaseService {
  private readonly logger = new Logger(DingtalkIdBaseService.name);
  private readonly cacheFile: string;

  constructor(
    private readonly config: ConfigService,
    private readonly dingtalk: DingtalkService,
    private readonly pg: PgService,
  ) {
    const root = path.resolve(
      config.get<string>('PROJECT_ROOT') || path.resolve(process.cwd(), '..'),
    );
    this.cacheFile = path.join(root, 'apps', 'api', 'runtime', 'manager_ids_cache.json');
  }

  // ── 解析缓存（manager_ids_cache.json）──

  private readCache(): IdCacheFile {
    try {
      const d = JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8'));
      if (d && typeof d === 'object' && d.ids && typeof d.ids === 'object') return d as IdCacheFile;
    } catch {
      /* 无缓存 */
    }
    return { group: '', ids: {}, updated_at: '' };
  }

  private writeCache(c: IdCacheFile): void {
    const tmp = `${this.cacheFile}.tmp`;
    fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(c, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmp, this.cacheFile);
    try {
      fs.chmodSync(this.cacheFile, 0o600);
    } catch {
      /* 权限微调失败不影响写入 */
    }
  }

  /** 缓存快照（UI 展示用）：来源群 + 更新时间 + {姓名: ID} 明细。 */
  cacheSnapshot(): { group: string; updated_at: string; ids: Record<string, string> } {
    const c = this.readCache();
    return { group: c.group, updated_at: c.updated_at, ids: c.ids };
  }

  // ── 人员花名册（只取手机号，辅助同名消歧）──

  /**
   * 人员花名册（staff_roster）姓名 → 手机号，同名歧义时反查消歧用。
   * 花名册**不存钉钉ID**（钉钉ID 全由本基座解析缓存承接）。
   * PG 不可用时返回空表（回退解析缓存/通讯录搜索）。
   */
  private async staffMobiles(): Promise<Map<string, string>> {
    const m = new Map<string, string>();
    try {
      const rows = await this.pg.query<{ name: string; mobile: string }>(
        'SELECT name, mobile FROM staff_roster',
      );
      for (const r of rows || []) if (r?.name && r?.mobile) m.set(String(r.name).trim(), String(r.mobile).trim());
    } catch {
      /* PG 未就绪/未配置时静默回退解析缓存与通讯录搜索 */
    }
    return m;
  }

  // ── 姓名 → openDingTalkId ──

  /** 姓名 → openDingTalkId（解析缓存；不发网络请求，无内置兜底）。 */
  async openIdFor(name: string): Promise<string | undefined> {
    return this.readCache().ids[name];
  }

  /** 快速解析（解析缓存内命中），不发网络请求。 */
  async resolveNames(names: Iterable<string>): Promise<ResolvedNames> {
    const cache = this.readCache().ids;
    const resolved: [string, string][] = [];
    const missing: string[] = [];
    for (const n of [...new Set(names)].filter(Boolean).sort()) {
      const oid = cache[n];
      if (oid) resolved.push([n, oid]);
      else missing.push(n);
    }
    return { resolved, missing };
  }

  /**
   * 自动解析（任务管线在发送前调用）：
   *  1. 解析缓存命中 → 直接用；
   *  2. 未命中 → 通讯录按姓名搜索（精确相等且唯一才采用；同名多人 → 手机号反查消歧）。
   * 通讯录不可用 → 直接抛错（不降级群成员）。解析成功即落缓存，下次零成本命中；**不回填花名册**。
   */
  async resolveNamesAuto(names: Iterable<string>): Promise<ResolvedNames> {
    const first = await this.resolveNames(names);
    if (!first.missing.length) return first;

    const cache = this.readCache();
    let dirty = false;
    const still: string[] = [];

    // 姓名 → 手机号（同名歧义时反查消歧用）：人员花名册为唯一事实来源
    const mobiles = await this.staffMobiles();

    for (const n of first.missing) {
      let candidates: { name: string; openDingTalkId?: string; userId?: string }[] = [];
      try {
        const all = await this.dingtalk.searchUserByName(n);
        candidates = all.filter((u) => u.name === n && u.openDingTalkId); // 精确匹配，拒绝前缀/包含式误伤
      } catch (e) {
        // 通讯录不可用：先落已解析成果再抛错（不降级群成员，调用方按失败透出）
        if (dirty) {
          cache.group = '通讯录';
          cache.updated_at = new Date().toISOString();
          this.writeCache(cache);
        }
        const msg = (e as Error).message.slice(0, 120);
        throw new Error(`钉钉ID 取数基座：通讯录搜索不可用（${msg}），无法解析「${n}」`);
      }
      // 同名多人 → 手机号反查 userId 消歧（有 openDingTalkId 的候选才能比对）
      if (candidates.length > 1) {
        const mobile = mobiles.get(n);
        if (mobile) {
          try {
            const uid = await this.dingtalk.searchUserIdByMobile(mobile);
            if (uid) {
              const matched = candidates.filter((c) => c.userId === uid);
              if (matched.length === 1) {
                this.logger.log(`姓名「${n}」同名 ${candidates.length} 人，经手机号反查（userId=${uid}）唯一确定`);
                candidates = matched;
              }
            }
          } catch (e) {
            this.logger.warn(`手机号反查失败（${mobile.slice(0, 4)}****）：${(e as Error).message.slice(0, 100)}`);
          }
        }
      }
      if (candidates.length === 1) {
        const id = candidates[0].openDingTalkId as string;
        cache.ids[n] = id;
        dirty = true;
        first.resolved.push([n, id]);
        this.logger.log(`取数基座自动解析 openDingTalkId：${n} → ${id.slice(0, 12)}…`);
      } else if (candidates.length > 1) {
        this.logger.warn(
          `姓名「${n}」在通讯录匹配到 ${candidates.length} 人${mobiles.has(n) ? '（手机号反查仍无法唯一确定）' : '（可在人员管理里填手机号辅助消歧）'}，跳过 @`,
        );
        still.push(n);
      } else {
        still.push(n);
      }
    }
    if (dirty) {
      cache.group = '通讯录';
      cache.updated_at = new Date().toISOString();
      this.writeCache(cache);
    }
    first.resolved.sort((a, b) => a[0].localeCompare(b[0], 'zh'));
    first.missing = still.sort();
    return first;
  }
}
