/**
 * 全项目「取数字段映射」唯一公共字典（@aeolus/shared）。
 *
 * apps/api（所有取数基座）与 apps/web（看板展示）共用同一份，任何导出或 API 取数的
 * 字段映射都只在这里维护，绝不在各自的取数服务 / 前端页面里另建映射表或再抄一份。
 * 本文件由原 apps/api/src/infra/fetch/sources/delivery-field-map.ts 整体迁入共享包。
 *
 * 目前收录两个区块：
 *   · 运单：DeliveryExportService（xlsx 导出）与 DeliveryQueryService（queryTracking 分页）；
 *   · 违规处罚：ViolationFetchService（CSV 导出）与 ViolationListFetchService（queryList 分页），
 *     前端违规处罚看板读库时也用 VIOLATION_CN2EN 把 CSV 中文表头行归一成英文键。
 * 每个区块的两条取数路径共用同一套字段映射；
 * 运单区块的映射如下：
 *   · CN2EN    中文表头 → 风神英文真名（也是看板列定义的来源）
 *   · BOOL_EN  布尔列（导出「是/否」↔ 布尔）
 *   · TIME_EN  时间列（北京时间字符串 ↔ 毫秒时间戳）
 *   · ENUM_DICT 分页数字编码 → 导出中文名（两路径显示一致）
 *   · toMs     北京时间字符串 → 毫秒 epoch
 *
 * 约定（2026-10-27 修正）：英文键必须 === 风神 queryTracking/导出 列表接口的真实字段名，
 * 不再使用旧版自造名（merchantId/orderNo/trackingType/…）。风神自身的拼写原貌
 * （如 `isOverPlatfromExpecteTime` 的 Platfrom）照原样保留，不要"纠正"。
 */

/** 中文表头 → 英文键（风神真实字段名）。看板列定义由此全量生成。 */
export const CN2EN: Record<string, string> = {
  商id: 'agencyId',
  商名称: 'agencyName',
  站点id: 'teamId',
  站点名称: 'teamName',
  商圈id: 'merchantBusDistrictId',
  商圈名称: 'merchantBusDistrictName',
  运单id: 'trackingId',
  订单号: 'platformTrackingId',
  骑手id: 'knightId',
  骑手名称: 'knightName',
  平台商家id: 'platformMerchantId',
  平台商家名称: 'platformMerchantName',
  商家订单流水号: 'platformMerchantSeq',
  运单类型: 'deliverTypeName',
  运单状态: 'stateDesc',
  配送标品: 'productName',
  订单来源: 'sourceName',
  '订单距离(km)': 'merchantConsumerDistance',
  '订单金额(元)': 'payAmount',
  '订单重量(kg)': 'weight',
  '用户下单时间': 'platformBookedAt',
  '用户支付时间': 'platformPaidAt',
  '运单创建时间': 'trackingCreatedAt',
  '团队接单时间': 'acceptAtLast',
  '骑手接单时间': 'assignAtLast',
  '骑手到店时间': 'arriveAtLast',
  '实际出餐时间': 'currentCookingFinishAt',
  '骑手取餐时间': 'fetchAtLast',
  '骑手送达时间': 'completeAt',
  '运单完成时间': 'trackingFinishAt',
  '用户期望时间': 'customerPredictDeliveryAt',
  '骑手考核时间': 'currentPredictDeliveryAt',
  '运单取消时间': 'trackingCancelAt',
  '平台期望时间': 'logisticsPredictDeliveryAt',
  '是否超平台期望时间': 'isOverPlatfromExpecteTime',
  '超平台期望送达时长': 'overPlatfromExpecteTime',
  '是否超用户T': 'isOverUserT',
  '是否超骑手T': 'isOverCarrierT',
  配送时长: 'deliveryDuration',
  天气等级: 'weatherGradeName',
  天气: 'weatherName',
  欺诈是否成立: 'isCheat',
  违规取餐是否成立: 'isIllegalFetch',
  违规到店是否成立: 'isIllegalArrival',
  违规送达是否成立: 'isIllegalComplete',
  是否逆向单: 'isReverse',
  是否发生转单: 'isTransfer',
  是否发生改派: 'isReassign',
  索赔是否成立: 'isClaim',
  索赔原因: 'claimReasons',
  是否异常报备: 'isAbnormalReport',
  异常报备项: 'abnormalReportReasons',
  是否异常标记: 'isAbnormalMark',
  异常标记项: 'abnormalMarkEventNames',
  虚假报备是否成立: 'isBogusReport',
  虚假报备项: 'isBogusReportReasons',
  虚假标记是否成立: 'isBogusMark',
  虚假标记项: 'isBogusMarkReasons',
  取消发起方: 'cancelSponsor',
  取消发起原因: 'cancelReason',
  取消责任方: 'cancelDuty',
  用户投诉是否成立: 'isUserComplaint',
  用户投诉内容: 'userComplaintContent',
  用户投诉责任方: 'userComplaintDuty',
  商户投诉是否成立: 'isMerchantComplaint',
  商户投诉内容: 'merchantComplaintContent',
  商户投诉责任方: 'merchantComplaintDuty',
  用户评价责任方: 'userEvaluateDuty',
  用户评价等级: 'userEvaluateStar',
  商户评价责任方: 'merchantEvaluateDuty',
  商户评价等级: 'merchantEvaluateStar',
  是否高笔单: 'isHighValueOrder',
  是否二呼单: 'isSecondCallOrder',
};

/** 布尔列：导出用「是/否」，下游只认 0/false/空，需标准化为布尔。 */
export const BOOL_EN = new Set<string>([
  'isCheat',
  'isReverse',
  'isReassign',
  'isTransfer',
  'isAbnormalReport',
  'isAbnormalMark',
  'isIllegalFetch',
  'isIllegalArrival',
  'isIllegalComplete',
  'isClaim',
  'isBogusReport',
  'isBogusMark',
  'isOverPlatfromExpecteTime',
  'isOverUserT',
  'isOverCarrierT',
  'isHighValueOrder',
  'isSecondCallOrder',
  'isUserComplaint',
  'isMerchantComplaint',
]);

/** 时间列：导出是「YYYY-MM-DD HH:MM:SS」(北京时间) 字符串，下游期望毫秒时间戳整数。 */
export const TIME_EN = new Set<string>([
  'trackingCreatedAt',
  'acceptAtLast',
  'assignAtLast',
  'arriveAtLast',
  'currentCookingFinishAt',
  'fetchAtLast',
  'completeAt',
  'trackingFinishAt',
  'platformBookedAt',
  'platformPaidAt',
  'trackingCancelAt',
  'customerPredictDeliveryAt',
  'currentPredictDeliveryAt',
  'logisticsPredictDeliveryAt',
]);

/**
 * 枚举「分页编码 → 导出中文名」对照表（按风神英文真名做 key）。
 * 分页接口对部分枚举只回数字编码、导出回中文名，为让两路径显示一致，
 * 按列 key 做编码翻译。仅含实拉反推确认的一对一映射；未出现的编码原样透传（不猜测）。
 */
export const ENUM_DICT: Record<string, Record<string, string>> = {
  deliverTypeName: { '1': '即时单', '2': '预订单' },
  weatherGradeName: { '0': '正常' },
  cancelSponsor: { '1': '用户' },
  cancelDuty: { '3': '用户责' },
};

/**
 * 字符串时间 → 毫秒时间戳（按北京时间解析）。非时间值原样返回。
 * 导出路径用它把中文字段的时间列转成毫秒；分页路径的英文行本就是毫秒，不走这里。
 */
export function toMs(v: unknown): unknown {
  if (typeof v === 'number') return Math.floor(v);
  if (v instanceof Date) return v.getTime();
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if (!s) return v;
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(
    /^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (m) {
    const d = Date.UTC(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      m[6] ? Number(m[6]) : 0,
    );
    // 北京时间是 UTC+8：把"北京时间数字"当 UTC 算出的 epoch 多 8h，减去即得真实 UTC epoch。
    return d - 8 * 3600 * 1000;
  }
  return v;
}

// ───────────── 违规处罚区块：CSV 与 queryList 分页共用 ─────────────

/**
 * 违规处罚中文表头 → 风神英文真名（沿用已有落库字段 `violationOrderId` / `violationTime`）。
 * CSV 导出给中文表头，queryList 可能给中文或英文键，两条路径都按本表归一。
 * 英文键取 queryList 真实字段名（eventSource / bonus / appealExpireTime），
 * 使 CSV 落地行与 queryList 行同构，前端读库与刷新渲染走同一套列定义。
 */
export const VIOLATION_CN2EN: Record<string, string> = {
  违规编号: 'violationOrderId',
  违规来源: 'eventSource',
  违规时间: 'violationTime',
  运单号: 'trackingId',
  骑手ID: 'knightId',
  骑手名称: 'knightName',
  团队ID: 'teamId',
  团队名称: 'teamName',
  商ID: 'agencyId',
  商名称: 'agencyName',
  违规分类: 'violationCategory',
  违规类型: 'violationType',
  处罚: 'bonus',
  违规状态: 'violationStatus',
  违规原因: 'violationReason',
  申诉状态: 'appealStatus',
  剩余申诉时间: 'appealExpireTime',
};

/** 英文真名 → 中文表头（由 VIOLATION_CN2EN 反向生成，唯一事实源仍是正向表）。 */
export const VIOLATION_EN2CN: Record<string, string> = Object.fromEntries(
  Object.entries(VIOLATION_CN2EN).map(([cn, en]) => [en, cn]),
);

/**
 * 枚举「英文代码 → 中文值」。CSV 导出是中文值，queryList 是英文代码。
 * 落库时把 queryList 行的中文键也补成中文值，保证考核侧 Python 按中文值统计的口径不受写入路径影响。
 * 取值来自风神真实数据（按 violationOrderId 关联 download CSV 的中文，已覆盖全量样本）。
 */
export const VIOLATION_CODE_LABELS: Record<string, Record<string, string>> = {
  eventSource: {
    APOLLO: '运单平台',
    RIDER: '骑士作业',
    USER: '用户',
    SPZT: '索赔中台',
    KFPT: '开放平台',
  },
  violationCategory: {
    OVERTIME: '超时',
    COMPLAIN: '投诉',
    BAD_REVIEW: '差评',
    CLAIM: '餐货损',
    CANCEL: '取消',
  },
  violationType: {
    1001: '超时送达',
    1004: '违规取消',
    1005: '违规送达',
    1028: '少餐错餐 (差评)',
    1029: '送达不通知',
    1030: '不送上门 (差评)',
    1035: '未保持餐品完整（索赔）',
    1036: '送错位置（索赔）',
    1037: '少餐错餐（索赔）',
    1038: '丢餐（索赔）',
    1039: '提前点送达（索赔）',
    1053: '配送超时（索赔）',
  },
  violationStatus: {
    10: '成立',
    20: '不成立',
  },
  appealStatus: {
    10: '待申诉',
    20: '申诉中',
    30: '申诉成功',
    40: '申诉失败',
    50: '申诉过期',
    '-1': '不可申诉',
  },
};

/** 枚举「中文值 → 英文代码」（由 VIOLATION_CODE_LABELS 反向生成）。 */
export const VIOLATION_CODE_REVERSE: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(VIOLATION_CODE_LABELS).map(([field, map]) => [
    field,
    Object.fromEntries(Object.entries(map).map(([code, label]) => [label, code])),
  ]),
);

/** 把某字段的英文代码转成中文值；非代码（已是中文/空）原样返回。 */
export function violationCodeToLabel(field: string, value: string): string {
  return VIOLATION_CODE_LABELS[field]?.[value] ?? value;
}

/**
 * 上游行归一为「中文表头为规范键」的违规行：保留原字段，并把中英两侧都补成中文规范键。
 * 枚举字段的中文键统一补中文值（queryList 的英文代码经 VIOLATION_CODE_LABELS 翻译），
 * 这样 CSV 解析结果与分页接口结果同构，下游（考核看板 / 违规看板）无需按来源分支。
 */
export function normalizeViolationRow(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw || {})) {
    if (v !== undefined && v !== null) out[k] = typeof v === 'string' ? v : String(v);
  }
  for (const [cn, en] of Object.entries(VIOLATION_CN2EN)) {
    const v = raw?.[cn] ?? raw?.[en];
    if (v !== undefined && v !== null) {
      const s = typeof v === 'string' ? v.trim() : String(v);
      out[cn] = violationCodeToLabel(en, s);
    }
  }
  return out;
}

/** 违规业务主键（中英键都认），供去重与 PG (stat_date, violation_no) UPSERT 使用。 */
export function violationId(row: Record<string, unknown>): string {
  const v = row?.['违规编号'] ?? row?.[VIOLATION_CN2EN['违规编号']];
  return v === undefined || v === null ? '' : String(v).trim();
}
