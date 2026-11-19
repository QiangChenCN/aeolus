// 取数基座目录（只读）：清单对所有登录用户开放，详情需 admin:aeolus。
import { request } from './request.js';

const enc = encodeURIComponent;

export function fetchSources() {
  return request('/settings/sources');
}

export function fetchSourceDetail(id) {
  return request('/settings/sources/' + enc(id));
}
