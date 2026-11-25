export function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

export function pct(n, d) {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : null;
}

/* 时长格式化：xx小时xx分钟 */
export function fmtDur(sec) {
  const s = Math.trunc(sec || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h}小时${m}分钟`;
}

export function rateClass(rate) {
  if (rate == null) return 'is-none';
  if (rate >= 100) return 'is-ok';
  if (rate >= 80) return 'is-warn';
  return 'is-bad';
}

export function achClass(achieved) {
  if (achieved === true) return 'is-ok';
  if (achieved === false) return 'is-bad';
  return 'is-none';
}
