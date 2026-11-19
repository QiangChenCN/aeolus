/**
 * 取数基座目录（单一事实源）。
 *
 * 这里登记当前由 Nest 承载的取数服务：FetchModule 下的 13 个来源服务，
 * 以及散落在业务模块中的 4 个取数服务与 1 个钉钉 ID 取数基座。
 * 前端只渲染 GET /api/settings/sources 的下发结果，不硬编码任何基座清单。
 *
 * 注意：本目录只描述“现状元数据”，不提供动态执行能力。新增一个真正的取数服务
 * 仍需建服务文件 + FetchModule 注册 + Controller 端点（带 @RequirePerm）。
 */

export type SourceTrigger = '手动' | '定时' | '自动' | '任务管线' | '内部调用';
export type SourceAuth = 'aeolus' | 'quark' | 'dingtalk' | 'none';

export interface SourceCatalogItem {
  id: string;
  name: string;
  /** 展示标签（如「导出」），清单与详情均可见。 */
  tags?: string[];
  desc: string;
  /** 提供该取数能力的服务类名。 */
  service: string;
  /** 服务源文件（相对仓库根），仅详情可见。 */
  file: string;
  trigger: SourceTrigger;
  /** 对外 HTTP 入口；空数组表示只被内部服务调用。 */
  endpoints: string[];
  /** 依赖的登录态，供前端结合现有状态胶囊渲染徽标。 */
  dependsOn: SourceAuth;
  /** 主要落盘 / 数据表，仅详情可见。 */
  storage: string[];
  /** 关联看板或下游消费者。 */
  linked: string[];
  /** 原始层 kind（RAW_KINDS 子集）。 */
  rawKinds?: string[];
  /** 关联的任务 id（tasks.json）。 */
  tasks?: string[];
  /** 可用参数，仅详情可见。 */
  params?: string[];
  /** 补充说明，仅详情可见。 */
  notes?: string;
}

export const SOURCE_CATALOG: SourceCatalogItem[] = [
  {
    id: 'orders',
    name: '运单明细导出',
    tags: ['导出'],
    desc: '按时间窗拉取风神运单明细，仅走异步导出、无分页兜底，是运单/超时/考核等看板的共同取数入口。',
    service: 'OrdersFetchService',
    file: 'apps/api/src/infra/fetch/sources/orders-fetch.service.ts',
    trigger: '手动',
    endpoints: ['GET /api/fetch/orders', 'POST /api/fetch/refresh-orders', 'POST /api/fetch/orders-raw'],
    dependsOn: 'aeolus',
    storage: [],
    linked: ['运单明细', '配送超时', '考核看板', '标准达成'],
    rawKinds: ['orders'],
    params: [
      'team_ids：风神站点 ID 列表，导出时按站点过滤（数字数组或逗号分隔）；不传则全站',
      'date：日期（YYYY-MM-DD，北京时间，默认今天）',
      'time_field：时间字段，可选 trackingCreated / platformBooked / trackingFinish（默认 trackingFinish）',
      'start_ms / end_ms：毫秒时间窗（orders-raw 端点）；不传时按 date 取全天',
      'teams：站点列表（refresh-orders 端点，导出时按这些站点过滤并落盘）',
    ],
    notes: '服务本身不落盘，只返回行数据。\n下游调用方：\n标准达成阶段 0 → runtime/raw/orders_*（按站点分组落 JSON 文件）\n运单明细看板 → PG delivery_realtime（整日覆盖写）\n配送超时看板 → PG delivery_realtime（整日覆盖写）\n考核看板 → PG delivery_realtime（实时整日覆盖）/ PG delivery（每日历史回补 UPSERT）',
  },
  {
    id: 'delivery-query',
    name: '运单分页查询原语',
    desc: '运单查询接口与时间字段口径（trackingCreated / platformBooked / trackingFinish）封装；仅在导出后对账时打一次第 1 页。',
    service: 'DeliveryQueryService',
    file: 'apps/api/src/infra/fetch/sources/delivery-query.service.ts',
    trigger: '内部调用',
    endpoints: [],
    dependsOn: 'aeolus',
    storage: [],
    linked: ['OrdersFetchService'],
    notes: '无对外端点，由 OrdersFetchService 调用。',
  },
  {
    id: 'delivery-export',
    name: '运单导出解析',
    desc: '运单三段式导出接口的请求与 xlsx 解析；这是运单数据的唯一来源，失败或残缺直接报错。',
    service: 'DeliveryExportService',
    file: 'apps/api/src/infra/fetch/sources/delivery-export.service.ts',
    trigger: '内部调用',
    endpoints: [],
    dependsOn: 'aeolus',
    storage: [],
    linked: ['OrdersFetchService'],
  },
  {
    id: 'violation-csv',
    name: '违规 CSV 取数',
    desc: '按时间窗拉取违规处罚 CSV，供标准达成与考核看板复用。',
    service: 'ViolationFetchService',
    file: 'apps/api/src/infra/fetch/sources/violation-fetch.service.ts',
    trigger: '内部调用',
    endpoints: ['POST /api/fetch/violation-csv'],
    dependsOn: 'aeolus',
    storage: ['runtime/raw/violation_*', 'PG violation_realtime', 'PG violation'],
    linked: ['标准达成', '考核看板'],
    rawKinds: ['violation'],
  },
  {
    id: 'violation-list',
    name: '违规分页取数',
    desc: '违规明细分页 JSON 接口，支持单日/区间查询；另有每日定时回补历史表。',
    service: 'ViolationListFetchService',
    file: 'apps/api/src/infra/fetch/sources/violation-list-fetch.service.ts',
    trigger: '定时',
    endpoints: ['POST /api/fetch/violation-list', 'POST /api/fetch/violation-range'],
    dependsOn: 'aeolus',
    storage: ['PG violation'],
    linked: ['违规处罚看板', '考核看板'],
    notes: '每日 03:00 回补任务写入历史表 violation。',
  },
  {
    id: 'attendance',
    name: '实时考勤取数',
    desc: '按站点与时间点拉取在线/考勤快照，标准达成链路按站调用。',
    service: 'AttendanceFetchService',
    file: 'apps/api/src/infra/fetch/sources/attendance-fetch.service.ts',
    trigger: '内部调用',
    endpoints: ['POST /api/fetch/attendance-raw'],
    dependsOn: 'aeolus',
    storage: ['runtime/raw/att_*'],
    linked: ['标准达成'],
    rawKinds: ['att'],
  },
  {
    id: 'schedule',
    name: '排班统计取数',
    desc: '按站点与日期拉取排班目标数据，标准达成链路按站调用。',
    service: 'ScheduleFetchService',
    file: 'apps/api/src/infra/fetch/sources/schedule-fetch.service.ts',
    trigger: '内部调用',
    endpoints: ['POST /api/fetch/sched-raw'],
    dependsOn: 'aeolus',
    storage: ['runtime/raw/sched_*'],
    linked: ['标准达成'],
    rawKinds: ['sched'],
  },
  {
    id: 'board',
    name: '商站任务看板取数',
    desc: '拉取商站任务列表原始 JSON，供任务管线渲染图片并推送钉钉。',
    service: 'BoardFetchService',
    file: 'apps/api/src/infra/fetch/sources/board-fetch.service.ts',
    trigger: '任务管线',
    endpoints: ['POST /api/run（task_id=task_board）'],
    dependsOn: 'aeolus',
    storage: ['runtime/jobs/board/out/task_list_raw.json'],
    linked: ['任务中心'],
    tasks: ['task_board'],
  },
  {
    id: 'contact-im',
    name: 'IM 电联取数',
    desc: '从 Quark/FBI 报表拉取电联与 IM 回复明细，直接返回看板所需行列结构。',
    service: 'ContactImFetchService',
    file: 'apps/api/src/infra/fetch/sources/contact-im-fetch.service.ts',
    trigger: '手动',
    endpoints: ['POST /api/fetch/contact-im'],
    dependsOn: 'quark',
    storage: [],
    linked: ['IM 电联看板'],
    notes: '报表 ID 473269 / 数据集 77667002，依赖 Quark DA cookie。',
  },
  {
    id: 'teams',
    name: '风神站点目录',
    desc: '拉取全量站点目录并落盘，5 分钟缓存；风神不可达时回落本地缓存，前端与 Python 共用。',
    service: 'TeamsFetchService',
    file: 'apps/api/src/infra/fetch/sources/teams-fetch.service.ts',
    trigger: '内部调用',
    endpoints: ['GET /api/fetch/teams', 'GET /api/teams'],
    dependsOn: 'aeolus',
    storage: ['runtime/teams.json'],
    linked: ['站点配置', '各看板站点选择器', 'Python 计算侧'],
    notes: '?force=1 可跳过缓存强制重取。',
  },
  {
    id: 'assessment-delivery',
    name: '考核运单取数',
    desc: '考核看板专用的实时/历史运单取数，支持手动刷新、自动刷新与每日 04:00 历史回补。',
    service: 'AssessmentDeliveryFetchService',
    file: 'apps/api/src/modules/assessment/assessment-delivery-fetch.service.ts',
    trigger: '自动',
    endpoints: ['POST /api/assessment-fetch/delivery', 'POST /api/assessment-fetch/backfill-history'],
    dependsOn: 'aeolus',
    storage: ['PG delivery_realtime', 'PG delivery', 'PG assessment_backfill_state'],
    linked: ['考核看板'],
    notes: '手动刷新只写实时表；历史表仅由每日回补任务写入。',
  },
  {
    id: 'assessment-violation',
    name: '考核违规取数',
    desc: '考核看板专用的实时/历史违规取数，支持手动刷新、自动刷新与每日 04:00 历史回补。',
    service: 'AssessmentViolationFetchService',
    file: 'apps/api/src/modules/assessment/assessment-violation-fetch.service.ts',
    trigger: '自动',
    endpoints: ['POST /api/assessment-fetch/violation', 'POST /api/assessment-fetch/backfill-history'],
    dependsOn: 'aeolus',
    storage: ['PG violation_realtime', 'PG violation', 'PG assessment_backfill_state'],
    linked: ['考核看板'],
    notes: '历史回补走 UPSERT（upsertViolationDay），幂等。',
  },
  {
    id: 'visit',
    name: '商家拜访取数',
    desc: '拉取考核口径的商家拜访/回访记录，自动取数时尽力而为调用。',
    service: 'VisitFetchService',
    file: 'apps/api/src/modules/assessment/visit-fetch.service.ts',
    trigger: '自动',
    endpoints: ['POST /api/assessment-fetch/visit'],
    dependsOn: 'aeolus',
    storage: ['PG visit_history'],
    linked: ['考核看板'],
  },
  {
    id: 'delivery-timeout',
    name: '配送超时刷新取数',
    desc: '配送超时看板刷新时拉取运单明细并写入实时表，供 Python 计算服务读取。',
    service: 'DeliveryTimeoutRefreshService',
    file: 'apps/api/src/modules/delivery-timeout/delivery-timeout-refresh.service.ts',
    trigger: '手动',
    endpoints: ['POST /api/delivery-timeout/refresh'],
    dependsOn: 'aeolus',
    storage: ['PG delivery_realtime'],
    linked: ['配送超时看板'],
  },
  {
    id: 'dingtalk-id',
    name: '钉钉 ID 取数基座',
    desc: '全系统唯一的 openDingTalkId 获取入口：先读缓存，未命中再按姓名搜索通讯录，不写花名册。',
    service: 'DingtalkIdBaseService',
    file: 'apps/api/src/modules/dingtalk-id/dingtalk-id-base.service.ts',
    trigger: '任务管线',
    endpoints: ['POST /api/notify/station-managers/resolve（手动解析入口）'],
    dependsOn: 'dingtalk',
    storage: ['runtime/manager_ids_cache.json'],
    linked: ['钉钉通知', '站点负责人配置', '任务管线'],
    notes: '@Global() 模块；读 staff_roster 的手机号仅用于同名消歧。',
  },
  {
    id: 'orange-storm',
    name: '橙色风暴取数',
    desc: '按 hitTime 时间窗分页拉取 QC 判定列表；申诉任务复用同一基座。',
    service: 'OrangeStormFetchService',
    file: 'apps/api/src/infra/fetch/sources/orange-storm-fetch.service.ts',
    trigger: '任务管线',
    endpoints: ['POST /api/run（task_id=orange_storm / orange_storm_appeal）'],
    dependsOn: 'aeolus',
    storage: ['runtime/jobs/orange_storm/out/', 'runtime/jobs/orange_storm_appeal/out/'],
    linked: ['任务中心'],
    tasks: ['orange_storm', 'orange_storm_appeal'],
  },
  {
    id: 'ruledoc',
    name: '规则文档取数',
    desc: '按规则 ID 拉取规则文档正文并落盘为 HTML/Markdown。',
    service: 'RuledocFetchService',
    file: 'apps/api/src/infra/fetch/sources/ruledoc-fetch.service.ts',
    trigger: '任务管线',
    endpoints: ['POST /api/run（task_id=rule_doc）'],
    dependsOn: 'aeolus',
    storage: ['runtime/jobs/ruledoc/out/rule_doc_*'],
    linked: ['任务中心'],
    tasks: ['rule_doc'],
  },
  {
    id: 'equipment',
    name: '装备点亮取数',
    desc: '拉取骑手装备数据并生成点亮/未点亮 CSV，供通知链路使用。',
    service: 'EquipmentFetchService',
    file: 'apps/api/src/infra/fetch/sources/equipment-fetch.service.ts',
    trigger: '任务管线',
    endpoints: ['POST /api/run（task_id=task_equipment）'],
    dependsOn: 'aeolus',
    storage: ['runtime/jobs/equipment/out/rider_equipment_*'],
    linked: ['任务中心'],
    tasks: ['task_equipment'],
  },
];
