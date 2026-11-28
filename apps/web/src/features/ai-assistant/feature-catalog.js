/**
 * DSH（DeepSeek Harness）功能全集与本项目集成状态。
 *
 * 这是「功能地图」页的唯一数据源，新增/扩展功能只改这里，不改页面组件。
 * status 取值：
 *   ready   已实现并可用
 *   planned 尚未实现，可后续扩展（注明扩展方向）
 *   excluded 主动不接入（安全 / 资源 / 与本项目形态不符），非遗漏
 */
export const AI_FEATURE_CATEGORIES = [
  {
    key: 'runtime',
    name: '运行时与 Profile',
    items: [
      { name: 'sdk-minimal profile', desc: '独立极简 agent：模型 + 会话 + 最小工具，不继承 dsh-base', status: 'ready', note: '当前唯一使用的 profile' },
      { name: 'web profile（完整工具集）', desc: '继承 dsh-base：settings / web 工具 / subagent / jobs 等', status: 'ready', note: '官方 WebUI 使用 web profile，已随同域代理集成' },
      { name: 'web profile / 官方 WebUI', desc: 'DSH 官方 React 界面：会话、审批、计划、工具卡片、插件管理', status: 'ready', note: '同域 /ai/ 反向代理挂载，非 iframe；复用 Aeolus 会话与 task:run 权限' },
      { name: 'headless profile', desc: '一次性任务运行器，打印最终答案后退出', status: 'planned', note: '若未来做定时 AI 任务可接入' },
      { name: 'acp profile', desc: 'Agent Client Protocol stdio 自动化服务', status: 'planned', note: '供第三方 ACP 客户端调用时再接' },
      { name: 'Desktop 客户端', desc: 'DSH 官方桌面应用（Electron）', status: 'excluded', note: '与本项目 Web 工作台形态不符' },
      { name: 'Profile 分层与 patch 热重载', desc: 'bundle / profile / home patch 叠加，配置热更新', status: 'ready', note: '已用 aeolus-safety.patch.yml 关闭 shell 与日志上传' },
    ],
  },
  {
    key: 'model',
    name: '模型与凭据',
    items: [
      { name: 'DeepSeek 官方 provider', desc: 'deepseek-official + deepseek-v4-flash', status: 'ready', note: '由 SDK 内置适配器提供' },
      { name: '自定义 OpenAI 兼容端点', desc: 'base_url 覆盖，接自建/代理模型服务', status: 'ready', note: '系统设置 → AI 设置填写 Base URL' },
      { name: '其他 provider（OpenAI / Anthropic / 本地模型）', desc: '注册额外模型适配器到 ctx.llm', status: 'planned', note: '需要多模型切换时扩展' },
      { name: 'UI 维护 API Key', desc: '系统设置保存，落盘 runtime/.ai_settings.json（0600）', status: 'ready', note: 'env 兜底，明文永不回显' },
      { name: '托管凭据 / settings 页', desc: 'DSH 自带的凭据托管与设置面板', status: 'excluded', note: '由 Aeolus 自己的系统设置页承担' },
    ],
  },
  {
    key: 'session',
    name: '会话与上下文',
    items: [
      { name: '多轮对话 + JSONL 持久化', desc: '会话事件落 DSH_HOME/sessions，按 session_id 续接', status: 'ready', note: '前端保存 sessionId，下次任务继续' },
      { name: '自动上下文压缩', desc: '上下文压力到达阈值时自动摘要旧历史', status: 'ready', note: 'sdk-minimal 内置 compaction-basic' },
      { name: '会话列表 / 恢复 / 标题生成', desc: '查看历史会话、重命名、恢复指定会话', status: 'ready', note: '官方 WebUI 会话面板原生提供' },
      { name: '跨 Session 消息', desc: 'Agent 向另一个会话发送消息并等待', status: 'ready', note: '官方 WebUI profile 支持（可选 overlay 已随 web bundle）' },
      { name: '目标（/goal）与计划模式（/plan）', desc: '同会话内持续推进目标、计划审阅', status: 'ready', note: '官方 WebUI 侧栏计划卡片与审批流原生提供' },
    ],
  },
  {
    key: 'tools',
    name: '工具与执行',
    items: [
      { name: '工具注册表 / 工具循环', desc: 'ctx.tools + agent loop，模型按 schema 调用工具', status: 'ready', note: 'sdk-minimal 内核提供，当前仅内置最小工具' },
      { name: 'MCP 客户端 / 资源', desc: '挂载 MCP server，把外部能力作为工具暴露给模型', status: 'ready', note: '官方 WebUI profile 原生挂载 MCP；后续可把 Aeolus 取数做成 MCP 工具' },
      { name: 'Web 搜索 / 抓取工具', desc: 'web_search / web_fetch', status: 'ready', note: '官方 WebUI 设置页可配置；注意数据出网风险' },
      { name: '后台任务（jobs）', desc: 'job_* 工具启动/查询/停止后台作业', status: 'ready', note: '官方 WebUI 侧栏可用；与 Aeolus 任务中心职责需划清' },
      { name: 'shell（bash / pwsh）', desc: '模型执行命令、读写服务器文件', status: 'excluded', note: '安全原因主动关闭（patch disabled），官方安全声明明确风险' },
      { name: '文件读写 / 编辑 / 图片读取', desc: 'tool-fs 的 read/write/edit/readImage', status: 'excluded', note: 'patch 全部关闭；agent 无服务器文件访问能力' },
      { name: '审批策略 / 沙箱', desc: 'approval policy + sandbox backend', status: 'excluded', note: '当前无执行类工具，无需审批；未来开放 shell 前必须先接审批' },
    ],
  },
  {
    key: 'collab',
    name: '协作与扩展',
    items: [
      { name: '子代理（subagent）', desc: '主 agent 派生子任务并行执行', status: 'ready', note: '官方 WebUI 侧栏 Subagent 控件可用' },
      { name: 'Team 模式', desc: '多智能体共享任务列表协作', status: 'ready', note: '官方 WebUI 模型菜单按 Session 开启' },
      { name: '自定义插件（Cordis）', desc: '编写 dsh 插件注册模型/工具/事件', status: 'planned', note: '生态完整但需跟 DSH 版本；按需开发 Aeolus 专用插件' },
      { name: '插件市场 / 插件管理器', desc: '官方第三方插件发现与安装', status: 'ready', note: '官方 WebUI 侧栏原生可用；按你的策略安装走人工审批' },
    ],
  },
  {
    key: 'ops',
    name: '运维与集成形态',
    items: [
      { name: '单飞锁（并发=1）', desc: 'compute 侧 threading.Lock，防止 OOM', status: 'ready', note: '2核4G 资源限制下的硬约束' },
      { name: '隔离 Harness home / workspace', desc: '每次会话独立目录，位于 apps/api/runtime/dsh-*', status: 'ready', note: 'gitignored，路径穿越由 session id 白名单校验' },
      { name: '会话日志外传关闭', desc: 'session-log-deepseek.enabled=false', status: 'ready', note: '避免运单/违规数据随会话日志出网' },
      { name: 'Aeolus 原生对话页（保留备用）', desc: 'apps/web 内 Vue 页面，手搓简化版', status: 'excluded', note: '主入口已切到官方 WebUI；原生页保留供故障回退/轻量调用' },
      { name: 'SSE 流式输出', desc: '逐 token 推送到前端', status: 'ready', note: '官方 WebUI 原生支持流式；轻量 API 端点仍为整段返回' },
      { name: 'OpenTelemetry 遥测', desc: 'trace 上报 Collector', status: 'planned', note: '项目已有 OTel 基础设施，可复用' },
      { name: 'Office 运行时（docx/xlsx 转换）', desc: 'deepseek_harness.office 的独立 Office 能力', status: 'planned', note: '与 Aeolus 现有 xlsx 导出职责重叠，暂缓' },
    ],
  },
];

export const STATUS_META = {
  ready: { label: '已实现', type: 'success' },
  planned: { label: '待扩展', type: 'warning' },
  excluded: { label: '不接入', type: 'info' },
};
