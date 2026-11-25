import { describe, it, expect } from 'vitest';
import router from '../../src/router/index.js';
import { targetPath } from '@shared/utils/view-mode.js';

const routeByPath = (p) => router.getRoutes().find((r) => r.path === p);

describe('排班出勤看板 tab 子路由', () => {
  it('入口 /attend-period 默认落到实时看板', () => {
    const parent = routeByPath('/attend-period');
    // 规范化后的路由记录把 component 收进 components.default
    expect(parent.components.default).toBeTruthy();
    expect(parent.redirect.name).toBe('attend-tab-realtime');
    expect(parent.meta.viewKey).toBe('attend-period');
  });

  it('五个 tab 各有子路由，且保留侧栏高亮与页面复用 key', () => {
    const tabs = [
      ['/attend-period/realtime', '实时看板', 'attend-tab-realtime'],
      ['/attend-period/station', '站点看板', 'attend-tab-station'],
      ['/attend-period/rider', '骑手看板', 'attend-tab-rider'],
      ['/attend-period/period', '时段看板', 'attend-tab-period'],
      ['/attend-period/pre-schedule', '预排班', 'attend-tab-pre-schedule'],
    ];
    for (const [path, title, name] of tabs) {
      const r = routeByPath(path);
      expect(r, path).toBeTruthy();
      expect(r.name).toBe(name);
      expect(r.meta.title).toBe(title);
      expect(r.meta.kind).toBe('attendPeriod');
      expect(r.meta.viewKey).toBe('attend-period');
      // 子路由只提供 URL，不拆组件：五个 tab 共用同一份 dataset 与筛选态
      expect(r.components).toBeFalsy();
    }
  });
});

describe('排班出勤看板切端映射', () => {
  it.each([
    '/attend-period',
    '/attend-period/realtime',
    '/attend-period/station',
    '/attend-period/rider',
    '/attend-period/period',
    '/attend-period/pre-schedule',
  ])('%s 切到移动端仍落在考勤页', (path) => {
    expect(targetPath('desktop', path, '', { mobileBase: '/m/' })).toBe('/m/pages/att/index');
  });
});
