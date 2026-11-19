import { Global, Module } from '@nestjs/common';
import { DingtalkModule } from '../dingtalk/dingtalk.module';
import { DingtalkIdBaseService } from './dingtalk-id-base.service';

/**
 * 钉钉ID 取数基座（全局模块）：全系统唯一的 openDingTalkId 获取入口。
 * 任务管线（NotifyModule / TasksModule 等）直接注入 DingtalkIdBaseService 调用，
 * 与「站点 → 负责人姓名」映射层（StationManagersService）职责分离。
 */
@Global()
@Module({
  imports: [DingtalkModule],
  providers: [DingtalkIdBaseService],
  exports: [DingtalkIdBaseService],
})
export class DingtalkIdModule {}
