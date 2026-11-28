import { Injectable } from '@nestjs/common';

/** Nest → Python compute 的 AI 端点转发（只做编排，不做计算）。 */
@Injectable()
export class AiService {
  async status(): Promise<Record<string, unknown>> {
    try {
      const res = await fetch('http://127.0.0.1:8900/api/ai/status', { signal: AbortSignal.timeout(5000) });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      return { ok: res.ok && data.ok !== false, ...data };
    } catch (e) {
      return { ok: false, available: false, error: `计算服务不可用：${(e as Error).message}` };
    }
  }

  async run(url: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    // 绝不把密钥写进日志 / 错误体；只透传给环回计算服务。
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (typeof payload.apiKey === 'string' && payload.apiKey) {
      headers['x-dsh-api-key'] = payload.apiKey;
      delete payload.apiKey;
    }
    if (typeof payload.baseUrl === 'string' && payload.baseUrl) {
      headers['x-dsh-base-url'] = payload.baseUrl;
      delete payload.baseUrl;
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout((Number(payload.timeoutSeconds) || 300) * 1000 + 30000),
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok || data.ok === false) {
        return { ok: false, error: data.error || `upstream responded ${res.status}` };
      }
      return { ok: true, ...data };
    } catch (e) {
      return { ok: false, error: `AI 执行失败：${(e as Error).message}` };
    }
  }
}
