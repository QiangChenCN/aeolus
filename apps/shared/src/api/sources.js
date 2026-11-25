// 取数基座目录（只读）：清单对所有登录用户开放，详情需 admin:aeolus。
import { request } from './request.js';

const enc = encodeURIComponent;

export function fetchSources() {
  return request('/settings/sources');
}

export function fetchSourceDetail(id) {
  return request('/settings/sources/' + enc(id));
}

// 取数基座配置：写操作需 admin:aeolus。
export function fetchSourceConfig(id) {
  return request('/settings/source-configs/' + enc(id));
}

export function saveSourceConfig(id, body) {
  return request('/settings/source-configs/' + enc(id), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

export function publishSourceConfig(id) {
  return request('/settings/source-configs/' + enc(id) + '/publish', { method: 'POST' });
}

export function rollbackSourceConfig(id, version) {
  return request('/settings/source-configs/' + enc(id) + '/rollback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version }),
  });
}

export function setSourceConfigEnabled(id, enabled) {
  return request('/settings/source-configs/' + enc(id) + '/enabled', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
}

export function dryRunSourceConfig(id, body) {
  return request('/settings/source-configs/' + enc(id) + '/dry-run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
    timeout: 70000,
  });
}
