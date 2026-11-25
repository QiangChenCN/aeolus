import { Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequirePerm } from '../../../common/decorators/require-perm.decorator';
import { requestActor } from '../../../common/perm-request.util';
import { AuthService } from '../../../modules/auth/auth.service';
import { SourceConfigService } from './source-config.service';
import {
  ConfiguredSourceRunnerService,
  DryRunParams,
} from './configured-source-runner.service';
import { SourceConfig } from './source-config.model';

/**
 * 取数基座配置（P0/P1）。
 *
 * 清单 view 可见；草稿/发布/回滚/开关/试运行均需 admin:aeolus。
 * 所有路由显式声明 @RequirePerm —— AccessGuard 启动自检要求方法级权限声明。
 */
@Controller('api/settings')
export class SourceConfigController {
  constructor(
    private readonly configs: SourceConfigService,
    private readonly runner: ConfiguredSourceRunnerService,
    private readonly auth: AuthService,
  ) {}

  private actor(req: Request): string {
    return requestActor(this.auth, req);
  }

  @RequirePerm('view')
  @Get('source-configs')
  async list() {
    const items = await this.configs.list();
    return { ok: true, total: items.length, items };
  }

  @RequirePerm('admin:aeolus')
  @Get('source-configs/:id')
  async detail(@Param('id') id: string) {
    return { ok: true, item: await this.configs.detail(id) };
  }

  @RequirePerm('admin:aeolus')
  @Put('source-configs/:id')
  async saveDraft(
    @Param('id') id: string,
    @Body() body: Partial<SourceConfig>,
    @Req() req: Request,
  ) {
    const cfg = await this.configs.saveDraft(id, body || {}, this.actor(req));
    return { ok: true, item: cfg };
  }

  @RequirePerm('admin:aeolus')
  @Post('source-configs/:id/publish')
  async publish(@Param('id') id: string, @Req() req: Request) {
    const version = await this.configs.publish(id, this.actor(req));
    return { ok: true, version };
  }

  @RequirePerm('admin:aeolus')
  @Post('source-configs/:id/rollback')
  async rollback(
    @Param('id') id: string,
    @Body() body: { version?: number },
    @Req() req: Request,
  ) {
    const version = await this.configs.rollback(id, Number(body?.version), this.actor(req));
    return { ok: true, version };
  }

  @RequirePerm('admin:aeolus')
  @Post('source-configs/:id/enabled')
  async setEnabled(
    @Param('id') id: string,
    @Body() body: { enabled?: boolean },
    @Req() req: Request,
  ) {
    const enabled = await this.configs.setEnabled(id, Boolean(body?.enabled), this.actor(req));
    return { ok: true, enabled };
  }

  @RequirePerm('admin:aeolus')
  @Get('source-configs/:id/history/:version')
  async historyConfig(@Param('id') id: string, @Param('version') version: string) {
    const config = await this.configs.historyConfig(id, Number(version));
    return { ok: true, config };
  }

  @RequirePerm('admin:aeolus')
  @Post('source-configs/:id/dry-run')
  async dryRun(
    @Param('id') id: string,
    @Body() body: DryRunParams,
  ) {
    const result = await this.runner.dryRun(id, body || {});
    return result;
  }
}
