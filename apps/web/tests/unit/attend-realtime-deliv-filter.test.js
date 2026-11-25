import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia } from 'pinia';
import AttendRealtimeBoard from '../../src/features/attend-period/AttendRealtimeBoard.vue';
import { useAttendPeriodStore } from '../../src/features/attend-period/store.js';

const today = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const rider = (id, name, deliveryOrder, workStatus = 1) => ({
  rider_id: id, rider_name: name, team_id: 1, team_name: '站点A',
  cells: {
    1000: { scheduled: true, work_status: workStatus, delivery_order: deliveryOrder, orders: 1, online_sec: 3600 },
  },
});

describe('实时看板配送中单量筛选', () => {
  it('选项来自表格列去重，全选选项可在全选与清空间切换，并过滤骑手明细', async () => {
    const pinia = createPinia();
    const store = useAttendPeriodStore(pinia);
    store.date = today();
    store.resp = {
      fetched_at: `${today()}T12:00:00+08:00`,
      dataset: {
        time_period: { rows: [], summary: {} },
        station_data: {
          rows: [{ team_id: 1, team_name: '站点A', metrics: { 1000: { target: 4, scheduled: 4 } } }],
          periods: [],
        },
        rider_detail: {
          rows: [
            rider('r1', '骑手1', 0), rider('r2', '骑手2', 2, 3),
            rider('r3', '骑手3', 2), rider('r4', '骑手4', 5),
          ],
          periods: [{
            time_code: 1000, time_name: '实时时段', start_time: '00:00', end_time: '23:59',
            online_req_h: 1, orders_req: 1, is_full_day: false,
          }],
        },
      },
    };

    const wrapper = mount(AttendRealtimeBoard, { global: { plugins: [pinia] } });
    await nextTick();

    expect(wrapper.vm.delivOptions).toEqual([0, 2, 5]);
    expect(wrapper.findAll('.rt-el-table .el-table__row')).toHaveLength(4);
    expect(wrapper.vm.workStatusInfo({ workStatus: 3 }).text).toBe('下班');
    expect(wrapper.vm.wsOptions).toContain('下班');

    wrapper.vm.onDelivChange([2]);
    await nextTick();
    expect(store.delivFilter).toEqual([2]);
    expect(wrapper.findAll('.rt-el-table .el-table__row')).toHaveLength(2);

    wrapper.vm.onDelivChange(['__ALL__']);
    await nextTick();
    expect(store.delivFilter).toEqual([0, 2, 5]);
    expect(wrapper.findAll('.rt-el-table .el-table__row')).toHaveLength(4);

    wrapper.vm.onDelivChange([0, 2, 5, '__ALL__']);
    await nextTick();
    expect(store.delivFilter).toEqual([]);
    expect(wrapper.findAll('.rt-el-table .el-table__row')).toHaveLength(4);
    wrapper.unmount();
  });
});
