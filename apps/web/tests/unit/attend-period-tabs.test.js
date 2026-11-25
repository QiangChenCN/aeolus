import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import AttendPeriodView from '../../src/features/attend-period/AttendPeriodView.vue';

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
    await router.push('/attend-period/realtime');
    await router.isReady();
    const wrapper = mount(AttendPeriodView, {
      global: { plugins: [router], directives: { perm: {} } },
    });
    await flushPromises();

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
    wrapper.unmount();
  });
});
