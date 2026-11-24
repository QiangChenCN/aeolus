import { describe, it, expect } from 'vitest';
import { navTo } from '@shared/utils/nav.js';

// navTo 是纯函数（不依赖 useRoute），映射任务中心侧栏 kind -> 路由路径。
// 这是前端路由导航的核心映射，回归它会直接暴露「点了菜单跳错页」。
describe('navTo', () => {
  const cases = [
    ['home', '/'],
    ['tasks', '/tasks'],
    ['history', '/history'],
    ['standard', '/standard'],
    ['attendPeriod', '/attend-period'],
    ['assessment', '/assessment'],
    ['timeout', '/timeout'],
    ['imContact', '/im-contact'],
    ['unsatisfied', '/unsatisfied'],
    ['cron', '/cron'],
    ['assessService', '/assess/service'],
    ['assessStandard', '/assess/standard'],
    ['rbac-users', '/settings/rbac/users'],
    ['rbac-roles', '/settings/rbac/roles'],
    ['rbac-policy', '/settings/rbac/policy'],
    ['rbac-pw', '/settings/rbac/pw'],
    ['rbac', '/settings/rbac'],
    ['profile', '/settings/profile'],
    ['syscfg', '/settings'],
    ['sys-integrations', '/settings/integrations'],
    ['sys-credentials', '/settings/credentials'],
    ['hr-org', '/hr/org'],
    ['hr-org-positions', '/hr/positions'],
    ['photoRectify', '/common-tools/photo-rectify'],
  ];

  it.each(cases)('kind=%s -> %s', (kind, expected) => {
    expect(navTo({ kind })).toBe(expected);
  });

  it('botcfg 带 id 拼接路径', () => {
    expect(navTo({ kind: 'botcfg', id: '42' })).toBe('/bot/42');
  });

  it('botcfg 无 id 回落到实例管理页', () => {
    expect(navTo({ kind: 'botcfg' })).toBe('/bot/instances');
  });

  it('未知 kind 回落到首页', () => {
    expect(navTo({ kind: 'something-else' })).toBe('/');
  });
});
