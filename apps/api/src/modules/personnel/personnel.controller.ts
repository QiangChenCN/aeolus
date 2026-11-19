import { Controller, Get, Query } from '@nestjs/common';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { PersonnelChangesService } from './personnel-changes.service';

/**
 * 人事异动记录查询（人员/骑手通用，时间线展示数据源）。
 * 写入由 RidersService / StaffService 在 create/update/delete 时自动完成，这里只读。
 */
@Controller('api')
export class PersonnelController {
  constructor(private readonly changes: PersonnelChangesService) {}

  @RequirePerm('view')
  @Get('personnel/changes')
  list(
    @Query('targetType') targetType: string,
    @Query('targetId') targetId: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
  ) {
    return this.changes.list({
      targetType,
      targetId: Number(targetId) || undefined,
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 20,
    });
  }
}
