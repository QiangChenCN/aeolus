/**
 * 权限点目录（唯一事实表）。
 *
 * 路由 → 权限的绑定**不在这里**：每个端点用 controller 方法上的 @RequirePerm 声明，
 * AccessGuard 直接读该元数据裁决；启动自检强制所有路由必须声明，缺失即拒绝启动。
 * 这里只保留权限点本身的清单，供 /api/auth/me 下发前端、角色管理页渲染勾选框。
 */

export interface PermItem {
  perm: string;
  label: string;
  group: string;
}

export const PERM_CATALOG: PermItem[] = [
  { perm: 'view', label: '查看看板', group: '只读' },
  { perm: 'file:read', label: '读取文件/下载', group: '数据' },
  { perm: 'task:run', label: '执行任务', group: '操作' },
  { perm: 'data:refresh', label: '刷新数据', group: '操作' },
  { perm: 'feedback:write', label: '填写未达标原因反馈', group: '操作' },
  { perm: 'cron:write', label: '编辑定时任务', group: '操作' },
  { perm: 'groups:write', label: '管理分组', group: '操作' },
  { perm: 'config:write', label: '修改系统配置', group: '配置' },
  { perm: 'realtime:targets', label: '考核目标配置', group: '配置' },
  { perm: 'admin:users', label: '账号管理', group: '管理' },
  { perm: 'admin:roles', label: '角色权限管理', group: '管理' },
  { perm: 'admin:policy', label: '密码策略管理', group: '管理' },
  { perm: 'admin:data-perm', label: '数据权限管理', group: '管理' },
  { perm: 'admin:bot', label: '机器人配置管理', group: '管理' },
  { perm: 'admin:aeolus', label: '风神账号配置', group: '管理' },
  { perm: 'admin:minio', label: 'MinIO 图床配置', group: '管理' },
];

export const ALL_PERMS = new Set(PERM_CATALOG.map((p) => p.perm));
