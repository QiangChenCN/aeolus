/** 渠道抽象层：把「机器人控制面」与具体 IM 渠道解耦。 */

/** 已支持的渠道类型。新增渠道时在此追加，并在模块里注册对应 ChannelGateway。 */
export const CHANNEL_TYPES = ['dingtalk', 'wecom', 'feishu'] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export function isChannelType(v: unknown): v is ChannelType {
  return typeof v === 'string' && (CHANNEL_TYPES as readonly string[]).includes(v);
}

/** 统一连接快照（前端状态列 / 网关自检共用）。 */
export interface ChannelConnection {
  ref: string;
  clientId: string;
  connected: boolean;
  missingCredential: boolean;
}

/** 网关重载结果。 */
export interface GatewayReloadResult {
  ok: boolean;
  started: boolean;
  detail: string;
}

/**
 * 渠道网关契约。每个渠道实现一套（建连/断开/收消息/回复），控制面只依赖此接口。
 * 目前仅钉钉有真实实现；新渠道接入时新建实现并在 bots.module.ts 的 GATEWAYS 注册。
 */
export interface ChannelGateway {
  readonly channel: string;
  reload(): Promise<GatewayReloadResult>;
  listConnections(): ChannelConnection[];
  isConnected(): boolean;
}

/** 多网关注入令牌（显式数组工厂，规避 Symbol+multi 在部分 Nest 版本的坑）。 */
export const GATEWAYS = Symbol('BOT_GATEWAYS');
