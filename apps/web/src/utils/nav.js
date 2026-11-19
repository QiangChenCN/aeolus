import { useRoute } from 'vue-router';
import { useTasksStore } from '../stores/tasks.js';
import { useRunsStore } from '../stores/runs.js';
import { useAppStore } from '../stores/app.js';

export function navTo(it) {
  switch (it.kind) {
    case 'home': return '/';
    case 'tasks': return '/tasks';
    case 'history': return '/history';
    case 'standard': return '/standard';
    case 'attendPeriod': return '/attend-period';
    case 'assessment': return '/assessment';
    case 'delivery': return '/delivery';
    case 'timeout': return '/timeout';
    case 'imContact': return '/im-contact';
    case 'unsatisfied': return '/unsatisfied';
    case 'cron': return '/cron';
    case 'cron-runs': return '/cron-runs';
    case 'assessService': return '/assess/service';
    case 'assessStandard': return '/assess/standard';
    case 'assessPeriod': return '/assess/period';
    case 'assessWeather': return '/assess/weather';
    case 'assess': return '/assess';
    case 'rbac-users': return '/settings/rbac/users';
    case 'rbac-roles': return '/settings/rbac/roles';
    case 'rbac-policy': return '/settings/rbac/policy';
    case 'rbac-pw': return '/settings/rbac/pw';
    case 'rbac': return '/settings/rbac';
    case 'profile': return '/settings/profile';
    case 'syscfg': return '/settings';
    case 'sys-dingtalk': return '/settings/dingtalk';
    case 'sys-credentials': return '/settings/credentials';
    case 'sys-managers': return '/hr/org';
    case 'riders': return '/riders';
    case 'staff': return '/staff';
    case 'hr-org': return '/hr/org';
    case 'hr-org-positions': return '/hr/positions';
    case 'operationLog': return '/operation-log';
    case 'botcfg': return '/settings/dingtalk/' + (it.id || 'global');
    default: return '/';
  }
}

export function navMatch(it) {
  const route = useRoute();
  const kind = route.meta && route.meta.kind;
  const id = route.params.groupId != null ? route.params.groupId : (route.meta && route.meta.id);
  return it.kind === kind && (it.id || '') === (id != null ? id : '');
}

export function navIsActive(it) {
  if (it.type === 'parent') {
    return it.children.some((c) => navIsActive(c)) || !!(it.kind && navMatch(it));
  }
  // 权限管理（侧栏叶子项）：其下任一 rbac-* 子页命中即高亮
  if (it.kind === 'rbac') {
    const r = useRoute();
    const k = r.meta && r.meta.kind;
    return typeof k === 'string' && k.startsWith('rbac');
  }
  // 考核设置（侧栏叶子项，位于数据看板下）：其下任一 assess* 子页命中即高亮
  if (it.kind === 'assess') {
    const r = useRoute();
    const k = r.meta && r.meta.kind;
    return k === 'assess' || k === 'assessService' || k === 'assessStandard' || k === 'assessPeriod' || k === 'assessWeather';
  }
  // 钉钉集成（侧栏叶子项）：其下任一子页（钉钉授权 / botcfg 各子页）命中即高亮
  if (it.kind === 'sys-dingtalk') {
    const r = useRoute();
    const k = r.meta && r.meta.kind;
    return k === 'sys-dingtalk' || k === 'dingtalk-auth' || k === 'botcfg';
  }
  // 外部服务凭证（侧栏叶子项）：其下任一子页（风神 / MinIO）命中即高亮
  if (it.kind === 'sys-credentials') {
    const r = useRoute();
    const k = r.meta && r.meta.kind;
    return k === 'sys-credentials' || k === 'sys-aeolus' || k === 'sys-minio';
  }
  // 个人中心（侧栏叶子项，位于系统设置下）：profile 单页命中即高亮
  if (it.kind === 'profile') {
    const r = useRoute();
    const k = r.meta && r.meta.kind;
    return k === 'profile';
  }
  return navMatch(it);
}

export function navParentOn(it) {
  return it.children.some((c) => navIsActive(c));
}

export function navBusy(it) {
  const runs = useRunsStore();
  const tasks = useTasksStore();
  const rid = runs.runningTaskId;
  if (!rid) return false;
  if (it.kind !== 'tasks') return false;
  const ids = it.id === 'all'
    ? tasks.tasks.map((t) => t.id)
    : tasks.tasks.filter((t) => t.group === it.id).map((t) => t.id);
  return ids.includes(rid);
}

/** 深链/刷新进入子页时，展开其所有祖先父级（含嵌套）。只展开、不收起。 */
export function openActiveAncestors(list) {
  const app = useAppStore();
  for (const it of list) {
    if (it.type === 'parent') {
      if (it.children.some((c) => navIsActive(c))) app.setNavOpen(it.key, true);
      openActiveAncestors(it.children);
    }
  }
}
