import { request } from './request.js';

/* ============ 人事异动记录（人员/骑手通用时间线） ============ */

/* targetType: 'rider' | 'staff'；返回 {ok,total,page,pageSize,rows} */
export function fetchPersonnelChanges({ targetType, targetId, page = 1, pageSize = 20 } = {}) {
  const q = [];
  if (targetType) q.push('targetType=' + encodeURIComponent(targetType));
  if (targetId) q.push('targetId=' + targetId);
  q.push('page=' + page, 'pageSize=' + pageSize);
  return request('/personnel/changes?' + q.join('&'));
}
