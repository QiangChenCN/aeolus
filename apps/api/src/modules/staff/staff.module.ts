import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FetchModule } from '../../infra/fetch/fetch.module';
import { PgModule } from '../pg/pg.module';
import { PersonnelModule } from '../personnel/personnel.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { PositionController } from './position.controller';
import { PositionService } from './position.service';

/**
 * 人员花名册（除骑手外的其他人员，人事管理子模块）。
 * 主数据存 PostgreSQL（staff_roster），站点名解析用站点目录（TeamsFetchService）。
 * 岗位字典（position_dict）作为子资源同模块注册：数据消费方就是花名册，同域最简。
 */
@Module({
  imports: [AuthModule, FetchModule, PgModule, PersonnelModule],
  controllers: [StaffController, PositionController],
  providers: [StaffService, PositionService],
})
export class StaffModule {}
