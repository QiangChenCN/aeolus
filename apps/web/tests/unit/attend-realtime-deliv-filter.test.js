import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import AttendRealtimeBoard from '../../src/features/attend-period/AttendRealtimeBoard.vue';

const today = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const rider = (id, name, deliveryOrder, workStatus = 1) => ({
  rider_id: id, rider_name: name, team_id: 1, team_name: '站点A',
  cells: {
    1000: { scheduled: true, work_status: workStatus, delivery_order: deliveryOrder, orders: 1, online_sec: 3600 },
  },
});
const props = () => ({
  date: today(),
  fetchedAt: `${today()}T12:00:00+08:00`,
  periods: [{
    time_code: 1000, time_name: '实时时段', start_time: '00:00', end_time: '23:59',
    online_req_h: 1, orders_req: 1, is_full_day: false,
  }],
  stationRows: [{ team_id: 1, team_name: '站点A', metrics: { 1000: { target: 4, scheduled: 4 } } }],
  riderRows: [
    rider('r1', '骑手1', 0), rider('r2', '骑手2', 2, 3),
    rider('r3', '骑手3', 2), rider('r4', '骑手4', 5),
  ],
});

describe('实时看板配送中单量筛选', () => {
  it('选项来自表格列去重，全选选项可在全选与清空间切换，并过滤骑手明细', async () => {
    const wrapper = mount(AttendRealtimeBoard, { props: props() });
    await nextTick();

    expect(wrapper.vm.delivOptions).toEqual([0, 2, 5]);
    expect(wrapper.findAll('.rt-el-table .el-table__row')).toHaveLength(4);
    expect(wrapper.vm.workStatusInfo({ workStatus: 3 }).text).toBe('下班');
    expect(wrapper.vm.wsOptions).toContain('下班');

    wrapper.vm.onDelivChange([2]);
    await nextTick();
    expect(wrapper.vm.delivFilter).toEqual([2]);
    expect(wrapper.findAll('.rt-el-table .el-table__row')).toHaveLength(2);

    wrapper.vm.onDelivChange(['__ALL__']);
    await nextTick();
    expect(wrapper.vm.delivFilter).toEqual([0, 2, 5]);
    expect(wrapper.findAll('.rt-el-table .el-table__row')).toHaveLength(4);

    wrapper.vm.onDelivChange([0, 2, 5, '__ALL__']);
    await nextTick();
    expect(wrapper.vm.delivFilter).toEqual([]);
    expect(wrapper.findAll('.rt-el-table .el-table__row')).toHaveLength(4);
    wrapper.unmount();
  });
});
