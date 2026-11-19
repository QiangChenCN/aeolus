import { Body, Controller, Get, Post } from '@nestjs/common';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { DataPermService } from '../auth/data-perm.service';
import { TeamsFetchService } from '../../infra/fetch/sources/teams-fetch.service';
import { PgService } from '../pg/pg.service';

/**
 * 组织架构（人事管理子模块）：业务线 → 城市 → 站点 的归属配置编辑入口。
 *
 * 定位与边界（评估结论落地）：
 *  · 站点清单是**风神事实**（TeamsFetchService / teams.json），只读，禁止手工增删；
 *  · 城市 / 业务线归属是**本地配置**（org_tree.json，DataPermService 唯一读写方）；
 *  · 本控制器是组织树在 Web 端的**唯一编辑入口**（此前 Web 端无编辑界面，
 *    数据权限规则编辑仍归「系统设置 → 权限管理」，两者共享同一份文件不冲突）。
 *
 * 端点：
 *  · GET  /api/org/structure  读取组织树 + 站点目录 + 未归属站点（view）
 *  · POST /api/org/structure  保存组织树（整棵覆盖写，admin:data-perm）
 */
@Controller('api')
export class OrgStructureController {
  constructor(
    private readonly dataPerm: DataPermService,
    private readonly teams: TeamsFetchService,
    private readonly pg: PgService,
  ) {}

  @RequirePerm('view')
  @Get('org/structure')
  async structure() {
    const r = await this.teams.fetchAll(false);
    const list = (r.teams || []).map((t) => ({ id: String(t.id), name: t.name }));
    const nameOf = new Map(list.map((t) => [t.id, t.name]));
    const orgIds = this.dataPerm.orgCities();
    const cities: Record<string, { id: string; name: string }[]> = {};
    const inOrg = new Set<string>();
    for (const [c, ts] of Object.entries(orgIds)) {
      cities[c] = ts.map((id) => ({ id: String(id), name: nameOf.get(String(id)) || String(id) }));
      for (const id of ts) inOrg.add(String(id));
    }
    // 在职人数统计（组织总览树形图徽标）：骑手/人员花名册按站点聚合；表不存在时静默降级
    let ridersByTeam: Record<string, number> = {};
    let staffByTeam: Record<string, number> = {};
    try {
      for (const [k, sql] of [
        ['riders', `SELECT team_id, count(*)::int cnt FROM rider_roster WHERE status = 'active' AND team_id <> '' GROUP BY team_id`],
        ['staff', `SELECT team_id, count(*)::int cnt FROM staff_roster WHERE status = 'active' AND team_id <> '' GROUP BY team_id`],
      ] as const) {
        const rows = await this.pg.query<{ team_id: string; cnt: number }>(sql);
        const map: Record<string, number> = {};
        for (const row of rows) map[String(row.team_id)] = Number(row.cnt);
        if (k === 'riders') ridersByTeam = map;
        else staffByTeam = map;
      }
    } catch {
      /* 花名册表未就绪：徽标留空，不阻塞组织架构展示 */
    }
    return {
      ok: true,
      teams: list,
      teams_source: r.source,
      cities,
      ungrouped: list.filter((t) => !inOrg.has(t.id)),
      business_lines: this.dataPerm.businessLines(),
      bl_of_city: this.dataPerm.blOfCity(),
      // {业务线: [城市]} 权威存储结构（一个城市可挂多条业务线；bl_of_city 是 city→bl 单值投影，仅展示用）
      bl_cities: this.dataPerm.blCitiesMap(),
      // {业务线: [站点id]} 业务线直挂站点（显式归属优先于城市继承）
      bl_stations: this.dataPerm.blStationsMap(),
      default_new_site: this.dataPerm.getDefaultNewSite(),
      riders_by_team: ridersByTeam,
      staff_by_team: staffByTeam,
    };
  }

  @RequirePerm('admin:data-perm')
  @Post('org/structure')
  save(@Body() b: Record<string, any>) {
    try {
      // cities: {城市: [站点id...]}；business_lines: {业务线: [城市...]}；bl_stations: {业务线: [站点id...]}；整棵覆盖写
      const citiesMap: Record<string, string[]> = {};
      for (const [c, arr] of Object.entries(b.cities || {})) {
        if (!Array.isArray(arr)) continue;
        citiesMap[c] = arr.map((x: any) => String(x)).filter(Boolean);
      }
      const blMap: Record<string, string[]> = {};
      for (const [bl, arr] of Object.entries(b.business_lines || {})) {
        if (!Array.isArray(arr)) continue;
        blMap[bl] = arr.map((x: any) => String(x)).filter(Boolean);
      }
      const blStationsMap: Record<string, string[]> = {};
      for (const [bl, arr] of Object.entries(b.bl_stations || {})) {
        if (!Array.isArray(arr)) continue;
        blStationsMap[bl] = arr.map((x: any) => String(x)).filter(Boolean);
      }
      this.dataPerm.setOrg(citiesMap, b.default_new_site, blMap, blStationsMap);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}
