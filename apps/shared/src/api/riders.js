import { request } from './request.js';

function j(data) { return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data || {}) }; }

/* ============ 骑手管理（仅读本地 rider_roster + 手动新增） ============ */

/* 页面展示数据源：读 rider_roster */
export function fetchRiderDetails({ keyword, team, workStatus, page = 1, pageSize = 50 } = {}) {
  const q = [];
  if (keyword) q.push('keyword=' + encodeURIComponent(keyword));
  if (team) q.push('team=' + encodeURIComponent(team));
  if (workStatus) q.push('workStatus=' + encodeURIComponent(workStatus));
  q.push('page=' + page, 'pageSize=' + pageSize);
  return request('/riders/detail?' + q.join('&'));
}

/* 单独查看结算单价真实值（列表只返回打码占位） */
export function fetchRiderSettlement(knightId) {
  return request('/riders/settlement?knightId=' + encodeURIComponent(knightId));
}

/* 手动新增骑手：只写本地 rider_roster */
export function createRider(data) { return request('/riders', j(data)); }

/* 手动编辑/离职：只写本地 rider_roster */
export function updateRider(data) {
  return request('/riders', { ...j(data), method: 'PUT' });
}

/* 骑手入离职履历（不可变事件流） */
export function fetchRiderEmploymentHistory(knightId, page = 1, pageSize = 20) {
  const q = [
    'knightId=' + encodeURIComponent(knightId || ''),
    'page=' + page,
    'pageSize=' + pageSize,
  ];
  return request('/riders/employment-history?' + q.join('&'));
}
