import { Body, Controller, Delete, Get, Post, Put, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { AuthService } from '../auth/auth.service';
import { DataPermService } from '../auth/data-perm.service';
import { TeamsFetchService, readKnownTeams } from '../../infra/fetch/sources/teams-fetch.service';
import { BizError } from '../../common/biz.error';
import { requestActor, requestAllowedTeamIds } from '../../common/perm-request.util';
import { StaffService } from './staff.service';

/**
 * 人员花名册（除骑手外的其他人员）CRUD。
 *
 *  · GET    /api/staff?keyword=&team=&status=&page=&pageSize=  人员查询（view）
 *  · POST   /api/staff                                          新建（config:write）
 *  · PUT    /api/staff                                          更新（config:write）
 *  · DELETE /api/staff?id=                                      删除（config:write）
 *
 * 数据权限：会话用户按站点可见范围过滤（SQL 层，列表/写操作同口径）；
 * 无会话（机器令牌/内部调用）不限制——这是刻意设计，机器令牌只在服务端
 * 内部链路（任务管线取数）出现，不会下发到浏览器。
 *
 * 与骑手花名册的边界：骑手管理走考勤快照同步；人员花名册无自动同步来源
 * （后续可接钉钉通讯录），站点名解析直接用站点目录（TeamsFetchService）。
 */
@Controller('api')
export class StaffController {
  constructor(
    private readonly staff: StaffService,
    private readonly auth: AuthService,
    private readonly dataPerm: DataPermService,
    private readonly teams: TeamsFetchService,
  ) {}

  /** 站点目录：优先实时目录，接口异常时降级本地缓存（站点目录挂了不该阻塞人员 CRUD）。 */
  private async teamList(): Promise<{ id: string; name: string }[]> {
    try {
      const r = await this.teams.fetchAll(false);
      return (r.teams || []).map((t) => ({ id: String(t.id), name: t.name }));
    } catch {
      return readKnownTeams().map((t) => ({ id: String(t.id), name: t.name }));
    }
  }

  @RequirePerm('view')
  @Get('staff')
  list(
    @Query('keyword') keyword: string,
    @Query('team') team: string,
    @Query('status') status: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Req() req: Request,
  ) {
    // 数据权限在 service 的 SQL 层生效（含 count），不再分页后内存过滤
    return this.staff.list({
      keyword, team, status,
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 50,
      allowed: requestAllowedTeamIds(this.auth, this.dataPerm, req),
    });
  }

  @RequirePerm('config:write')
  @Post('staff')
  async create(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const teams = await this.teamList();
    return this.staff.create(
      body || {},
      teams,
      requestActor(this.auth, req),
      requestAllowedTeamIds(this.auth, this.dataPerm, req),
    );
  }

  @RequirePerm('config:write')
  @Put('staff')
  async update(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const id = Number(body?.id);
    if (!Number.isFinite(id) || id <= 0) throw new BizError('缺少有效的 id');
    const { id: _omit, ...patch } = body || {};
    const teams = await this.teamList();
    return this.staff.update(
      id,
      patch,
      teams,
      requestActor(this.auth, req),
      requestAllowedTeamIds(this.auth, this.dataPerm, req),
    );
  }

  @RequirePerm('config:write')
  @Delete('staff')
  remove(@Query('id') id: string, @Req() req: Request) {
    const n = Number(id);
    if (!Number.isFinite(n) || n <= 0) throw new BizError('缺少有效的 id');
    return this.staff.remove(n, requestActor(this.auth, req), requestAllowedTeamIds(this.auth, this.dataPerm, req));
  }
}
