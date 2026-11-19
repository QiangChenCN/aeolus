import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { Body, Controller, Get, Post } from '@nestjs/common';
import { BotConfigService } from './bot-config.service';
import { BotRegistryService } from './bot-registry.service';
import { BotManifestService } from './bot-manifest.service';
import { BotGatewayService } from './bot-gateway.service';

/**
 * 机器人配置端点（前端「机器人」模块调用）。
 * 控制面只依赖网关聚合器，不感知具体渠道实现；新增渠道无需改动本控制器。
 * 路由→权限由 AccessGuard 按 permissions.ts 自动裁决（admin:bot）。
 */
@Controller('api')
export class BotController {
  constructor(
    private readonly cfg: BotConfigService,
    private readonly gateway: BotGatewayService,
    private readonly registry: BotRegistryService,
    private readonly manifest: BotManifestService,
  ) {}

  /** 读取脱敏后的全局开关配置（AI 打字 / 超时 / 总开关）。 */
  @RequirePerm('admin:bot')
  @Get('bot/config')
  getConfig() {
    return { ok: true, config: this.cfg.getConfig() };
  }

  /** 机器人实例清单 + 全渠道连接状态（前端「实例管理」页）。 */
  @RequirePerm('admin:bot')
  @Get('bot/status')
  botStatus() {
    return {
      ok: true,
      gatewayConnected: this.gateway.isConnected(),
      botEnabled: this.cfg.isBotEnabled(),
      connections: this.gateway.listConnections(),
      bots: this.registry.listStatus(),
    };
  }

  /** 保存全局开关并热重载 Stream 长连接（凭据变化即时生效）。打字效果为实例级配置。 */
  @RequirePerm('admin:bot')
  @Post('bot/config')
  async saveConfig(@Body() b: Record<string, any>) {
    const config = this.cfg.saveConfig({
      botEnabled: b?.botEnabled,
    });
    const reload = await this.gateway.reload();
    return { ok: true, config, reload };
  }

  /** 凭据分组列表（脱敏，secret 不外泄）。 */
  @RequirePerm('admin:bot')
  @Get('bot/credentials')
  getCredentials() {
    return { ok: true, groups: this.cfg.listGroups() };
  }

  /** 保存凭据分组（整体替换；secret 留空表示不修改）。保存后热重载连接。 */
  @RequirePerm('admin:bot')
  @Post('bot/credentials')
  async saveCredentials(@Body() b: Record<string, any>) {
    try {
      const groups = this.cfg.saveGroups(b?.groups || []);
      const reload = await this.gateway.reload();
      return { ok: true, groups, reload };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  /** 仅重新连接 Stream（不动配置）。 */
  @RequirePerm('admin:bot')
  @Post('bot/reload')
  async reload() {
    return { ok: true, reload: await this.gateway.reload() };
  }

  /**
   * 单个机器人实例配置：在线启停（enabled）、凭据分组绑定（credentialsRef）、展示名（displayName）。
   * 仅改 enabled 不需重连；改 credentialsRef 需重建连接（自动 reload）；displayName 仅覆盖展示名。
   */
  @RequirePerm('admin:bot')
  @Post('bot/bots')
  async setBot(
    @Body() b: { botId?: string; enabled?: boolean; credentialsRef?: string; displayName?: string; queryTimeout?: number; aiCardTyping?: boolean },
  ) {
    if (!b?.botId) return { ok: false, error: 'botId 必填' };
    let needReload = false;
    if (typeof b.enabled === 'boolean') {
      if (!this.registry.setEnabled(b.botId, b.enabled)) {
        return { ok: false, error: '未知 botId: ' + b.botId };
      }
    }
    if (typeof b.credentialsRef === 'string') {
      const ref = b.credentialsRef.trim();
      if (ref) {
        if (!this.cfg.getGroup(ref)) return { ok: false, error: '凭据分组不存在: ' + ref };
        const bot = this.registry.get(b.botId);
        if (bot && this.registry.channelMismatch(bot, ref)) {
          return {
            ok: false,
            error: `渠道不匹配：实例为 ${bot.type}，凭据分组为 ${this.cfg.channelOfGroup(ref)}`,
          };
        }
      }
      if (!this.registry.setCredentialsRef(b.botId, ref)) {
        return { ok: false, error: '凭据绑定失败（botId 不存在）' };
      }
      needReload = true;
    }
    if (typeof b.displayName === 'string') {
      if (!this.manifest.setDisplayName(b.botId, b.displayName)) {
        return { ok: false, error: '展示名保存失败（botId 不存在）' };
      }
    }
    if (typeof b.queryTimeout === 'number') {
      if (!this.manifest.setQueryTimeout(b.botId, b.queryTimeout)) {
        return { ok: false, error: '查询超时设置失败（botId 不存在或数值非法）' };
      }
    }
    if (typeof b.aiCardTyping === 'boolean') {
      if (!this.manifest.setAiCardTyping(b.botId, b.aiCardTyping)) {
        return { ok: false, error: '打字效果保存失败（botId 不存在）' };
      }
    }
    const reload = needReload ? await this.gateway.reload() : null;
    return { ok: true, bots: this.registry.listStatus(), reload };
  }
}
