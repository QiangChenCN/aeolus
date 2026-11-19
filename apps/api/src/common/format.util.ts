/**
 * 人事/花名册模块公共小工具。
 *
 * 此前 beijingNowStr / str 在 staff、riders、personnel-changes 三个服务各复制一份，
 * 逻辑漂移风险高，统一收敛到这里。
 */

/** null/undefined → ''；其余 String() + 去首尾空白。 */
export function str(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

/** 北京时间（UTC+8）格式化 'YYYY-MM-DD HH:mm:ss'。 */
export function beijingNowStr(now: Date = new Date()): string {
  const d = new Date(now.getTime() + 8 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
  );
}

/** 转义 LIKE/ILIKE 通配符（% _ \），防止用户输入 % 变成全表匹配。 */
export function escapeLike(kw: string): string {
  return kw.replace(/[\\%_]/g, '\\$&');
}

/** YYYY-MM-DD 形状 + 日历有效性（2026-13-99 这类假日期会被拦下）。 */
export function isYmd(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}

/** 手机号脱敏：保留前 3 后 4（不足 7 位全部打码）。用于异动审计等展示场景。 */
export function maskMobile(v: string): string {
  const s = str(v);
  if (!s) return '';
  return s.length >= 7 ? `${s.slice(0, 3)}****${s.slice(-4)}` : '****';
}
