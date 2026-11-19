import { BotRegistryService } from './bot-registry.service';
import { normalizeChannelType } from './bot-config.service';

/** 多渠道安全闸门回归：老数据兼容 + 跨渠道绑定必须被拦截。 */
describe('渠道安全校验', () => {
  it('normalizeChannelType 兼容历史空值为钉钉', () => {
    expect(normalizeChannelType(undefined)).toBe('dingtalk');
    expect(normalizeChannelType('')).toBe('dingtalk');
    expect(normalizeChannelType('  ')).toBe('dingtalk');
    expect(normalizeChannelType(' wecom ')).toBe('wecom');
  });

  it('channelMismatch 拦截跨渠道绑定，放行同渠道与未知凭据', () => {
    const bot = {
      botId: 'std-achievement',
      type: 'dingtalk',
      displayName: '运力达成查询',
      check: async () => ({ ok: true }),
      diag: async () => ({}),
      onMessage: async () => undefined,
    };
    const manifest = {
      getEnabled: () => true,
      getCredentialsRef: () => undefined,
      getQueryTimeout: () => 60,
      getDefaultQueryTimeout: () => 60,
    };
    const groups: Record<string, { type?: string }> = {
      ding: { type: 'dingtalk' },
      legacy: {}, // 老数据无 type → 归一为 dingtalk
      wc: { type: 'wecom' },
      fs: { type: 'feishu' },
    };
    const cfg = { getGroup: (id: string) => groups[id] || null };
    const registry = new BotRegistryService([bot] as any, manifest as any, cfg as any);

    expect(registry.channelMismatch(bot as any, 'ding')).toBe(false);
    expect(registry.channelMismatch(bot as any, 'legacy')).toBe(false);
    expect(registry.channelMismatch(bot as any, 'wc')).toBe(true);
    expect(registry.channelMismatch(bot as any, 'fs')).toBe(true);
    // 凭据不存在时不拦截，由网关侧标记 missingCredential
    expect(registry.channelMismatch(bot as any, 'missing')).toBe(false);
  });
});
