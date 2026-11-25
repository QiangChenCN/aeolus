import { Body, Controller, Get, Post, Put, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { AuthService } from '../auth/auth.service';
import { DataPermService } from '../auth/data-perm.service';
import { requestActor, requestAllowedTeamIds } from '../../common/perm-request.util';
import { RidersService } from './riders.service';

/**
 * 骑手管理页的数据落库与读库出口（rider_roster 已按骑手明细重设计）。
 *
 *  · GET  /api/riders/detail?keyword=&team=&workStatus=&page=&pageSize=
 *                                                              页面读库展示（view，SQL 层筛选/权限/分页）
 *  · GET  /api/riders/settlement?knightId=                     单独查看结算单价真实值（view，列表仅打码）
 *  · POST /api/riders                                          手动新增骑手到 rider_roster（config:write）
 */
@Controller('api')
export class RidersController {
  constructor(
    private readonly riders: RidersService,
    private readonly auth: AuthService,
    private readonly dataPerm: DataPermService,
  ) {}

  /** 页面列表：读 rider_roster 新结构，筛选/权限/分页都在 SQL 层。 */
  @RequirePerm('view')
  @Get('riders/detail')
  detail(
    @Query('keyword') keyword: string,
    @Query('team') team: string,
    @Query('workStatus') workStatus: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Req() req: Request,
  ) {
    return this.riders.listDetailRows({
      keyword,
      team,
      workStatus,
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 50,
      allowed: requestAllowedTeamIds(this.auth, this.dataPerm, req),
    });
  }

  /** 单独查看结算单价真实值（列表只返回打码占位）。 */
  @RequirePerm('view')
  @Get('riders/settlement')
  settlement(@Query('knightId') knightId: string, @Req() req: Request) {
    try {
      return this.riders.settlement(knightId, requestAllowedTeamIds(this.auth, this.dataPerm, req));
    } catch (e) {
      return { ok: false, error: (e as Error).message || String(e) };
    }
  }

  /** 骑手入离职履历：不可变事件流时间线。 */
  @RequirePerm('view')
  @Get('riders/employment-history')
  employmentHistory(
    @Query('knightId') knightId: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
  ) {
    try {
      return this.riders.employmentHistory(knightId, Number(page) || 1, Number(pageSize) || 20);
    } catch (e) {
      return { ok: false, error: (e as Error).message || String(e) };
    }
  }

  /** 手动新增骑手：只写本地 rider_roster，不触发外部取数。 */
  @RequirePerm('config:write')
  @Post('riders')
  create(@Body() body: Record<string, unknown>, @Req() req: Request) {
    try {
      return this.riders.createRider(
        body || {},
        requestAllowedTeamIds(this.auth, this.dataPerm, req),
        requestActor(this.auth, req),
      );
    } catch (e) {
      return { ok: false, error: (e as Error).message || String(e) };
    }
  }

  /** 手动编辑/离职：只写本地 rider_roster，不触发外部取数。 */
  @RequirePerm('config:write')
  @Put('riders')
  update(@Body() body: Record<string, unknown>, @Req() req: Request) {
    try {
      return this.riders.updateRider(
        body || {},
        requestAllowedTeamIds(this.auth, this.dataPerm, req),
        requestActor(this.auth, req),
      );
    } catch (e) {
      return { ok: false, error: (e as Error).message || String(e) };
    }
  }

  /** 供程序调用的取数落库端点；页面已不再使用该流程。 */
  @RequirePerm('config:write')
  @Post('riders/refresh')
  async refresh() {
    try {
      return await this.riders.refreshFromKnightDetail();
    } catch (e) {
      return { ok: false, error: (e as Error).message || String(e) };
    }
  }
}
