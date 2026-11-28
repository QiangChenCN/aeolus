import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { dirs } from '../../config/paths';

/**
 * AI 助手配置（系统设置 → AI 设置）。
 *
 * 落盘 apps/api/runtime/.ai_settings.json（0600，gitignored）：
 * - apiKey：DeepSeek API Key，UI 保存；读取时只返回掩码，明文永不外泄。
 * - baseUrl / model / timeoutSeconds：可调非机密项，保存后热生效。
 * - env 兜底：未保存 apiKey 时使用 process.env.DEEPSEEK_API_KEY（服务器 .env）。
 *
 * 与 MinIO 配置同范式：UI 维护 + 原子写 + 热生效，不进 git。
 */
export interface AiSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutSeconds: number;
  enabled: boolean;
}

const DEFAULTS: AiSettings = {
  apiKey: '',
  baseUrl: '',
  model: 'deepseek-v4-flash',
  timeoutSeconds: 300,
  enabled: true,
};

function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

@Injectable()
export class AiSettingsService {
  private readonly file = path.join(dirs.runtime(), '.ai_settings.json');

  private read(): AiSettings {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
      return {
        apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
        baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : '',
        model: typeof raw.model === 'string' && raw.model.trim() ? raw.model : DEFAULTS.model,
        timeoutSeconds: Number(raw.timeoutSeconds) > 0 ? Number(raw.timeoutSeconds) : DEFAULTS.timeoutSeconds,
        enabled: raw.enabled !== false,
      };
    } catch {
      return { ...DEFAULTS };
    }
  }

  /** 脱敏快照：apiKey 只给掩码；hasKey 反映 UI 或 env 是否已配置。 */
  masked(): Record<string, unknown> {
    const s = this.read();
    const key = s.apiKey || process.env.DEEPSEEK_API_KEY || '';
    return {
      apiKeyMasked: maskKey(key),
      hasKey: !!key,
      source: s.apiKey ? 'file' : key ? 'env' : 'none',
      baseUrl: s.baseUrl,
      model: s.model,
      timeoutSeconds: s.timeoutSeconds,
      enabled: s.enabled,
      file: this.file,
    };
  }

  /** 保存配置：apiKey 留空 = 沿用原值（避免掩码回写覆盖明文）。 */
  save(body: Record<string, unknown>): Record<string, unknown> {
    const prev = this.read();
    const next: AiSettings = {
      apiKey: typeof body.apiKey === 'string' && body.apiKey.trim() ? body.apiKey.trim() : prev.apiKey,
      baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl.trim() : prev.baseUrl,
      model: typeof body.model === 'string' && body.model.trim() ? body.model.trim() : prev.model,
      timeoutSeconds:
        body.timeoutSeconds != null && Number(body.timeoutSeconds) > 0
          ? Number(body.timeoutSeconds)
          : prev.timeoutSeconds,
      enabled: body.enabled === undefined ? prev.enabled : !!body.enabled,
    };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmp, this.file);
    fs.chmodSync(this.file, 0o600);
    return this.masked();
  }

  /** 运行时取值：UI 保存优先，env 兜底。 */
  effective(): AiSettings & { apiKey: string } {
    const s = this.read();
    return { ...s, apiKey: s.apiKey || process.env.DEEPSEEK_API_KEY || '' };
  }
}
