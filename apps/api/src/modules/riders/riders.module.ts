import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PgModule } from '../pg/pg.module';
import { PersonnelModule } from '../personnel/personnel.module';
import { RidersController } from './riders.controller';
import { RidersService } from './riders.service';

/**
 * 骑手花名册（人事主数据）。
 *
 * 本地主数据存 PostgreSQL（rider_roster 表），CRUD + 从考勤快照一键同步；
 * 骑手事实字段（姓名/手机号/站点）以风神名册为同步来源，状态/备注等人事属性由运营维护。
 */
@Module({
  imports: [AuthModule, PgModule, PersonnelModule],
  controllers: [RidersController],
  providers: [RidersService],
})
export class RidersModule {}
