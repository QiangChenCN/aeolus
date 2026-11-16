import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { TaskHandler, TaskRunContext, TaskStage, TaskStop } from '../task-handler';
import { Pipeline } from '../pipeline';
import { TaskHandlersService } from '../task-handlers.service';
import { OrangeStormFetchService } from '../../../infra/fetch/sources/orange-storm-fetch.service';
import { DingtalkService } from '../../dingtalk/dingtalk.service';
import { StationManagersService } from '../../notify/station-managers.service';
import { ReportRenderService } from '../../render/report-render.service';
import { MinioService } from '../../media/minio.service';
import { PRODUCTION_GROUP_NAME } from '../../notify/notify-config';

/**
 * 橙色风暴申诉提醒（完全独立的新任务，不与既有任务共享任何实现代码）。
 *
 * 业务语义：
 *   橙色风暴（QC 抽检判定）结果「不通过」且「申诉状态 = 待申诉」的记录，
 *   在申诉截止时间前按站点汇总 → 发钉钉群 @ 站长 → 按站点私发负责人，
 *   提醒其在截止前完成申诉，避免处罚落定。
 *
 * 取数：调用取数基座 OrangeStormFetchService（按 hitTime 时间窗分页拉 QC 判定列表）。
 * 输出：runtime/jobs/orange_storm_appeal/out/ 下 JSON + CSV 明细落盘。
 */

/** 展示用明细列（明细图 / CSV / 私发 Markdown 表格共用）。 */
const DETAIL_COLS = [
  '抽检时间',
  '骑手信息',
  '站点',
  '抽检类型',
  '不合格原因',
  '处罚金额',
  '申诉状态',
  '申诉截止',
  '剩余时间',
  '抽检ID',
];

const p2 = (n: number): string => String(n).padStart(2, '0');

/** ms -> 'YYYY-MM-DD HH:MM:SS'（东八区）；非法/<=0 返回空串。 */
function fmtMs(v: unknown): string {
  let n = Number(v);
  if (!Number.isFinite(n)) return '';
  n = Math.trunc(n);
  if (n <= 0) return '';
  if (n > 1e14) n = Math.floor(n / 1000);
  const d = new Date(n + 8 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
}

/** 'YYYY-MM-DD' 东八区当天 00:00:00.000 的 epoch ms。 */
function cstDayStart(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d, -8, 0, 0);
}

/** 毫秒剩余时间 -> 人话（X天X小时 / X小时 / 已不足1小时）。 */
function remainText(expireMs: number, nowMs: number): string {
  const diff = expireMs - nowMs;
  if (diff <= 0) return '已到期';
  const h = diff / 3600_000;
  if (h < 1) return `不足1小时(${Math.max(1, Math.round(diff / 60_000))}分)`;
  if (h < 48) return `${h.toFixed(1)}小时`;
  return `${Math.floor(h / 24)}天${Math.round(h % 24)}小时`;
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function mdCell(v: unknown): string {
  return (v === null || v === undefined ? '' : String(v)).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/** 固定统计窗口：前一天 00:00:00 ~ 当前（东八区，覆盖当天 + 前一天）。 */
function resolveWindow(): {
  startMs: number;
  endMs: number;
  label: string;
} {
  const nowMs = Date.now();
  const todayCst = new Date(nowMs + 8 * 3600 * 1000);
  const todayStr = `${todayCst.getUTCFullYear()}-${p2(todayCst.getUTCMonth() + 1)}-${p2(todayCst.getUTCDate())}`;
  const startMs = cstDayStart(todayStr) - 86_400_000;
  const sCst = new Date(startMs + 8 * 3600 * 1000);
  const sStr = `${sCst.getUTCFullYear()}-${p2(sCst.getUTCMonth() + 1)}-${p2(sCst.getUTCDate())}`;
  return { startMs, endMs: nowMs, label: `${sStr} 00:00:00 ~ 当前（当天 + 前一天）` };
}

@Injectable()
export class OrangeStormAppealPipeline implements TaskHandler {
  readonly id = 'orange_storm_appeal';
  readonly stages: TaskStage[] = [
    { id: 'fetch', name: '拉取 QC 判定' },
    { id: 'filter', name: '筛选待申诉' },
    { id: 'export', name: '落盘明细' },
    { id: 'render', name: '渲染明细图' },
    { id: 'upload', name: '上传 MinIO' },
    { id: 'send', name: '发送钉钉提醒' },
  ];
  private readonly outDir: string;

  constructor(
    private readonly handlers: TaskHandlersService,
    private readonly fetchSvc: OrangeStormFetchService,
    private readonly render: ReportRenderService,
    private readonly minio: MinioService,
    private readonly dingtalk: DingtalkService,
    private readonly stationManagers: StationManagersService,
    config: ConfigService,
  ) {
    this.handlers.register(this);
    const root = path.resolve(
      config.get<string>('PROJECT_ROOT') || path.resolve(process.cwd(), '..'),
    );
    this.outDir = path.join(root, 'apps', 'api', 'runtime', 'jobs', 'orange_storm_appeal', 'out');
  }

  private get imgPath(): string {
    return path.join(this.outDir, 'orange_storm_appeal.png');
  }

  /** 原始 QC 判定行 -> 展示明细行（站点展示全称，即风神团队名）。 */
  private toDetailRow(r: Record<string, any>, nowMs: number): Record<string, string> {
    const team = String(r.teamName || '');
    const reasons = Array.isArray(r.reasons)
      ? r.reasons.map((x: Record<string, any>) => x?.reasonName || '').filter(Boolean).join('；')
      : '';
    const expireMs = Number(r.appealExpireTime) || 0;
    return {
      抽检时间: fmtMs(r.hitTime),
      骑手信息: `${r.knightName || ''}(${r.knightId || ''})`,
      站点: team,
      抽检类型: String(r.qcTypeName || ''),
      不合格原因: reasons,
      处罚金额: String(r.punishDecimalAmount ?? ''),
      申诉状态: String(r.appealStatusDesc || ''),
      申诉截止: expireMs > 0 ? fmtMs(expireMs) : '无截止时间',
      剩余时间: expireMs > 0 ? remainText(expireMs, nowMs) : '-',
      抽检ID: String(r.qcId || ''),
    };
  }

  /**
   * 「判定不通过 + 尚未申诉 + 未过申诉截止」过滤。
   *
   * 实测字段语义（2026-11-16，近 7 天 1450 条）：
   *   statusDesc: 通过 / 不通过 / 待审核
   *   appealStatusDesc: 未申诉(noappeal) / 不可申诉(disable) / 已申诉 / 申诉通过 / 申诉不通过 / 申诉截止
   * 可提醒的行 = 判定「不通过」且申诉状态为「未申诉」（兼容「待申诉」写法）且申诉截止时间未过。
   */
  private filterPending(rows: Record<string, any>[], nowMs: number): {
    details: Record<string, string>[];
    skippedExpired: number;
    skippedNotAppealable: number;
  } {
    const details: Record<string, string>[] = [];
    let skippedExpired = 0;
    let skippedNotAppealable = 0;
    for (const r of rows) {
      if (String(r.statusDesc || '') !== '不通过') continue; // 判定通过/待审核无需提醒
      const appealStatus = String(r.appealStatusDesc || '');
      if (appealStatus !== '未申诉' && appealStatus !== '待申诉') {
        skippedNotAppealable++;
        continue;
      }
      const expireMs = Number(r.appealExpireTime) || 0;
      if (expireMs > 0 && expireMs <= nowMs) {
        skippedExpired++;
        continue;
      }
      details.push(this.toDetailRow(r, nowMs));
    }
    return { details, skippedExpired, skippedNotAppealable };
  }

  private markdownTable(rows: Record<string, string>[], cols: string[]): string {
    const header = `| ${cols.join(' | ')} |\n|${cols.map(() => '---').join('|')}|`;
    const body = rows.map((r) => `| ${cols.map((c) => mdCell(r[c])).join(' | ')} |`);
    return [header, ...body].join('\n');
  }

  /** 按站点聚合明细行。 */
  private groupByStation(details: Record<string, string>[]): Map<string, Record<string, string>[]> {
    const byStation = new Map<string, Record<string, string>[]>();
    for (const r of details) {
      const st = r['站点'];
      (byStation.get(st) || byStation.set(st, []).get(st)!).push(r);
    }
    return byStation;
  }

  /**
   * 群消息（图片模式）：明细在图里，正文只放站点概览，
   * 每个站点单独 @ 该站点的负责人（<@openId> 占位 + atOpenDingTalkIds 双保险）。
   */
  private buildGroupText(
    label: string,
    details: Record<string, string>[],
    stationAt: Map<string, string[]>,
    imgUrl: string | null,
  ): string {
    const byStation = this.groupByStation(details);
    const parts = [
      `## 橙色风暴申诉提醒`,
      `**统计窗口：** ${label}　**判定不通过 · 未申诉 共 ${details.length} 条**`,
      '',
    ];
    if (imgUrl) {
      parts.push(`![明细](${imgUrl})`, '');
    }
    parts.push('### 待处理站点');
    for (const [station, list] of byStation) {
      const ats = (stationAt.get(station) || []).map((oid) => `<@${oid}>`).join(' ');
      parts.push(`- **${station}**：${list.length} 条 ${ats}`.trimEnd());
    }
    parts.push('', '⚠️ 请尽快登录风神完成申诉，逾期处罚将生效。');
    return parts.join('\n');
  }

  /** 单个负责人的私发 Markdown：名下每个站点一节 + 明细图内联。 */
  private buildDmText(
    label: string,
    name: string,
    stations: Map<string, Record<string, string>[]>,
    imgUrl: string | null,
  ): string {
    const total = [...stations.values()].reduce((n, l) => n + l.length, 0);
    const tableCols = DETAIL_COLS;
    const parts = [
      `## 橙色风暴申诉提醒（${name}）`,
      `**统计窗口：** ${label}　**您名下站点判定不通过 · 未申诉 共 ${total} 条**`,
      '',
    ];
    if (imgUrl) {
      parts.push(`![明细](${imgUrl})`, '');
    }
    for (const [station, list] of stations) {
      parts.push(`### ${station}（${list.length} 条）`, this.markdownTable(list, tableCols), '');
    }
    parts.push('请及时登录风神处理申诉，避免逾期处罚生效。');
    return parts.join('\n');
  }

  /** 按负责人拆分明细：openDingTalkId -> { 姓名, 站点 -> 明细行 }。 */
  private splitByManager(
    details: Record<string, string>[],
    resolved: [string, string][],
  ): Map<string, { name: string; stations: Map<string, Record<string, string>[]> }> {
    const nameToOid = new Map(resolved);
    const out = new Map<string, { name: string; stations: Map<string, Record<string, string>[]> }>();
    for (const r of details) {
      // 站点列为全称（团队名），可精确命中 UI 配置的站点全称/teams 别名
      for (const m of this.stationManagers.managersForTeam(r['站点'])) {
        const oid = nameToOid.get(m);
        if (!oid) continue;
        let t = out.get(oid);
        if (!t) {
          t = { name: m, stations: new Map() };
          out.set(oid, t);
        }
        const st = r['站点'];
        (t.stations.get(st) || t.stations.set(st, []).get(st)!).push(r);
      }
    }
    return out;
  }

  async run(ctx: TaskRunContext): Promise<void> {
    const a = ctx.args;
    const noSend = Boolean(a['--no-send']);
    const noAt = Boolean(a['--no-at']);
    const noDm = Boolean(a['--no-dm']);
    const groupId = String(a['--group'] ?? '');
    const win = resolveWindow();
    const nowMs0 = Date.now();

    ctx.log(`时间窗（东八区）：${win.label}`);
    ctx.log(`时间戳：${win.startMs} ~ ${win.endMs}`);

    const state: {
      rows?: Record<string, any>[];
      total?: number;
      details?: Record<string, string>[];
      label?: string;
      imgPath?: string;
      imgUrl?: string | null;
    } = {};
    const p = new Pipeline(ctx, state);

    p.stage('fetch', '拉取 QC 判定', async () => {
      const { rows, total } = await this.fetchSvc.fetchAll(win.startMs, win.endMs);
      state.rows = rows;
      state.total = total;
      ctx.log(`拉取完成：${rows.length} 条（接口 total=${total}），耗时 ${((Date.now() - nowMs0) / 1000).toFixed(1)}s`);
    });

    p.stage('filter', '筛选待申诉', () => {
      const { details, skippedExpired, skippedNotAppealable } = this.filterPending(
        state.rows || [],
        Date.now(),
      );
      state.details = details;
      state.label = win.label;
      ctx.log(
        `筛选命中（不通过 & 待申诉 & 未过期）: ${details.length} 条` +
          `（跳过：非待申诉 ${skippedNotAppealable}，已过期 ${skippedExpired}）`,
      );
      for (const r of details) ctx.log(`  ${r['站点']} ${r['骑手']} ${r['抽检类型']} ${r['剩余时间']}`);
      if (!details.length) throw new TaskStop('无待申诉的橙色风暴判定，跳过发送。');
    });

    p.stage('export', '落盘明细', () => {
      const rows = state.rows || [];
      const details = state.details || [];
      fs.mkdirSync(this.outDir, { recursive: true });
      const jsonPath = path.join(this.outDir, `orange_storm_appeal.json`);
      fs.writeFileSync(jsonPath, JSON.stringify({ window: win.label, details, raw: rows }, null, 2), 'utf-8');
      const csvPath = path.join(this.outDir, `orange_storm_appeal.csv`);
      const csv = [DETAIL_COLS, ...details.map((r) => DETAIL_COLS.map((c) => r[c]))]
        .map((line) => line.map(csvCell).join(','))
        .join('\r\n');
      fs.writeFileSync(csvPath, '\uFEFF' + csv + '\r\n', 'utf-8');
      ctx.log(`已输出：${jsonPath}`);
      ctx.log(`已输出：${csvPath}`);
    });

    p.stage('render', '渲染明细图', () => {
      state.imgPath = this.render.renderOrangeStormAppeal(
        state.details || [],
        state.label || win.label,
        this.imgPath,
      );
      ctx.log(`明细图已生成: ${state.imgPath}`);
    });

    p.stage('upload', '上传 MinIO', async () => {
      if (!state.imgPath || !fs.existsSync(state.imgPath)) {
        state.imgPath = this.render.renderOrangeStormAppeal(
          state.details || [],
          state.label || win.label,
          this.imgPath,
        );
        ctx.log(`（upload 节点补渲染）明细图已生成: ${state.imgPath}`);
      }
      // 上传失败不降级：直接抛错让任务失败（内部自带 3 次重试）
      state.imgUrl = await this.minio.upload(state.imgPath, 'os');
      ctx.log(`明细图公网直链: ${state.imgUrl}`);
    });

    p.stage('send', '发送钉钉提醒', async () => {
      const details = state.details || [];
      const label = state.label || win.label;
      const byStation = this.groupByStation(details);

      // 解析 站点 -> 负责人 openDingTalkId（每个站点只 @ 自己的负责人）
      // 站点列已是团队全名，可精确命中 UI 配置的站点全称/teams 别名
      const allNames = new Set<string>();
      for (const st of byStation.keys()) {
        for (const m of this.stationManagers.managersForTeam(st)) allNames.add(m);
      }
      const { resolved, missing } = await this.stationManagers.resolveNamesAuto(allNames);
      if (missing.length && !noAt) {
        ctx.log(`[warn] 以下负责人未解析到 openDingTalkId，已跳过 @：${missing.join('、')}`);
      }
      const nameToOid = new Map(resolved);
      const stationAt = new Map<string, string[]>();
      const atIds: string[] = [];
      for (const st of byStation.keys()) {
        const ids: string[] = [];
        if (!noAt) {
          for (const m of this.stationManagers.managersForTeam(st)) {
            const oid = nameToOid.get(m);
            if (oid && !atIds.includes(oid)) atIds.push(oid);
            if (oid && !ids.includes(oid)) ids.push(oid);
          }
        }
        stationAt.set(st, ids);
      }
      const gid = groupId || PRODUCTION_GROUP_NAME;
      ctx.log(
        `目标群: ${gid}；@ 名单: ${noAt ? '（--no-at，不 @）' : atIds.join(',') || '（空）'}` +
          `；站点 @ 映射: ${[...stationAt].map(([st, ids]) => `${st}=${ids.length ? ids.length + '人' : '无'}`).join(' ')}`,
      );

      if (noSend) {
        ctx.log('（--no-send）预览模式，未实际发送。明细图: ' + (state.imgPath || '（未渲染）'));
        return;
      }

      // MinIO 直链是图片内联的必要条件（upload 节点失败即任务失败，不会走到这里）
      const imgUrl = state.imgUrl;
      if (!imgUrl) throw new Error('明细图公网直链缺失（upload 节点异常），拒绝发送');
      const text = this.buildGroupText(label, details, stationAt, imgUrl);
      const out = await this.dingtalk.sendMessage({ group: gid, text, atOpenDingTalkIds: atIds });
      ctx.log(`群消息发送（图片内联 Markdown）: ${JSON.stringify(out).slice(0, 300)}`);

      // ── 按站点拆分私发负责人（--no-dm 可关）──
      if (noDm) {
        ctx.log('（--no-dm）跳过按站点私发负责人。');
        return;
      }
      const targets = this.splitByManager(details, resolved);
      if (!targets.size) {
        ctx.log('[warn] 没有可私发的负责人（映射为空或 openDingTalkId 未解析），跳过私发');
        return;
      }
      let dmOk = 0;
      let dmFail = 0;
      for (const [oid, t] of targets) {
        const cnt = [...t.stations.values()].reduce((n, l) => n + l.length, 0);
        try {
          await this.dingtalk.sendDm({
            openDingTalkId: oid,
            text: this.buildDmText(label, t.name, t.stations, state.imgUrl ?? null),
          });
          dmOk++;
          ctx.log(`私发 ${t.name}（${[...t.stations.keys()].join('、')}，共 ${cnt} 条）`);
        } catch (e) {
          dmFail++;
          ctx.log(`[warn] 私发 ${t.name}（${oid}）失败: ${(e as Error).message}`);
        }
      }
      ctx.log(`私发完成：成功 ${dmOk} 人，失败 ${dmFail} 人。`);
    });

    await p.run();
  }
}
