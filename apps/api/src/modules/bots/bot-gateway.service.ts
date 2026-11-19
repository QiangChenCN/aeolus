import { Inject, Injectable } from '@nestjs/common';
import { ChannelConnection, ChannelGateway, GATEWAYS, GatewayReloadResult } from './channel.interface';

/** 带渠道标记的连接快照（聚合后供前端区分展示）。 */
export interface AggregatedConnection extends ChannelConnection {
  channel: string;
}

/**
 * 网关聚合器：控制面只依赖它，不再直接注入任何具体渠道网关。
 * 单个渠道的实现变化 / 新增渠道，都不会影响 BotController 与各端点语义。
 */
@Injectable()
export class BotGatewayService {
  constructor(@Inject(GATEWAYS) private readonly gateways: ChannelGateway[]) {}

  /** 重载全部渠道网关；任一失败不阻断其它渠道，汇总明细。 */
  async reload(): Promise<GatewayReloadResult & { channels: Record<string, GatewayReloadResult> }> {
    const channels: Record<string, GatewayReloadResult> = {};
    const results = await Promise.all(
      this.gateways.map(async (g) => {
        try {
          const r = await g.reload();
          channels[g.channel] = r;
          return r;
        } catch (e) {
          const r: GatewayReloadResult = { ok: false, started: false, detail: (e as Error).message };
          channels[g.channel] = r;
          return r;
        }
      }),
    );
    const started = results.some((r) => r.started);
    const failed = results.filter((r) => !r.ok);
    const detail = failed.length
      ? `${failed.length} 个渠道重载失败：${failed.map((r) => r.detail).join('；')}`
      : results.map((r) => r.detail).filter(Boolean).join('；') || (started ? '已重连' : '无可用连接');
    return { ok: failed.length === 0, started, detail, channels };
  }

  /** 所有渠道的连接快照。 */
  listConnections(): AggregatedConnection[] {
    return this.gateways.flatMap((g) =>
      g.listConnections().map((c) => ({ ...c, channel: g.channel })),
    );
  }

  /** 是否至少有一个渠道真实建立连接。 */
  isConnected(): boolean {
    return this.gateways.some((g) => g.isConnected());
  }
}
