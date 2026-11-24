import { Injectable } from '@nestjs/common';
import { beijingNowStr, str } from '../../common/format.util';
import { BizError } from '../../common/biz.error';
import { KnightDetailQueryService } from '../../infra/fetch/sources/knight-detail-query.service';
import { RiderRosterDetailStoreService } from './rider-roster-detail-store.service';

/**
 * 骑手管理页业务层。
 *
 * rider_roster 已按骑手明细数据重设计：这里只负责
 * 「基座取数 → 落库」与「页面读库」两段编排，不再维护旧花名册 CRUD / 考勤同步。
 */
@Injectable()
export class RidersService {
  private syncing = false;

  constructor(
    private readonly knights: KnightDetailQueryService,
    private readonly details: RiderRosterDetailStoreService,
  ) {}

  /** 刷新链路：骑手明细查询基座全量取数 → rider_roster 新结构。 */
  async refreshFromKnightDetail() {
    if (this.syncing) throw new BizError('骑手资料刷新正在进行中，请稍后再试');
    this.syncing = true;
    try {
      const all = await this.knights.queryAllKnights({});
      const rows = all.rows.filter((r) => !!str(r?.['knightId']));
      const landed = await this.details.upsertAll(rows, beijingNowStr());
      return {
        ...landed,
        upstream_total: all.upstream_total,
        truncated: all.truncated,
        elapsed_sec: all.elapsed_sec,
      };
    } finally {
      this.syncing = false;
    }
  }

  /** 手动新增骑手：只写本地 rider_roster，不触发外部取数。 */
  createRider(data: Record<string, unknown>, allowed: Set<string> | null = null) {
    return this.details.create(data, allowed);
  }

  /** 手动编辑/离职：只写本地 rider_roster，不触发外部取数。 */
  updateRider(data: Record<string, unknown>, allowed: Set<string> | null = null) {
    return this.details.update(data, allowed);
  }

  /** 单独查看结算单价真实值（列表只返回打码占位）。 */
  settlement(knightId: string, allowed: Set<string> | null = null) {
    return this.details.settlement(knightId, allowed);
  }

  /** 骑手管理页列表：读 rider_roster 新结构，筛选/权限/分页都在 SQL 层。 */
  listDetailRows(opts: {
    keyword?: string;
    team?: string;
    workStatus?: string;
    page?: number;
    pageSize?: number;
    allowed?: Set<string> | null;
  }) {
    return this.details.list(opts);
  }
}
