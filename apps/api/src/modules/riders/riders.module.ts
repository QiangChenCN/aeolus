import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FetchModule } from '../../infra/fetch/fetch.module';
import { PgModule } from '../pg/pg.module';
import { RiderRosterDetailStoreService } from './rider-roster-detail-store.service';
import { RidersController } from './riders.controller';
import { RidersService } from './riders.service';

/**
 * 骑手管理页。
 *
 * rider_roster 保留表名但按骑手明细数据重新设计列结构：
 * 刷新经 FetchModule 的「骑手明细查询」基座取数并落库，页面直接读 rider_roster。
 */
@Module({
  imports: [AuthModule, FetchModule, PgModule],
  controllers: [RidersController],
  providers: [RidersService, RiderRosterDetailStoreService],
})
export class RidersModule {}
