import { Module } from '@nestjs/common';
import { PgModule } from '../pg/pg.module';
import { StationManagersController } from './station-managers.controller';
import { StationManagersService } from './station-managers.service';

/**
 * 通知配置模块：站点 → 负责人**姓名**映射（runtime JSON + UI 维护）。
 * 姓名 → openDingTalkId 解析由「钉钉ID 取数基座」（DingtalkIdModule，全局）承担。
 * 一致性巡检只读人员花名册（PgModule），岗位语义归岗位字典（staff 模块），不在此判定。
 */
@Module({
  imports: [PgModule],
  controllers: [StationManagersController],
  providers: [StationManagersService],
  exports: [StationManagersService],
})
export class NotifyModule {}
