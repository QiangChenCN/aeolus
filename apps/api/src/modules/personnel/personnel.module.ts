import { Module } from '@nestjs/common';
import { PgModule } from '../pg/pg.module';
import { PersonnelChangesService } from './personnel-changes.service';
import { PersonnelController } from './personnel.controller';

/**
 * 人事异动记录（人员/骑手通用事件流）。
 * PersonnelChangesService 被骑手/人员花名册服务复用（写），本控制器提供只读查询。
 */
@Module({
  imports: [PgModule],
  controllers: [PersonnelController],
  providers: [PersonnelChangesService],
  exports: [PersonnelChangesService],
})
export class PersonnelModule {}
