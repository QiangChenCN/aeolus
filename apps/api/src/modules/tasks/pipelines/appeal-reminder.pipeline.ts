import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { TaskHandler, TaskRunContext, TaskStage, TaskStop } from '../task-handler';
import { Pipeline } from '../pipeline';
import { TaskHandlersService } from '../task-handlers.service';
import { ViolationFetchService } from '../../../infra/fetch/sources/violation-fetch.service';
import { ReportRenderService } from '../../render/report-render.service';
import { MinioService } from '../../media/minio.service';
import { DingtalkService } from '../../dingtalk/dingtalk.service';
import { StationManagersService } from '../../notify/station-managers.service';
import { DingtalkIdBaseService } from '../../dingtalk-id/dingtalk-id-base.service';
import { APPEAL_GROUP_NAME, teamToStation } from '../../notify/notify-config';
import { csvToRecords } from '../../../common/csv';

const APPEAL_COLS = [
  '违规时间',
  '运单号',
  '骑手信息',
  '所属团队',
  '违规分类',
  '违规类型',
  '违规原因',
  '申诉状态',
  '申诉剩余时间',
];

/** 北京时间当天 [00:00:00.000, 23:59:59.999]。 */
function dynamicTimeRange(): { startMs: number; endMs: number; dateStr: string } {
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const d = now.getUTCDate();
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    startMs: Date.UTC(y, m - 1, d, -8, 0, 0),
    endMs: Date.UTC(y, m - 1, d, 23 - 8, 59, 59, 999),
    dateStr: `${y}-${p(m)}-${p(d)}`,
  };
}

/** 不满意单申诉提醒（原 jobs/appeal/appeal_reminder.py）。 */
@Injectable()
export class AppealReminderPipeline implements TaskHandler {
  readonly id = 'appeal_reminder';
  readonly stages: TaskStage[] = [
    { id: 'download', name: '下载违规 CSV' },
    { id: 'filter', name: '筛选非超时待申诉' },
    { id: 'render', name: '渲染明细图' },
    { id: 'upload', name: '上传 MinIO' },
    { id: 'send', name: '发送钉钉群' },
  ];
  private readonly outDir: string;

  constructor(
    private readonly handlers: TaskHandlersService,
    private readonly violation: ViolationFetchService,
    private readonly render: ReportRenderService,
    private readonly minio: MinioService,
    private readonly dingtalk: DingtalkService,
    private readonly stationManagers: StationManagersService,
    private readonly dingtalkIds: DingtalkIdBaseService,
    config: ConfigService,
  ) {
    this.handlers.register(this);
    const root = path.resolve(
      config.get<string>('PROJECT_ROOT') || path.resolve(process.cwd(), '..'),
    );
    this.outDir = path.join(root, 'apps', 'api', 'runtime', 'jobs', 'appeal', 'out');
  }

  private get imgPath(): string {
    return path.join(this.outDir, 'violation_detail.png');
  }

  /** 下载（重试 3 次、间隔 5s×2 递增，与 with_retry(times=3, delay=5, backoff=2) 一致）。 */
  private async downloadWithRetry(ctx: TaskRunContext) {
    const times = 3;
    let delay = 5;
    let last: unknown;
    for (let i = 1; i <= times; i++) {
      try {
        const { startMs, endMs, dateStr } = dynamicTimeRange();
        const { text, fileUrl } = await this.violation.downloadCsv(startMs, endMs);
        fs.mkdirSync(this.outDir, { recursive: true });
        fs.writeFileSync(path.join(this.outDir, 'violations.csv'), '\uFEFF' + text, 'utf-8');
        return { text, dateStr, fileUrl };
      } catch (e) {
        last = e;
        ctx.log(`  [warn] 风神登录+下载CSV 第 ${i}/${times} 次失败: ${(e as Error).message}`);
        if (i < times) {
          await new Promise((r) => setTimeout(r, delay * 1000));
          delay *= 2;
        }
      }
    }
    throw last;
  }

  private filterRows(text: string): Record<string, string>[] {
    const rows: Record<string, string>[] = [];
    for (const r of csvToRecords(text)) {
      const rec: Record<string, string> = {};
      for (const [k, v] of Object.entries(r)) rec[k] = (v || '').trim();
      if (rec['违规分类'] !== '超时' && rec['申诉状态'] === '待申诉') {
        const team = rec['团队名称'] || '';
        rows.push({
          违规时间: rec['违规时间'] || '',
          运单号: rec['运单号'] || '',
          骑手信息: `${rec['骑手名称'] || ''}(${rec['骑手ID'] || ''})`,
          所属团队: team,
          站点: teamToStation(team),
          违规分类: rec['违规分类'] || '',
          违规类型: rec['违规类型'] || '',
          违规原因: rec['违规原因'] || '',
          申诉状态: rec['申诉状态'] || '',
          申诉剩余时间: rec['剩余申诉时间'] || '',
        });
      }
    }
    return rows;
  }

  private async collectAt(rows: Record<string, string>[]): Promise<{
    ids: string[];
    missing: string[];
    /** [姓名, openDingTalkId]，供按站点私发负责人用。 */
    resolved: [string, string][];
  }> {
    const names = new Set<string>();
    for (const r of rows) {
      for (const m of this.stationManagers.managersForTeam(r['站点'])) names.add(m);
    }
    const { resolved, missing } = await this.dingtalkIds.resolveNamesAuto(names);
    return { ids: resolved.map(([, oid]) => oid), missing: [...missing].sort(), resolved };
  }

  /** 按负责人拆分明细：openDingTalkId → { 姓名, 站点 → 该站点待申诉行 }。 */
  private splitByManager(
    rows: Record<string, string>[],
    resolved: [string, string][],
  ): Map<string, { name: string; stations: Map<string, Record<string, string>[]> }> {
    const nameToOid = new Map(resolved);
    const out = new Map<string, { name: string; stations: Map<string, Record<string, string>[]> }>();
    for (const r of rows) {
      for (const m of this.stationManagers.managersForTeam(r['站点'])) {
        const oid = nameToOid.get(m);
        if (!oid) continue;
        let t = out.get(oid);
        if (!t) {
          t = { name: m, stations: new Map() };
          out.set(oid, t);
        }
        let list = t.stations.get(r['站点']);
        if (!list) {
          list = [];
          t.stations.set(r['站点'], list);
        }
        list.push(r);
      }
    }
    return out;
  }

  /** 站点私发 Markdown：每个名下站点一个小节。 */
  private buildDmText(
    dateStr: string,
    name: string,
    stations: Map<string, Record<string, string>[]>,
  ): string {
    const total = [...stations.values()].reduce((n, l) => n + l.length, 0);
    const parts = [
      `## 不满意单申诉提醒（${name}）`,
      `**统计日期：** ${dateStr}　**您名下站点非超时 · 待申诉 共 ${total} 条**`,
      '',
    ];
    for (const [station, list] of stations) {
      parts.push(`### ${station}（${list.length} 条）`, this.buildMarkdownTable(list), '');
    }
    parts.push('请及时登录风神处理申诉，避免逾期影响考核。');
    return parts.join('\n');
  }

  private buildMarkdownTable(rows: Record<string, string>[]): string {
    const header =
      '| ' + APPEAL_COLS.join(' | ') + ' |\n' + '|' + ['---'].concat(Array(8).fill('---')).join('|') + '|';
    const body = rows.map((r) => '| ' + APPEAL_COLS.map((c) => r[c]).join(' | ') + ' |');
    return [header, ...body].join('\n');
  }

  async run(ctx: TaskRunContext): Promise<void> {
    const a = ctx.args;
    const noSend = Boolean(a['--no-send']);
    const markdown = Boolean(a['--markdown']);
    const noAt = Boolean(a['--no-at']);
    const noDm = Boolean(a['--no-dm']);
    const groupId = String(a['--group'] ?? '');

    const state: {
      text?: string;
      dateStr?: string;
      fileUrl?: string;
      rows?: Record<string, string>[];
      imgPath?: string;
      imgUrl?: string | null;
    } = {};
    const p = new Pipeline(ctx, state);

    p.stage('download', '下载违规 CSV', async () => {
      const r = await this.downloadWithRetry(ctx);
      state.text = r.text;
      state.dateStr = r.dateStr;
      state.fileUrl = r.fileUrl;
    });

    p.stage('filter', '筛选非超时待申诉', () => {
      const rows = this.filterRows(state.text!);
      ctx.log(`日期 ${state.dateStr} 筛选命中（非超时 & 待申诉）: ${rows.length} 条`);
      for (const r of rows) ctx.log(`  ${JSON.stringify(r)}`);
      ctx.log(`下载链接已获取(长度 ${(state.fileUrl || '').length}，已脱敏不外泄签名 URL)`);
      if (!rows.length) throw new TaskStop('无符合条件的订单，跳过发送。');
      state.rows = rows;
    });

    p.stage('render', '渲染明细图', () => {
      if (markdown) {
        ctx.log('（--markdown 模式不需要图片，跳过渲染）');
        return;
      }
      state.imgPath = this.render.renderAppeal(state.rows!, state.dateStr!, this.imgPath);
      ctx.log(`图片已生成: ${state.imgPath}`);
    });

    p.stage('upload', '上传 MinIO', async () => {
      if (markdown) {
        ctx.log('（--markdown 模式不需要图片，跳过上传）');
        return;
      }
      if (!state.imgPath || !fs.existsSync(state.imgPath)) {
        state.imgPath = this.render.renderAppeal(state.rows!, state.dateStr!, this.imgPath);
        ctx.log(`（upload 节点补渲染）图片已生成: ${state.imgPath}`);
      }
      try {
        state.imgUrl = await this.minio.upload(state.imgPath, 'vp');
      } catch (e) {
        ctx.log(`[warn] MinIO 上传失败，send 节点将降级为钉钉图片附件: ${(e as Error).message}`);
        state.imgUrl = null;
      }
    });

    p.stage('send', '发送钉钉群并私发负责人', async () => {
      const rows = state.rows!;
      const { ids, missing, resolved } = await this.collectAt(rows);
      if (missing.length && !noAt) {
        ctx.log(`[warn] 以下站长未解析到 openDingTalkId，已跳过 @：${missing.join('、')}`);
      }
      const gid = groupId || APPEAL_GROUP_NAME;
      ctx.log(`目标群: ${gid}；将 @ 站长 openid: ${noAt ? '（--no-at，不 @）' : ids.join(',')}`);
      if (noSend) {
        ctx.log(`(--no-send) 未实际发送。图片预览: ${state.imgPath || '（未渲染）'}`);
        return;
      }
      const atIds = ids.length && !noAt ? ids : [];
      if (markdown) {
        const text =
          `## 不满意单申诉提醒\n**统计日期：** ${state.dateStr}　**非超时 · 待申诉 共 ${rows.length} 条**\n\n` +
          this.buildMarkdownTable(rows) +
          `\n\n📎 [下载原文件](${state.fileUrl})\n\n请相关站点站长及时查看并处理申诉：${noAt ? '' : ids.map((i) => `<@${i}>`).join(' ')}`;
        const out = await this.dingtalk.sendMessage({ group: gid, text, atOpenDingTalkIds: atIds });
        ctx.log(`Markdown 单条发送: ${JSON.stringify(out).slice(0, 300)}`);
      } else if (state.imgUrl) {
        const text =
          `## 不满意单申诉提醒\n**统计日期：** ${state.dateStr}　**非超时 · 待申诉 共 ${rows.length} 条**\n\n` +
          `![违规明细](${state.imgUrl})\n\n` +
          `📎 [下载原文件](${state.fileUrl})\n\n` +
          `请相关站点站长及时查看并处理申诉：${noAt ? '' : ids.map((i) => `<@${i}>`).join(' ')}`;
        const out = await this.dingtalk.sendMessage({ group: gid, text, atOpenDingTalkIds: atIds });
        ctx.log(`图片内联 Markdown 发送: ${JSON.stringify(out).slice(0, 300)}`);
      } else {
        // MinIO 不可用 → 降级为钉钉图片附件
        ctx.log('[warn] MinIO 图链不可用，降级为钉钉图片附件');
        const out1 = await this.dingtalk.sendFile({ group: gid, file: state.imgPath! });
        ctx.log(`图片文件附件发送: ${JSON.stringify(out1).slice(0, 300)}`);
        const caption =
          `## 不满意单申诉提醒\n**统计日期：** ${state.dateStr}　**非超时 · 待申诉 共 ${rows.length} 条**\n\n` +
          `📎 [下载原始数据](${state.fileUrl})\n\n请相关站点站长及时查看上方明细图并处理申诉：${noAt ? '' : ids.map((i) => `<@${i}>`).join(' ')}`;
        const out2 = await this.dingtalk.sendMessage({ group: gid, text: caption, atOpenDingTalkIds: atIds });
        ctx.log(`说明文字发送: ${JSON.stringify(out2).slice(0, 300)}`);
      }
      ctx.log('发送完成。');

      // ── 按站点拆分私发负责人（--no-dm 可关）──
      if (!noDm) {
        const targets = this.splitByManager(rows, resolved);
        if (!targets.size) {
          ctx.log('[warn] 没有可私发的负责人（站点负责人映射为空或 openDingTalkId 均未解析），跳过私发');
        } else {
          let dmOk = 0;
          let dmFail = 0;
          for (const [oid, t] of targets) {
            const cnt = [...t.stations.values()].reduce((n, l) => n + l.length, 0);
            try {
              const text = this.buildDmText(state.dateStr!, t.name, t.stations);
              await this.dingtalk.sendDm({ openDingTalkId: oid, text });
              dmOk++;
              ctx.log(`私发 ${t.name}（${[...t.stations.keys()].join('、')}，共 ${cnt} 条）`);
            } catch (e) {
              dmFail++;
              ctx.log(`[warn] 私发 ${t.name}（${oid}）失败: ${(e as Error).message}`);
            }
          }
          ctx.log(`私发完成：成功 ${dmOk} 人，失败 ${dmFail} 人。`);
        }
      } else {
        ctx.log('（--no-dm）跳过按站点私发负责人。');
      }
    });

    await p.run();
  }
}
