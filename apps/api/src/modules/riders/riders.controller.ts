import { Body, Controller, Delete, Get, Post, Put, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { AuthService } from '../auth/auth.service';
import { DataPermService } from '../auth/data-perm.service';
import { BizError } from '../../common/biz.error';
import { requestActor, requestAllowedTeamIds } from '../../common/perm-request.util';
import { RidersService } from './riders.service';

/**
 * 骑手花名册（人事主数据 CRUD + 考勤同步）。
 *
 *  · GET    /api/riders?keyword=&team=&status=&page=&pageSize=  名册查询（view）
 *  · POST   /api/riders                                          新建（config:write）
 *  · PUT    /api/riders                                          更新（config:write）
 *  · DELETE /api/riders?id=                                      删除（config:write）
 *  · POST   /api/riders/sync                                     从考勤快照同步（config:write）
 *
 * 数据权限：会话用户按站点可见范围过滤（SQL 层，列表/写操作同口径）；
 * 无会话（机器令牌/内部调用）不限制（与 StaffController 同口径，刻意设计）。
 */
@Controller('api')
export class RidersController {
  constructor(
    private readonly riders: RidersService,
    private readonly auth: AuthService,
    private readonly dataPerm: DataPermService,
  ) {}

  @RequirePerm('view')
  @Get('riders')
  list(
    @Query('keyword') keyword: string,
    @Query('team') team: string,
    @Query('status') status: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Req() req: Request,
  ) {
    // 数据权限在 service 的 SQL 层生效（含 count），不再分页后内存过滤
    return this.riders.list({
      keyword, team, status,
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 50,
      allowed: requestAllowedTeamIds(this.auth, this.dataPerm, req),
    });
  }

  @RequirePerm('config:write')
  @Post('riders')
  create(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.riders.create(
      body || {},
      requestActor(this.auth, req),
      requestAllowedTeamIds(this.auth, this.dataPerm, req),
    );
  }

  @RequirePerm('config:write')
  @Put('riders')
  update(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const id = Number(body?.id);
    if (!Number.isFinite(id) || id <= 0) throw new BizError('缺少有效的 id');
    const { id: _omit, ...patch } = body || {};
    return this.riders.update(
      id,
      patch,
      requestActor(this.auth, req),
      requestAllowedTeamIds(this.auth, this.dataPerm, req),
    );
  }

  @RequirePerm('config:write')
  @Delete('riders')
  remove(@Query('id') id: string, @Req() req: Request) {
    const n = Number(id);
    if (!Number.isFinite(n) || n <= 0) throw new BizError('缺少有效的 id');
    return this.riders.remove(n, requestActor(this.auth, req), requestAllowedTeamIds(this.auth, this.dataPerm, req));
  }

  @RequirePerm('config:write')
  @Post('riders/sync')
  sync() {
    return this.riders.syncFromSnapshot();
  }
}
