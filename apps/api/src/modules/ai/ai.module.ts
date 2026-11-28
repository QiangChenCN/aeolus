import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiSettingsService } from './ai-settings.service';

/** AI 助手模块：Nest 鉴权 + 配置 + 编排，执行下沉 compute（DeepSeek Harness SDK）。 */
@Module({
  controllers: [AiController],
  providers: [AiService, AiSettingsService],
  exports: [AiSettingsService],
})
export class AiModule {}
