// 操作日志查询（受全局 AccessGuard 保护，需登录会话/机器令牌）。
import { request } from './request.js';

/**
 * 查询操作日志：谁 + 时间 + 用什么代码 + 操作了什么。
 * 支持 actor / action / target 过滤与时间范围 from / to（含端点，TIMESTAMPTZ 可比）。
 */
export function fetchOperationLog({ limit, actor, action, target, from, to } = {}) {
  const p = [];
  const enc = encodeURIComponent;
  if (limit) p.push('limit=' + enc(String(limit)));
  if (actor) p.push('actor=' + enc(actor));
  if (action) p.push('action=' + enc(action));
  if (target) p.push('target=' + enc(target));
  if (from) p.push('from=' + enc(from));
  if (to) p.push('to=' + enc(to));
  return request('/operation-log' + (p.length ? '?' + p.join('&') : ''));
}

/**
 * 权限决策日志：AccessGuard 每次裁决的「谁 / 角色 / 端点 / 所需权限 / 命中规则 / 结果」。
 * 仅 admin:roles 权限可调；只记录拒绝与敏感权限放行（view/self 放行不记）。
 */
export function fetchAuthzDecisions({ limit, username, path, decision } = {}) {
  const p = [];
  const enc = encodeURIComponent;
  if (limit) p.push('limit=' + enc(String(limit)));
  if (username) p.push('username=' + enc(username));
  if (path) p.push('path=' + enc(path));
  if (decision) p.push('decision=' + enc(decision));
  return request('/admin/authz-decisions' + (p.length ? '?' + p.join('&') : ''));
}
