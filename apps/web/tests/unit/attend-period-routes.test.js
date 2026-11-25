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
    expect(parent.meta.viewKey).toBeUndefined();
  });

  it('五个 tab 各有独立组件子路由，且保留侧栏高亮', () => {
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
      // 每个 tab 是独立组件；共享数据/筛选态放在 Pinia store
      expect(r.components.default).toBeTruthy();
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
