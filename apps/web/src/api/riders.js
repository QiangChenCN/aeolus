import { request } from './request.js';

function j(data) { return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data || {}) }; }
function jp(data) { return { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data || {}) }; }

/* ============ 骑手花名册（人事主数据） ============ */

/* 名册查询：GET 返回 {ok, total, page, pageSize, rows} */
export function fetchRiders({ keyword, team, status, page = 1, pageSize = 50 } = {}) {
  const q = [];
  if (keyword) q.push('keyword=' + encodeURIComponent(keyword));
  if (team) q.push('team=' + encodeURIComponent(team));
  if (status) q.push('status=' + encodeURIComponent(status));
  q.push('page=' + page, 'pageSize=' + pageSize);
  return request('/riders?' + q.join('&'));
}

/* 新建花名册记录 */
export function createRider(data) { return request('/riders', j(data)); }

/* 更新花名册记录（含 id） */
export function updateRider(data) { return request('/riders', jp(data)); }

/* 删除花名册记录 */
export function deleteRider(id) { return request('/riders?id=' + encodeURIComponent(id), { method: 'DELETE' }); }

/* 从考勤快照同步花名册：返回 {ok, date, total, added, updated} */
export function syncRiders() { return request('/riders/sync', j({})); }
