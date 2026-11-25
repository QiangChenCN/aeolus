// 全局视图判定：按 UA + 用户手动偏好，在应用启动入口把用户送到对应端的「当前路由」。
// 纯逻辑模块，无框架依赖，web 与 mobile(H5) 共用。

const MOBILE_UA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
const VIEW_COOKIE = 'wb_view'; // 用户手动选择的视图：desktop | mobile（空=未手动选择）

const ONE_YEAR = 365 * 24 * 60 * 60;

function readCookie(name) {
  if (typeof document === 'undefined') return '';
  const parts = String(document.cookie || '').split(';');
  for (const part of parts) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

function writeCookie(name, value, maxAge) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export function uaKind(ua) {
  return MOBILE_UA.test(String(ua || '')) ? 'mobile' : 'desktop';
}

export function currentUaKind() {
  if (typeof navigator === 'undefined') return 'desktop';
  return uaKind(navigator.userAgent);
}

// 语义映射：移动端 page <-> 桌面 path。移动端仅 6 个页面，桌面多出的业务页回落首页。
const MOBILE_TO_DESKTOP = {
  'pages/index/index': '/',
  'pages/login/index': '/login',
  'pages/task/index': '/tasks',
  'pages/att/index': '/attend-period',
  'pages/msg/index': '/im-contact',
  'pages/me/index': '/settings/profile',
};
const DESKTOP_TO_MOBILE = {
  '/': 'pages/index/index',
  '/login': 'pages/login/index',
  '/tasks': 'pages/task/index',
  '/attend-period': 'pages/att/index',
  '/im-contact': 'pages/msg/index',
  '/settings/profile': 'pages/me/index',
};

function mobileBaseOf(opts) {
  return (opts.mobileBase || '/m/').replace(/\/+$/, '') + '/';
}

// 从 location 解析当前页面标识：history 模式下 pathname 形如 /m/pages/task/index。
function currentMobilePage(pathname, mobileBase) {
  let path = String(pathname || '');
  if (path.startsWith(mobileBase)) path = path.slice(mobileBase.length);
  return path.replace(/^\/+|\/+$/g, '');
}

function mobilePageToDesktop(pathname, search, mobileBase) {
  const page = currentMobilePage(pathname, mobileBase);
  const path = MOBILE_TO_DESKTOP[page] || '/';
  return `${path}${search || ''}`;
}

function desktopPathToMobile(pathname, search, mobileBase) {
  const path = String(pathname || '/').split('?')[0].replace(/\/+$/, '') || '/';
  // 排班出勤看板的 tab 子路由同属移动端「考勤」页，切端时不落回首页
  const page = DESKTOP_TO_MOBILE[path]
    || (path.startsWith('/attend-period/') ? DESKTOP_TO_MOBILE['/attend-period'] : null)
    || 'pages/index/index';
  return `${mobileBase}${page}${search || ''}`;
}

// 手动切换后应跳到哪：切到 mobile 用当前桌面路径映射，切到 desktop 用当前移动页面映射。
export function targetPath(current, pathname, search, opts = {}) {
  const mobileBase = mobileBaseOf(opts);
  return current === 'desktop'
    ? desktopPathToMobile(pathname, search, mobileBase)
    : mobilePageToDesktop(pathname, search, mobileBase);
}

// 解析本次应落在哪个端（只读偏好，不写）。
// - 有手动偏好：偏好优先，UA 判定失效（即使 UA 之后变了也不跳）。
// - 无手动偏好：按当前 UA。
export function resolveTargetView() {
  const pref = readCookie(VIEW_COOKIE);
  if (pref === 'mobile' || pref === 'desktop') return pref;
  return currentUaKind();
}

// 手动点击「切换桌面版 / 移动版」时调用。
// 目标视图若等于当前 UA 判定结果，则不保存（并清除已有偏好，交还 UA 主导）；
// 否则保存偏好，此后 UA 判定失效，直到用户再切回与 UA 一致的一端。
export function setManualView(view) {
  const target = view === 'mobile' ? 'mobile' : 'desktop';
  if (target === currentUaKind()) writeCookie(VIEW_COOKIE, '', 0);
  else writeCookie(VIEW_COOKIE, target, ONE_YEAR);
}

// 在应用启动入口调用。目标端与当前端不一致时 replace 到对应路由并返回 true。
export function enforceView(current, opts = {}) {
  if (typeof window === 'undefined') return false;
  const target = resolveTargetView();
  if (target === current) return false;
  const url = targetPath(current, window.location.pathname, window.location.search, opts);
  window.location.replace(url);
  return true;
}
