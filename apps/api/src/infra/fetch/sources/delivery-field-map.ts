/**
 * 全项目「取数字段映射」唯一入口。
 *
 * 这是所有取数基座共用的映射字典，不限于运单：每个基座按区块往本文件追加自己的映射，
 * 任何导出或 API 取数的字段映射都只在这里维护，绝不在各自的取数服务里另建映射表或再抄一份。
 * 目前收录的是运单区块（风神运单有两套取数方式）：
 *   · 导出（DeliveryExportService）：xlsx 中文表头 → 中英双键行；
 *   · 分页 API（DeliveryQueryService / queryTracking）：直接返回英文键行。
 * 两者共用同一套字段映射：
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
