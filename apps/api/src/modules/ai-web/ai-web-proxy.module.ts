import { Module } from '@nestjs/common';
import { AiWebProxyService } from './ai-web-proxy.service';

/** 官方 DSH WebUI 的托管与同域反向代理（不参与 Nest 路由，无 @RequirePerm 需求）。 */
@Module({
  providers: [AiWebProxyService],
  exports: [AiWebProxyService],
})
export class AiWebProxyModule {}
