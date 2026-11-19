import { createRouter, createWebHistory } from 'vue-router';
import MainLayout from '../layouts/MainLayout.vue';
import LoginView from '../features/login/LoginView.vue';
import HomeView from '../features/home/HomeView.vue';
import TaskCenterView from '../features/task-center/TaskCenterView.vue';
import HistoryView from '../features/history/HistoryView.vue';
import PresetView from '../features/preset/PresetView.vue';
import CronView from '../features/cron/CronView.vue';
import AutoRunsView from '../features/cron/AutoRunsView.vue';
import StandardView from '../features/standard/StandardView.vue';
import AssessServiceView from '../features/assess-service/AssessServiceView.vue';
import AssessStandardView from '../features/assess-standard/AssessStandardView.vue';
import AssessPeriodView from '../features/assess-period/AssessPeriodView.vue';
import AssessWeatherView from '../features/assess-weather/AssessWeatherView.vue';
import AssessView from '../features/assess/AssessView.vue';
import AttendPeriodView from '../features/attend-period/AttendPeriodView.vue';
import OverviewView from '../features/overview/OverviewView.vue';
import AssessmentBoardView from '../features/assessment-board/AssessmentBoardView.vue';
import DeliveryTimeoutView from '../features/delivery-timeout/DeliveryTimeoutView.vue';
import DeliveryView from '../features/delivery/DeliveryView.vue';
import ImContactView from '../features/im-contact/ImContactView.vue';
import UnsatisfiedView from '../features/unsatisfied/UnsatisfiedView.vue';
import GroupsView from '../features/groups/GroupsView.vue';
import UsersView from '../features/users/UsersView.vue';
import RolesView from '../features/roles/RolesView.vue';
import PolicyView from '../features/policy/PolicyView.vue';
import SystemSettingsView from '../features/system-settings/SystemSettingsView.vue';
import SettingsTabShell from '../features/system-settings/SettingsTabShell.vue';
import SourceRegistryView from '../features/source-registry/SourceRegistryView.vue';
import RbacView from '../features/rbac/RbacView.vue';
import DingtalkSettingsView from '../features/dingtalk-settings/DingtalkSettingsView.vue';
import AeolusSettingsView from '../features/aeolus-settings/AeolusSettingsView.vue';
import MinioSettingsView from '../features/minio-settings/MinioSettingsView.vue';
import BotRobotView from '../features/bot-robot/BotRobotView.vue';
import BotInstancesView from '../features/bot-instances/BotInstancesView.vue';
import BotAssemblyView from '../features/bot-assembly/BotAssemblyView.vue';
import ProfileInfoView from '../features/profile-info/ProfileInfoView.vue';
import RiderManageView from '../features/rider-manage/RiderManageView.vue';
import StaffManageView from '../features/staff-manage/StaffManageView.vue';
import StationConfigView from '../features/hr-org/StationConfigView.vue';
import PositionSettingsView from '../features/hr-org/PositionSettingsView.vue';
import NotFoundView from '../features/not-found/NotFoundView.vue';
import OperationLogView from '../features/operation-log/OperationLogView.vue';
import { useAuthStore } from '@shared/stores/auth.js';

// 单一出口架构：所有受保护页挂在 MainLayout 之下（壳 + 内部 router-view），
// 登录页为顶层独立路由。避免同一组件内出现多个未命名 router-view 导致匹配错乱。
const routes = [
  { path: '/login', name: 'login', component: LoginView, meta: { public: true, title: '登录' } },
  {
    path: '/',
    component: MainLayout,
    children: [
      // 根路径直接渲染首页（首页即根路由 /）
      { path: '', name: 'home', component: HomeView, meta: { title: '首页', kind: 'home' } },
      { path: 'tasks', name: 'tasks-all', component: TaskCenterView, meta: { title: '全部任务', kind: 'tasks', id: 'all' } },
      { path: 'history', name: 'history', component: HistoryView, meta: { title: '运行记录', kind: 'history', id: '' } },
      { path: 'preset', name: 'preset', component: PresetView, meta: { title: '预设' } },
      { path: 'cron', name: 'cron', component: CronView, meta: { title: '定时任务', kind: 'cron' } },
      { path: 'cron-runs', name: 'cron-runs', component: AutoRunsView, meta: { title: '自动任务', kind: 'cron-runs' } },
      { path: 'assess', name: 'assess', component: AssessView, redirect: { name: 'assess-service' }, meta: { title: '考核设置', kind: 'assess', perm: 'config:write' },
        children: [
          { path: 'service', name: 'assess-service', component: AssessServiceView, meta: { title: '服务质量设置', kind: 'assessService', id: '' } },
          { path: 'standard', name: 'assess-standard', component: AssessStandardView, meta: { title: '标准达成设置', kind: 'assessStandard', id: '' } },
          { path: 'period', name: 'assess-period', component: AssessPeriodView, meta: { title: '时段设置', kind: 'assessPeriod', id: '' } },
          { path: 'weather', name: 'assess-weather', component: AssessWeatherView, meta: { title: '天气设置', kind: 'assessWeather', id: '' } },
        ] },
      { path: 'standard', name: 'standard', component: StandardView, meta: { title: '标准达成', kind: 'standard', id: '' } },
      { path: 'attend-period', name: 'attend-period', component: AttendPeriodView, meta: { title: '时段出勤', kind: 'attendPeriod', id: '' } },
      { path: 'overview', name: 'overview', component: OverviewView, meta: { title: '总览' } },
      { path: 'assessment', name: 'assessment', component: AssessmentBoardView, meta: { title: '考核看板', kind: 'assessment', id: '' } },
      { path: 'delivery', name: 'delivery', component: DeliveryView, meta: { title: '运单明细', kind: 'delivery', id: '' } },
      { path: 'timeout', name: 'timeout', component: DeliveryTimeoutView, meta: { title: '配送超时', kind: 'timeout', id: '' } },
      { path: 'im-contact', name: 'im-contact', component: ImContactView, meta: { title: 'IM 电联', kind: 'imContact', id: '' } },
      { path: 'unsatisfied', name: 'unsatisfied', component: UnsatisfiedView, meta: { title: '违规处罚', kind: 'unsatisfied', id: '' } },
      { path: 'operation-log', name: 'operation-log', component: OperationLogView, meta: { title: '操作日志', kind: 'operationLog', id: '', perm: 'admin:roles' } },
      { path: 'groups', name: 'groups', component: GroupsView, meta: { title: '群组' } },
      { path: 'settings', name: 'system-settings', component: SystemSettingsView, meta: { title: '系统设置', kind: 'syscfg' } },
      // 钉钉集成：留在系统设置，承载授权 / SSO / DWS（平台侧配置，与机器人实例配置解耦）。
      {
        path: 'settings/dingtalk',
        name: 'dingtalk-settings',
        component: DingtalkSettingsView,
        meta: { title: '三方集成', kind: 'sys-dingtalk', perm: 'admin:bot' },
      },
      // 机器人：一级分组，含全局配置（置首）、凭证管理与实例管理；差异化渠道配置仍在各自系统设置页。
      // 纯分组路由（无 component / 无 meta.tabs），子页直接渲染，唯一入口在侧栏二级菜单。
      {
        path: 'bot',
        name: 'bot-settings',
        redirect: { name: 'bot-assembly' },
        children: [
          { path: 'assembly', name: 'bot-assembly', component: BotAssemblyView, meta: { title: '全局配置', kind: 'botcfg', id: 'assembly', perm: 'admin:bot' } },
          { path: 'credentials', name: 'bot-credentials', component: BotRobotView, meta: { title: '凭证管理', kind: 'botcfg', id: 'credentials', perm: 'admin:bot' } },
          { path: 'instances', name: 'bot-instances', component: BotInstancesView, meta: { title: '实例管理', kind: 'botcfg', id: 'instances', perm: 'admin:bot' } },
        ] },
      // 外部服务凭证：原「风神设置 + MinIO 设置」合并（均为一次性外部凭证写入，极低频）
      {
        path: 'settings/credentials',
        name: 'credentials-settings',
        component: SettingsTabShell,
        redirect: { name: 'credentials-aeolus' },
        meta: {
          title: '外部凭证', kind: 'sys-credentials', perms: ['admin:aeolus', 'admin:minio'],
          tabs: [
            { label: '风神凭证', to: '/settings/credentials/aeolus' },
            { label: 'MinIO 凭证', to: '/settings/credentials/minio' },
          ],
        },
        children: [
          { path: 'aeolus', name: 'credentials-aeolus', component: AeolusSettingsView, meta: { title: '风神凭证', kind: 'sys-aeolus', id: '', perm: 'admin:aeolus' } },
          { path: 'minio', name: 'credentials-minio', component: MinioSettingsView, meta: { title: 'MinIO 凭证', kind: 'sys-minio', id: '', perm: 'admin:minio' } },
        ] },
      // 取数基座目录：只读盘点页，所有登录用户可看（详情内部信息由后端按权限收敛）
      { path: 'settings/sources', name: 'sources', component: SourceRegistryView, meta: { title: '取数基座', kind: 'sys-sources', perm: 'view' } },
      // 旧路径深链兼容：机器人相关地址统一指向新一级模块
      { path: 'settings/aeolus', redirect: { name: 'credentials-aeolus' } },
      { path: 'settings/minio', redirect: { name: 'credentials-minio' } },
      { path: 'settings/dingtalk/auth', redirect: { name: 'dingtalk-settings' } },
      { path: 'settings/dingtalk/robot', redirect: { name: 'bot-credentials' } },
      { path: 'settings/dingtalk/credentials', redirect: { name: 'bot-credentials' } },
      { path: 'settings/dingtalk/global', redirect: { name: 'bot-instances' } },
      { path: 'settings/dingtalk/instance', redirect: { name: 'bot-instances' } },
      { path: 'settings/dingtalk/instances', redirect: { name: 'bot-instances' } },
      { path: 'bot/dingtalk', redirect: { name: 'dingtalk-settings' } },
      { path: 'bot/global', redirect: { name: 'bot-instances' } },
      { path: 'bot/robot', redirect: { name: 'bot-credentials' } },
      { path: 'bot/instance', redirect: { name: 'bot-instances' } },
      // 站点负责人设置已并入「人事管理→组织架构」，旧地址重定向保证收藏链接可用
      { path: 'settings/managers', redirect: '/hr/org' },
      { path: 'riders', name: 'riders', component: RiderManageView, meta: { title: '骑手管理', kind: 'riders', id: '' } },
      { path: 'staff', name: 'staff', component: StaffManageView, meta: { title: '人员管理', kind: 'staff', id: '' } },
      // 原组织架构页四页签拆分：站点配置（业务线/城市/站点归属 + 负责人通知路由）、岗位设置（独立二级菜单）
      { path: 'hr/org', name: 'hr-org', component: StationConfigView, meta: { title: '站点配置', kind: 'hr-org', id: '' } },
      { path: 'hr/positions', name: 'hr-org-positions', component: PositionSettingsView, meta: { title: '岗位设置', kind: 'hr-org-positions', id: '' } },
      {
        path: 'settings/rbac',
        name: 'rbac',
        component: RbacView,
        redirect: { name: 'rbac-users' },
        meta: { title: '权限管理', kind: 'rbac', perm: 'admin:users' },
        children: [
          { path: 'users', name: 'rbac-users', component: UsersView, meta: { title: '账号管理', kind: 'rbac-users', perm: 'admin:users' } },
          { path: 'roles', name: 'rbac-roles', component: RolesView, meta: { title: '角色管理', kind: 'rbac-roles', perm: 'admin:roles' } },
          { path: 'policy', name: 'rbac-policy', component: PolicyView, meta: { title: '密码策略', kind: 'rbac-policy', perm: 'admin:policy' } },
        ],
      },
      {
        path: 'settings/profile',
        name: 'profile',
        component: ProfileInfoView,
        meta: { title: '个人中心', kind: 'profile' },
      },
    ],
  },
  // 兜底：未知路径（含拼写错误/已删除路由）渲染 404 页面，而非空白或静默跳首页
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView, meta: { title: '页面不存在' } },
];

// History 模式（无 #）：深链接需服务端回退到 index.html。
//   · 开发环境：Vite(appType='spa') 自带 history 回退，且会把 index.html 里的相对资源
//     重写为绝对路径，嵌套路由（/bot/global）也不会取错资源。
//   · 生产环境：由 Nest 的 SPA 回退中间件负责（apps/api/src/main.ts）。
//     缺少该回退时，刷新 /tasks 这类深层路由会 404。
const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 全局鉴权守卫：未登录访问受保护页 → 重定向到登录页并保留来源；
// 已登录访问登录页 → 跳回首页；引导阶段确保会话校验完成。
router.beforeEach(async (to) => {
  const auth = useAuthStore();
  // 必须无条件 await：bootstrap 内部已幂等（共享 Promise），
  // 这里若改成「只在未引导时才等」，就会与 App.vue 的 onMounted 抢跑，
  // 拿到未填充的登录态而误判未登录。
  await auth.bootstrap();
  // 非阻塞校验权限快照：管理员改了角色权限后，前端缓存的 perms 会自动跟上（15 秒节流）。
  void auth.refreshPermsIfChanged();

  // 初始密码未修改：后端已拦截所有业务接口，前端同步把用户钉在个人中心改密
  if (auth.authenticated && auth.mustChange && to.path !== '/settings/profile') {
    return { path: '/settings/profile' };
  }

  if (to.meta && to.meta.public) {
    if (auth.authenticated) return { path: '/' };
    return true;
  }
  if (!auth.authenticated) {
    const redirect = to.fullPath && to.fullPath !== '/' ? to.fullPath : null;
    return redirect
      ? { path: '/login', query: { redirect } }
      : { path: '/login' };
  }
  // 权限点守卫：仅体验层收敛，真正的越权防护在后端 AccessGuard。
  // 无权限时回首页，而不是跳登录页（会话仍有效，跳登录会造成"反复登录"错觉）。
  // meta.perms 为「任一满足即可」的权限点数组（用于合并后的设置页，如外部服务凭证）。
  if (to.meta && to.meta.perm && !auth.hasPerm(to.meta.perm)) {
    return { path: '/' };
  }
  if (to.meta && Array.isArray(to.meta.perms) && to.meta.perms.length && !to.meta.perms.some((p) => auth.hasPerm(p))) {
    return { path: '/' };
  }
  return true;
});

// 站点标题统一为「Aeolus WorkBench - <页面标题>」，页面标题取当前最深匹配路由的 meta.title。
// 放在 afterEach：此时重定向已解析完毕，to 是最终落地的路由，避免拿到中间重定向项。
const SITE_TITLE = 'Aeolus WorkBench';
router.afterEach((to) => {
  document.title = to.meta.title ? `${SITE_TITLE} - ${to.meta.title}` : SITE_TITLE;
});

export default router;
