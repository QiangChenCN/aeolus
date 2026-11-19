import { request } from './request.js';

function j(data) { return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data || {}) }; }
function jp(data) { return { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data || {}) }; }

/* ============ 人员花名册（除骑手外的其他人员） ============ */

export function fetchStaff({ keyword, team, status, page = 1, pageSize = 50 } = {}) {
  const q = [];
  if (keyword) q.push('keyword=' + encodeURIComponent(keyword));
  if (team) q.push('team=' + encodeURIComponent(team));
  if (status) q.push('status=' + encodeURIComponent(status));
  q.push('page=' + page, 'pageSize=' + pageSize);
  return request('/staff?' + q.join('&'));
}

export function createStaff(data) { return request('/staff', j(data)); }
export function updateStaff(data) { return request('/staff', jp(data)); }
export function deleteStaff(id) { return request('/staff?id=' + encodeURIComponent(id), { method: 'DELETE' }); }

/* ============ 岗位字典（人员花名册「岗位」口径收敛） ============ */

/* 字典 + 在职使用统计（数据权限过滤；含「未登记」岗位） */
export function fetchPositions() { return request('/staff/positions'); }

/* 登记岗位：{name, sort?, note?} */
export function createPosition(data) { return request('/staff/positions', j(data)); }

/* 更新字典元数据：{id, sort?, note?, enabled?}（改名走 rename，不走这里） */
export function updatePosition(data) { return request('/staff/positions', jp(data)); }

/* 删除字典条目（仍有在职人员使用时后端拒绝） */
export function deletePosition(id) { return request('/staff/positions?id=' + encodeURIComponent(id), { method: 'DELETE' }); }

/* 重命名级联：{from, to, note?} → 花名册 + 逐人「岗位调整」异动 + 字典同步 */
export function renamePosition(data) { return request('/staff/positions/rename', j(data)); }

/* ============ 组织架构（业务线 → 城市 → 站点） ============ */

/* 读取组织树 + 站点目录（站点只读自风神） */
export function fetchOrgStructure() { return request('/org/structure'); }

/* 保存组织树：{cities:{城市:[站点id]}, business_lines:{业务线:[城市]}, default_new_site} */
export function saveOrgStructure(data) { return request('/org/structure', j(data)); }
