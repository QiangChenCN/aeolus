import { Module } from '@nestjs/common';
import { AttendPeriodFeedbackStoreService } from './attend-period-feedback-store.service';

/**
 * 排班出勤后端模块。
 *
 * PgModule 是 @Global，store 直接注入 PgService 即可。
 * 本阶段只注册反馈表 store，让后端启动时自动建表；不挂 controller、不改前端。
 */
@Module({
  providers: [AttendPeriodFeedbackStoreService],
  exports: [AttendPeriodFeedbackStoreService],
})
export class AttendPeriodModule {}
