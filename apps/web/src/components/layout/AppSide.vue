<template>
  <nav class="side" :class="{ collapsed: !app.sideOpen }">
    <NavNode
      v-for="it in navItems"
      :key="it.key"
      :node="it"
      :depth="0"
      :siblings="topParentKeys"
    />
    <button class="side-collapse" @click="$emit('toggle-nav')" :title="app.sideOpen ? '折叠侧栏' : '展开侧栏'">
      <el-icon v-if="app.sideOpen"><Fold /></el-icon>
      <el-icon v-else><Expand /></el-icon>
    </button>
  </nav>
</template>

<script setup>
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import NavNode from './NavNode.vue';
import { useTasksStore } from '@shared/stores/tasks.js';
import { useAuthStore } from '@shared/stores/auth.js';
import { useRunsStore } from '@shared/stores/runs.js';
import { useAppStore } from '@shared/stores/app.js';
import { openActiveAncestors } from '@shared/utils/nav.js';

const route = useRoute();
const app = useAppStore();
defineEmits(['toggle-nav']);
const tasks = useTasksStore();
const auth = useAuthStore();
const runs = useRunsStore();

const navItems = computed(() => {
  const items = [];
  items.push({ type: 'leaf', key: 'home', kind: 'home', id: '', name: '首页', icon: 'HomeFilled' });

  const dashSubs = [
    { type: 'leaf', kind: 'assessment', id: '', name: '考核看板', icon: 'DataLine' },
    { type: 'leaf', kind: 'standard', id: '', name: '标准达成', icon: 'Aim' },
    { type: 'leaf', kind: 'attendPeriod', id: '', name: '排班出勤', icon: 'Calendar' },
    { type: 'leaf', kind: 'timeout', id: '', name: '配送超时', icon: 'Timer' },
    { type: 'leaf', kind: 'unsatisfied', id: '', name: '违规处罚', icon: 'Warning' },
    { type: 'leaf', kind: 'imContact', id: '', name: 'IM 电联', icon: 'ChatDotRound' },
    { type: 'leaf', kind: 'delivery', id: '', name: '运单明细', icon: 'Tickets' },
    { type: 'leaf', kind: 'assess', id: '', name: '考核设置', icon: 'Trophy' },
  ];
  items.push({ type: 'parent', key: 'dash', name: '数据看板', icon: 'DataLine', children: dashSubs });

  // 任务中心：单页入口（不再按分组拆分），点击进入全部任务视图
  const workChildren = [
    { type: 'leaf', key: 'hub', kind: 'tasks', id: 'all', name: '任务中心', icon: 'Grid', count: tasks.tasks.length },
    { type: 'leaf', key: 'history', kind: 'history', id: '', name: '运行记录', icon: 'Clock', count: runs.history.length },
    { type: 'leaf', key: 'cron-runs', kind: 'cron-runs', id: '', name: '自动任务', icon: 'AlarmClock' },
    { type: 'leaf', key: 'cron', kind: 'cron', id: '', name: '定时任务', icon: 'List' },
  ];
  items.push({ type: 'parent', key: 'work', name: '工作任务', icon: 'List', children: workChildren });

  // 机器人：全局配置（绑定组装与整体状态）置首，其后是凭证管理（凭据定义）与实例管理（实例参数）。
  // 钉钉授权 / SSO / DWS 仍归在系统设置下。
  const botEntries = [
    { type: 'leaf', kind: 'botcfg', id: 'assembly', name: '全局配置', icon: 'Monitor', perm: 'admin:bot' },
    { type: 'leaf', kind: 'botcfg', id: 'credentials', name: '凭证管理', icon: 'Key', perm: 'admin:bot' },
    { type: 'leaf', kind: 'botcfg', id: 'instances', name: '实例管理', icon: 'Cpu', perm: 'admin:bot' },
  ];
  const visibleBotSubs = botEntries.filter((e) => auth.hasPerm(e.perm));
  if (visibleBotSubs.length) {
    items.push({ type: 'parent', key: 'bot', name: 'Bot 管理', icon: 'Robot', children: visibleBotSubs });
  }

  // 人事管理：骑手花名册 + 人员花名册（除骑手）+ 站点配置（业务线/城市/站点归属 + 负责人通知路由）
  // + 岗位设置（人员花名册「岗位」口径；与站点的地理/业务维度分属不同数据域，故独立二级菜单）
  const hrSubs = [
    { type: 'leaf', key: 'riders', kind: 'riders', id: '', name: '骑手管理', icon: 'Avatar' },
    { type: 'leaf', key: 'staff', kind: 'staff', id: '', name: '人员管理', icon: 'Postcard' },
    { type: 'leaf', key: 'hr-org', kind: 'hr-org', id: '', name: '站点配置', icon: 'OfficeBuilding' },
    { type: 'leaf', key: 'hr-org-positions', kind: 'hr-org-positions', id: '', name: '岗位设置', icon: 'Suitcase' },
  ];
  items.push({ type: 'parent', key: 'hr', name: '人事管理', icon: 'UserFilled', children: hrSubs });

  // 常用工具：纯本地小工具集合；照片矫正全程在浏览器内处理，原图不上传。
  const toolSubs = [
    { type: 'leaf', kind: 'photoRectify', id: '', name: '照片矫正', icon: 'Camera' },
  ];
  items.push({ type: 'parent', key: 'common-tools', name: '常用工具', icon: 'Tools', children: toolSubs });

  // AI 助手：对话 + 功能地图（DSH 集成状态盘点）。运行端点需 task:run，无权限则不展示入口。
  if (auth.hasPerm('task:run')) {
    const aiSubs = [
      { type: 'leaf', kind: 'aiAssistant', id: '', name: 'AI 助手', icon: 'ChatDotRound' },
      { type: 'leaf', kind: 'aiFeatures', id: '', name: '功能地图', icon: 'Grid' },
    ];
    items.push({ type: 'parent', key: 'ai', name: 'AI 能力', icon: 'MagicStick', children: aiSubs });
  }

  // 系统设置：个人中心对所有登录用户可见（账号信息 + 个人改密），置于分组首位便于快速找到。
  // 管理类子项不再一刀切 isAdmin，而是按后端下发的权限点逐项收敛（perms 数组为「任一满足」）：
  // 例如 operator 有 config:write 可见站点负责人设置（已提升为一级），但看不到风神/MinIO/权限等管理员项。
  const sysSubs = [];
  sysSubs.push({ type: 'leaf', kind: 'profile', id: '', key: 'profile', name: '个人中心', icon: 'User' });
  // 取数基座为只读盘点页，所有登录用户可见；其余管理项按权限点逐项收敛。
  const sysEntries = [
    { type: 'leaf', kind: 'sys-integrations', id: '', name: '三方集成', icon: 'ChatDotRound', perm: 'admin:bot' },
    { type: 'leaf', kind: 'sys-credentials', id: '', name: '外部凭证', icon: 'Key', perms: ['admin:aeolus', 'admin:minio'] },
    { type: 'leaf', kind: 'sys-sources', id: '', name: '取数基座', icon: 'Connection', perm: 'view' },
    { type: 'leaf', kind: 'aiSettings', id: '', name: 'AI 设置', icon: 'Cpu', perm: 'config:write' },
    { type: 'leaf', kind: 'rbac', id: '', name: '权限管理', icon: 'Tools', perm: 'admin:users' },
    { type: 'leaf', kind: 'operationLog', id: '', key: 'operationLog', name: '操作日志', icon: 'Document', perm: 'admin:roles' },
  ];
  sysSubs.push(...sysEntries.filter((e) =>
    Array.isArray(e.perms) ? e.perms.some((p) => auth.hasPerm(p)) : auth.hasPerm(e.perm)));
  items.push({ type: 'parent', key: 'sys', name: '系统设置', icon: 'Setting', kind: 'syscfg', children: sysSubs });
  return items;
});

const topParentKeys = computed(() => navItems.value.filter((i) => i.type === 'parent').map((i) => i.key));

// 深链/刷新进入子页时自动展开所属父级（含嵌套层级），只展开不收起
watch(() => route.fullPath, () => openActiveAncestors(navItems.value, route), { immediate: true });
</script>

<style scoped>
.side { padding: var(--sp-12) var(--sp-8); display: flex; flex-direction: column; gap: 2px; height: 100%; }
/* 折叠按钮：固定在侧栏右下角，margin-top:auto 把它顶到底部，align-self:flex-end 靠右 */
.side-collapse {
  margin-top: auto;
  align-self: flex-end;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px; height: 32px;
  border: none; border-radius: var(--el-border-radius-base);
  background: transparent; color: var(--el-text-color-regular);
  cursor: pointer;
}
.side-collapse:hover { background: var(--el-fill-color); }
/* 折叠为图标栏：仅显示图标，隐藏文字/计数/箭头，图标居中 */
.side.collapsed :deep(.nv) { justify-content: center; padding-left: 0 !important; padding-right: 0 !important; }
.side.collapsed :deep(.nm),
.side.collapsed :deep(.ct),
.side.collapsed :deep(.nv-arw) { display: none; }
</style>
