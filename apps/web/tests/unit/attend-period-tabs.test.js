import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createPinia } from 'pinia';
import AttendPeriodView from '../../src/features/attend-period/AttendPeriodView.vue';
import { fetchAttendDataset } from '@shared/api/dashboards.js';

vi.mock('@shared/api/dashboards.js', () => ({
  fetchAttendTeams: vi.fn(async () => ({ all: [{ id: 1, name: '站点A' }], teams: [1] })),
  saveAttendTeams: vi.fn(async () => ({ ok: true, teams: [1] })),
  fetchAttendDataset: vi.fn(async () => ({
    dataset: {
      time_period: { rows: [], summary: {} },
      station_data: { rows: [], periods: [] },
      rider_detail: { rows: [], periods: [] },
    },
  })),
  fetchPreSchedule: vi.fn(async () => ({ ok: true, rows: [], periods: [] })),
}));

const stub = { render: () => null };
const makeRouter = () => createRouter({
  history: createMemoryHistory(),
  routes: [{
    path: '/attend-period',
    redirect: '/attend-period/realtime',
    children: ['realtime', 'station', 'rider', 'period', 'pre-schedule']
      .map((p) => ({ path: p, component: stub })),
  }],
});

describe('排班出勤看板 tab 与子路由联动', () => {
  it('点击 tab 推送对应子路由，外部导航改路径后 tab 回显', async () => {
    const router = makeRouter();
    const pinia = createPinia();
    await router.push('/attend-period/realtime');
    await router.isReady();
    const wrapper = mount(AttendPeriodView, {
      global: { plugins: [router, pinia], directives: { perm: {} } },
    });
    await flushPromises();
    expect(fetchAttendDataset).toHaveBeenCalledTimes(1);

    const tabs = wrapper.findAll('.el-tabs__item');
    expect(tabs.map((t) => t.text())).toEqual(['实时看板', '站点看板', '骑手看板', '时段看板', '预排班']);
    expect(wrapper.find('.el-tabs__item.is-active').text()).toBe('实时看板');

    await tabs[2].trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/attend-period/rider');
    expect(wrapper.find('.el-tabs__item.is-active').text()).toBe('骑手看板');

    await router.push('/attend-period/pre-schedule');
    await flushPromises();
    expect(wrapper.find('.el-tabs__item.is-active').text()).toBe('预排班');

    // 页面壳因 path 变化重建时，store 仍复用数据集，不会重复取数
    wrapper.unmount();
    const again = mount(AttendPeriodView, {
      global: { plugins: [router, pinia], directives: { perm: {} } },
    });
    await flushPromises();
    expect(fetchAttendDataset).toHaveBeenCalledTimes(1);
    again.unmount();
  });
});
