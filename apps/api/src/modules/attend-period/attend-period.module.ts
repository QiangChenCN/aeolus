import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AttendPeriodFeedbackController } from './attend-period-feedback.controller';
import { AttendPeriodFeedbackStoreService } from './attend-period-feedback-store.service';

/**
 * 排班出勤后端模块。
 *
 * PgModule 是 @Global，store 直接注入 PgService 即可。
 * 反馈表由 store 在启动时自动建表，读取由 controller 暴露；写入仍由外部流程负责。
 */
@Module({
  imports: [AuthModule],
  controllers: [AttendPeriodFeedbackController],
  providers: [AttendPeriodFeedbackStoreService],
  exports: [AttendPeriodFeedbackStoreService],
})
export class AttendPeriodModule {}
