import { Body, Controller, Delete, Get, Post, Put, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { AuthService } from '../auth/auth.service';
import { DataPermService } from '../auth/data-perm.service';
import { BizError } from '../../common/biz.error';
import { requestActor, requestAllowedTeamIds } from '../../common/perm-request.util';
import { PositionService } from './position.service';

/**
 * 岗位字典（人事管理子模块）：人员花名册「岗位」字段的口径收敛入口。
 *
 * 端点：
 *  · GET    /api/staff/positions           字典 + 在职使用统计（view，数据权限过滤）
 *  · POST   /api/staff/positions           登记岗位（config:write）
 *  · PUT    /api/staff/positions           更新排序/备注/启停（config:write）
 *  · DELETE /api/staff/positions?id=       删除字典条目（config:write，在职使用受保护）
 *  · POST   /api/staff/positions/rename    重命名级联：花名册 + 异动 + 字典（config:write）
 *
 * 权限零新增：复用 view / config:write，权限点目录保持稳定。
 * 字典元数据为全局口径（不做站点级切分）；rename 的花名册侧变更受数据权限约束。
 */
@Controller('api')
export class PositionController {
  constructor(
    private readonly positions: PositionService,
    private readonly auth: AuthService,
    private readonly dataPerm: DataPermService,
  ) {}

  @RequirePerm('view')
  @Get('staff/positions')
  list(@Req() req: Request) {
    return this.positions.list(requestAllowedTeamIds(this.auth, this.dataPerm, req));
  }

  @RequirePerm('config:write')
  @Post('staff/positions')
  add(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.positions.add(body || {}, requestActor(this.auth, req));
  }

  @RequirePerm('config:write')
  @Put('staff/positions')
  updateMeta(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.positions.updateMeta(body || {}, requestActor(this.auth, req));
  }

  @RequirePerm('config:write')
  @Delete('staff/positions')
  remove(@Query('id') id: string) {
    const n = Number(id);
    if (!Number.isFinite(n) || n <= 0) throw new BizError('缺少有效的 id');
    return this.positions.remove(n);
  }

  @RequirePerm('config:write')
  @Post('staff/positions/rename')
  rename(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.positions.rename(
      body || {},
      requestActor(this.auth, req),
      requestAllowedTeamIds(this.auth, this.dataPerm, req),
    );
  }
}
