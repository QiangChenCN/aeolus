import { Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { AeolusCookieService } from '../creds/aeolus-cookie.service';
import { netError } from '../../../common/net-error';
import { SourceConfigRuntimeService } from '../source-config/source-config-runtime.service';
import { SchedAuthError } from './schedule-fetch.service';

/**
 * 排班统计导出取数 —— 风神排班页「导出」按钮对应的三段式接口：
 *   1) POST exportSchedule（多站 teamIds + 日期区间）→ result.data.url（OSS 临时下载链接）
 *   2) GET url（免鉴权）→ xlsx bytes
 *   3) 解析 xlsx 中「排班统计」sheet → 站×日×时段行（应排人数/排班人数/预估单量）
 *
 * 与单站 schedule-fetch.service.ts（listScheduleStatistics，返回 JSON）互补：
 * 本服务专门供给「预排班」看板，口径 actualNum/predictNum = 排班人数/应排人数，
 * 与「标准达成」一致。上游 URL / headers 只保留在本文件。
 */
const EXPORT_API =
  'https://httpizza.ele.me/xtop/xtop.fs.special.schedule.exportSchedule/1.0';

/** 与排班页一致（上游对来源头敏感）。 */
const HEADERS_BASE: Record<string, string> = {
  accept: 'application/json, text/plain, */*',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-US;q=0.7',
  'content-type': 'application/json',
  origin: 'https://r.ele.me',
  referer: 'https://r.ele.me/pikipek/schedule.html?platform=fs&subType=ub',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36',
};

const TRIGGER_TIMEOUT_MS = 40_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 一行「站×日×时段」排班统计（xlsx「排班统计」sheet 归一后的英文键）。 */
export interface PreScheduleRow {
  team_id: string;
  team_name: string;
  date: string;
  team_size: number;
  period: string;
  required: number;
  scheduled: number;
  predict_order: number;
  /** 排班满足率（%），保留 1 位；应排人数为 0（如「休息」行）时为 null。 */
  rate: number | null;
}

/** 触发导出、下载并解析后的结果。 */
export interface PreScheduleResult {
  rows: PreScheduleRow[];
  /** xlsx 中出现的时段名（去掉「休息」），供前端生成列。 */
  periods: string[];
  /** 下载链接文件名里的原始日期范围，仅用于展示/排障。 */
  file_url: string;
}

function asDateStr(d: string | Date): string {
  if (d instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  return String(d);
}

function num(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * xlsx → 排班统计行。兼容「排班统计」sheet 名带日期前缀（如「2026-11-22至…排班统计」）。
 * 找不到该 sheet 时回落最后一个 sheet；找不到「时段」表头则抛错（避免静默返回空看板）。
 */
function parseScheduleXlsx(buf: Buffer, fileUrl: string): PreScheduleResult {
  const wb = XLSX.read(buf, { type: 'buffer', raw: true, cellDates: true });
  const sheetName =
    wb.SheetNames.find((n) => n.includes('排班统计')) ||
    wb.SheetNames[wb.SheetNames.length - 1];
  if (!sheetName) throw new Error('导出的 xlsx 没有任何 sheet');

  const matrix = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown[][];

  let hi = -1;
  for (let i = 0; i < Math.min(matrix.length, 10); i++) {
    if ((matrix[i] || []).some((c) => String(c ?? '').trim() === '时段')) {
      hi = i;
      break;
    }
  }
  if (hi < 0) throw new Error(`sheet「${sheetName}」中未找到「时段」表头`);

  const headers = (matrix[hi] || []).map((h) => (h == null ? '' : String(h).trim()));
  const col = (name: string) => headers.indexOf(name);
  const cTeam = col('团队id');
  const cName = col('团队名称');
  const cDate = col('日期');
  const cSize = col('站点人数');
  const cPeriod = col('时段');
  const cReq = col('应排人数');
  const cSch = col('排班人数');
  const cOrder = col('预估单量');
  if ([cTeam, cName, cDate, cPeriod, cReq, cSch].some((i) => i < 0)) {
    throw new Error(`sheet「${sheetName}」缺少必需列：团队id/团队名称/日期/时段/应排人数/排班人数`);
  }

  const rows: PreScheduleRow[] = [];
  for (let ri = hi + 1; ri < matrix.length; ri++) {
    const r = matrix[ri] || [];
    const period = String(r[cPeriod] ?? '').trim();
    if (!period) continue;
    const required = num(r[cReq]);
    const scheduled = num(r[cSch]);
    rows.push({
      team_id: String(r[cTeam] ?? ''),
      team_name: String(r[cName] ?? ''),
      date: String(r[cDate] ?? ''),
      team_size: num(r[cSize]),
      period,
      required,
      scheduled,
      predict_order: num(r[cOrder]),
      rate: required > 0 ? Math.round((scheduled / required) * 1000) / 10 : null,
    });
  }

  // 时段列顺序按首次出现；「休息」行不应排人数=0，前端不展示，但仍保留原始行备查。
  const periods: string[] = [];
  for (const row of rows) {
    if (row.period === '休息' || periods.includes(row.period)) continue;
    periods.push(row.period);
  }
  return { rows, periods, file_url: fileUrl };
}

@Injectable()
export class ScheduleExportFetchService {
  private readonly logger = new Logger(ScheduleExportFetchService.name);

  constructor(
    private readonly cookies: AeolusCookieService,
    private readonly sourceConfig: SourceConfigRuntimeService,
  ) {}

  /**
   * 多站排班统计导出 → 各时段排班满足率行。
   *
   * @param teamIds 站点 id 列表（空数组由调用方拦截）
   * @param startDate/endDate YYYY-MM-DD
   * @param cookie 可选；不传则用共享 cookie（缺失/失效由 AeolusCookieService 自愈）
   */
  async fetchStats(
    teamIds: Array<number | string>,
    startDate: string | Date,
    endDate: string | Date,
    cookie?: string,
  ): Promise<PreScheduleResult> {
    const ck = cookie || (await this.cookies.ensure());
    const defaultBody = {
      params: {
        request: {
          teamIds: teamIds.map((id) => parseInt(String(id), 10)),
          startDate: asDateStr(startDate),
          endDate: asDateStr(endDate),
        },
      },
    };
    const { url: triggerUrl, body } = await this.sourceConfig.overrideDownload(
      'schedule-export',
      { teamIds, startDate: asDateStr(startDate), endDate: asDateStr(endDate) },
      EXPORT_API, defaultBody,
    );

    const url = await this.trigger(JSON.stringify(body), ck, triggerUrl);
    const buf = await this.download(url);
    this.logger.log(`排班导出解析完成：${buf.length} bytes，${teamIds.length} 站`);
    return parseScheduleXlsx(buf, url);
  }

  /** 触发导出 → result.data.url。沿用排班接口的会话失效/限流判定。 */
  private async trigger(body: string, cookie: string, endpoint = EXPORT_API, retries = 3): Promise<string> {
    let last = '';
    for (let attempt = 0; attempt < retries; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TRIGGER_TIMEOUT_MS);
      let j: any;
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { ...HEADERS_BASE, cookie },
          body,
          signal: ctrl.signal,
        });
        j = await res.json();
      } catch (e) {
        last = netError(e).message;
        this.logger.warn(`排班导出网络异常（第 ${attempt + 1}/${retries} 次）：${last}`);
        await sleep((2 + attempt * 2) * 1000);
        continue;
      } finally {
        clearTimeout(timer);
      }

      const result = j?.result;
      if (result == null) throw new SchedAuthError('result is null（会话被顶号）');
      const code = String(result.code);
      const msg = String(result.msg ?? '');
      if (code !== '200') {
        if (code === '401' || msg.includes('下线') || msg.includes('账户')) {
          throw new SchedAuthError(`${code} ${msg}`, code);
        }
        if (code.toUpperCase().includes('FREQUENT') || msg.includes('频繁')) {
          last = msg || code;
          this.logger.warn(`排班导出被限流（第 ${attempt + 1}/${retries} 次）：${last}`);
          await sleep((3 + attempt * 3) * 1000);
          continue;
        }
        throw new Error(`排班导出失败 code=${code} msg=${msg}`);
      }
      const url = result.data?.url;
      if (typeof url !== 'string' || !url.startsWith('http')) {
        throw new Error(`排班导出未返回下载链接：${JSON.stringify(result.data)}`);
      }
      return url;
    }
    throw new Error(`排班导出重试 ${retries} 次仍失败: ${last}`);
  }

  /** OSS 临时链接，免鉴权；不把 cookie 带到第三方域。 */
  private async download(url: string): Promise<Buffer> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'Mozilla/5.0' },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`下载排班 xlsx 失败 HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      throw netError(e);
    } finally {
      clearTimeout(timer);
    }
  }
}
