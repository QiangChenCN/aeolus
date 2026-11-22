import { Injectable } from '@nestjs/common';
import { AeolusCookieService } from '../creds/aeolus-cookie.service';

/**
 * 风控处罚 CSV 取数（供考核看板、申诉提醒任务等内部调用）。
 *
 * POST download 接口拿签名链接 → 下载 CSV → 按上游约定用 GBK 解码。
 */
export const VIOLATION_API_URL =
  'https://httpizza.ele.me/xtop/xtop.lpd.quality.control.violation.violationOrderAeolusCenterApi.download/1.0';

export const STATIC_HEADERS: Record<string, string> = {
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-US;q=0.7',
  'content-type': 'application/json',
  origin: 'https://penalty.faas.ele.me',
  referer: 'https://penalty.faas.ele.me/ZSViolationPunish.html',
  'sec-ch-ua': '"Not=A?Brand";v="99", "Microsoft Edge";v="151", "Chromium";v="151"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0',
  'x-shard': 'shardid=1',
};

/** 风控处罚明细接口错误（带 code，供调用方区分会话失效与业务错误）。 */
export class ViolationApiError extends Error {
  constructor(
    message: string,
    public code = '',
  ) {
    super(message);
    this.name = 'ViolationApiError';
  }
}

/** 是否会话失效类错误（CSV 下载与分页列表共用同一口径）。 */
export function isViolationAuthError(e: ViolationApiError): boolean {
  return /(^|\D)401(\D|$)/.test(e.code) || /validToken|未登录|会话失效|登录失败|顶号/i.test(e.message);
}

@Injectable()
export class ViolationFetchService {
  constructor(private readonly cookies: AeolusCookieService) {}

  /**
   * 拉取 [startMs, endMs] 区间的风控处罚 CSV，返回 { text, fileUrl }。
   * 会话失效（业务 401 / 未登录文案）强制重登后重试一次；显式传 cookie 时不重登。
   */
  async downloadCsv(
    startMs: number,
    endMs: number,
    cookie?: string,
  ): Promise<{ text: string; fileUrl: string }> {
    const ck = cookie || (await this.cookies.ensure());
    try {
      return await this.downloadOnce(ck, startMs, endMs);
    } catch (e) {
      if (e instanceof ViolationApiError && isViolationAuthError(e) && !cookie) {
        const fresh = await this.cookies.relogin();
        return await this.downloadOnce(fresh, startMs, endMs);
      }
      throw e;
    }
  }

  private async downloadOnce(
    ck: string,
    startMs: number,
    endMs: number,
  ): Promise<{ text: string; fileUrl: string }> {
    const body = JSON.stringify({
      params: { request: { violationStartTime: startMs, violationEndTime: endMs } },
    });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    let j: any;
    try {
      const res = await fetch(VIOLATION_API_URL, {
        method: 'POST',
        headers: { accept: 'application/json, text/plain, */*', ...STATIC_HEADERS, cookie: ck },
        body,
        signal: ctrl.signal,
      });
      j = await res.json();
    } finally {
      clearTimeout(timer);
    }

    const result = j && typeof j === 'object' ? j.result : null;
    if (result === null || result === undefined) {
      const err = (j || {}).error || {};
      const code = String((j || {}).code || err.name || '');
      const msg = String(err.message || err.gracefulMsg || '');
      throw new ViolationApiError(`违规明细接口返回空 result（code=${code} ${msg}）`, code);
    }
    const code = String(result.code || '');
    if (code && code !== '200') {
      throw new ViolationApiError(`违规明细接口错误：code=${code} msg=${result.msg}`, code);
    }
    const fileUrl = (result.data || {}).fileUrl;
    if (!fileUrl) throw new Error('违规明细接口未返回 fileUrl');

    const ctrl2 = new AbortController();
    const timer2 = setTimeout(() => ctrl2.abort(), 60000);
    let buf: Buffer;
    try {
      const res2 = await fetch(fileUrl, { signal: ctrl2.signal });
      buf = Buffer.from(await res2.arrayBuffer());
    } finally {
      clearTimeout(timer2);
    }

    // 上游导出固定为 GBK 字节，按唯一口径解码
    return { text: new TextDecoder('gbk').decode(buf), fileUrl };
  }
}
