import { Body, Controller, Get, Post } from '@nestjs/common';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { ConfigService } from '@nestjs/config';
import { AiSettingsService } from './ai-settings.service';
import { AiService } from './ai.service';

/**
 * AI 助手（DeepSeek Harness）：NestJS 是唯一鉴权网关，compute 只负责执行。
 * - 运行端点用 task:run（会消耗 token / 模型额度，不等同只读 view）
 * - 设置端点用 config:write
 */
@Controller('api/ai')
export class AiController {
  constructor(
    private readonly settings: AiSettingsService,
    private readonly ai: AiService,
    private readonly config: ConfigService,
  ) {}

  @RequirePerm('view')
  @Get('settings')
  settingsGet() {
    return this.settings.masked();
  }

  @RequirePerm('config:write')
  @Post('settings')
  settingsSave(@Body() b: Record<string, unknown>) {
    return this.settings.save(b || {});
  }

  @RequirePerm('view')
  @Get('status')
  async status() {
    const cfg = this.settings.effective();
    const upstream = await this.ai.status();
    return { ...upstream, configured: !!cfg.apiKey, model: cfg.model, enabled: cfg.enabled };
  }

  @RequirePerm('task:run')
  @Post('run')
  async run(@Body() b: Record<string, unknown>) {
    const cfg = this.settings.effective();
    if (!cfg.enabled) return { ok: false, error: 'AI 助手已在系统设置中停用' };
    if (!cfg.apiKey) {
      return { ok: false, error: '尚未配置 DeepSeek API Key（系统设置 → AI 设置，或服务器 .env）' };
    }
    const prompt = typeof b.prompt === 'string' ? b.prompt : '';
    if (!prompt.trim()) return { ok: false, error: '缺少 prompt' };

    const base = this.config.get<string>('PYTHON_COMPUTE_URL') || 'http://127.0.0.1:8900';
    return this.ai.run(`${base}/api/ai/run`, {
      prompt,
      sessionId: typeof b.sessionId === 'string' ? b.sessionId : null,
      model: typeof b.model === 'string' && b.model.trim() ? b.model : cfg.model,
      timeoutSeconds: cfg.timeoutSeconds,
      apiKey: cfg.apiKey,
      baseUrl: cfg.baseUrl,
    });
  }
}
