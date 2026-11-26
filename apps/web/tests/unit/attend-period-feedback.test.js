import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia } from 'pinia';
import AttendPeriodBoard from '../../src/features/attend-period/AttendPeriodBoard.vue';
import { useAttendPeriodStore } from '../../src/features/attend-period/store.js';
import { saveAttendFeedback } from '@shared/api/dashboards.js';

vi.mock('@shared/api/dashboards.js', () => ({
  fetchAttendDataset: vi.fn(async () => ({ dataset: {} })),
  fetchAttendFeedback: vi.fn(async () => ({ ok: true, rows: [] })),
  fetchPreSchedule: vi.fn(async () => ({ ok: true, rows: [], periods: [] })),
  saveAttendFeedback: vi.fn(async () => ({ ok: true, row: {} })),
}));

const yesterday = () => new Date(Date.now() + 8 * 3600 * 1000 - 24 * 3600 * 1000).toISOString().slice(0, 10);

describe('时段看板未达标原因反馈列', () => {
  it('有记录展示反馈内容，无记录展示未反馈，达标展示无需反馈', async () => {
    const pinia = createPinia();
    const store = useAttendPeriodStore(pinia);
    store.date = yesterday();
    store.resp = {
      dataset: {
        time_period: {
          rows: [{ time_code: 1000, time_name: '早班', start_time: '00:00', end_time: '23:59' }],
          summary: {},
        },
        station_data: { rows: [], periods: [] },
        rider_detail: {
          rows: ['r1', 'r2', 'r3'].map((id) => ({
            rider_id: id,
            rider_name: `骑手${id}`,
            team_id: 1,
            team_name: '站点A',
            cells: { 1000: { scheduled: true, achieved: id === 'r3' } },
          })),
          periods: [],
        },
      },
    };
    store.feedbackRows = [
      {
        stat_date: store.date,
        team_id: '1',
        rider_id: 'r1',
        time_code: '1000',
        feedback_status: 'FEEDBACKED',
        feedback_user: 'zhangsan',
        feedback_user_name: '张三',
        feedback_time: '2026-11-26 12:30:00',
        remark: '车辆故障',
      },
      // 达标行即使存在历史记录，也无需反馈
      {
        stat_date: store.date,
        team_id: '1',
        rider_id: 'r3',
        time_code: '1000',
        feedback_status: 'FEEDBACKED',
        feedback_user: 'lisi',
        feedback_user_name: '李四',
        feedback_time: '2026-11-26 13:00:00',
        remark: '历史误填',
      },
    ];

    const wrapper = mount(AttendPeriodBoard, { global: { plugins: [pinia], directives: { perm: {} } } });
    await nextTick();

    expect(wrapper.vm.tpRiderRows).toHaveLength(3);
    expect(wrapper.vm.tpRiderRows.map((row) => row.feedbackText)).toEqual(['车辆故障', '未反馈', '无需反馈']);
    expect(wrapper.vm.tpRiderRows.map((row) => [row.canFeedback, row.hasFeedback])).toEqual([
      [true, true], [true, false], [false, true],
    ]);
    expect(wrapper.vm.tpRiderRows.map((row) => row.feedbackMeta)).toEqual([
      '张三 · 2026-11-26 12:30:00', '', '',
    ]);
    wrapper.unmount();
  });

  it('保存反馈后只替换对应行，不重拉考勤数据', async () => {
    const pinia = createPinia();
    const store = useAttendPeriodStore(pinia);
    store.date = yesterday();
    store.feedbackRows = [{
      stat_date: store.date, team_id: '1', rider_id: 'r1', time_code: '1000',
      feedback_status: 'FEEDBACKED', remark: '旧内容',
    }];
    vi.mocked(saveAttendFeedback).mockResolvedValueOnce({
      ok: true,
      row: {
        stat_date: store.date, team_id: '1', rider_id: 'r1', time_code: '1000',
        feedback_status: 'FEEDBACKED', remark: '新内容', feedback_user: 'tester',
      },
    });

    await store.saveFeedback({ date: store.date, teamId: '1', riderId: 'r1', timeCode: '1000', remark: '新内容' });

    expect(saveAttendFeedback).toHaveBeenCalledTimes(1);
    expect(store.feedbackRows).toHaveLength(1);
    expect(store.feedbackRows[0].remark).toBe('新内容');
  });
});
