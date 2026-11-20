import { defineStore } from 'pinia';
import { signin as apiSignin, signout as apiSignout, me as apiMe, updateAvatar as apiUpdateAvatar, updateProfile as apiUpdateProfile } from '../api/auth.js';
import { setBearerToken, clearBearerToken } from '../api/request.js';

// 由 App.vue 注入：将用户送到登录页（保留当前页用于登录后返回）。
// store 不直接依赖 router，避免循环引用。
let loginRedirector = null;
export function setLoginRedirector(fn) { loginRedirector = fn; }

// 会话校验的 Promise：路由守卫与 App.vue 可能同时发起 bootstrap（初始导航未完成时 App 已挂载），
// 必须共用同一个 Promise，否则后发起的一方会因「已在引导中」而跳过等待，
// 拿到尚未填充的登录态 → 误判未登录 → 刷新即跳登录页。
let bootPromise = null;

// 主动退出后抑制钉钉 JSAPI 自动免登：否则退出后跳到登录页会被钉钉容器内的 probe 立即重新登录，
// 表现为「退出后又回到首页」。只影响自动免登，用户手动点钉钉登录仍可用（probe(true) 会清除标记）。
// 用 sessionStorage 让同一标签页刷新后依然生效；非浏览器端静默降级为内存态。
const AUTO_LOGIN_SUPPRESS_KEY = 'wb_auto_login_suppressed';
function readAutoLoginSuppressed() {
  if (typeof sessionStorage === 'undefined') return false;
  try { return sessionStorage.getItem(AUTO_LOGIN_SUPPRESS_KEY) === '1'; } catch { return false; }
}
export function isAutoLoginSuppressed() { return readAutoLoginSuppressed(); }
export function clearAutoLoginSuppression() {
  if (typeof sessionStorage === 'undefined') return;
  try { sessionStorage.removeItem(AUTO_LOGIN_SUPPRESS_KEY); } catch { /* ignore */ }
}
function suppressAutoLogin() {
  if (typeof sessionStorage === 'undefined') return;
  try { sessionStorage.setItem(AUTO_LOGIN_SUPPRESS_KEY, '1'); } catch { /* ignore */ }
}

// 鉴权状态：登录态完全由后端会话 Cookie 决定。前端只缓存「me 校验得到的用户信息」，
// 用于界面展示与路由守卫判定；不持有令牌本身（HttpOnly Cookie 由浏览器管理，XSS 不可读）。
export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    role: null,
    avatar: null,
    name: null,
    phone: null,
    email: null,
    mustChange: false,
    /** /auth/me 返回的权限点；前端仅用于界面收敛，真正的安全边界在后端 AccessGuard。 */
    perms: [],
    /** 后端权限快照签名，用于发现角色权限被改而前端缓存未刷新的情况。 */
    permsSig: '',
    lastPermsCheck: 0,
    /** 会话校验（bootstrap）是否已完成；uni-app 的 onLaunch 不阻塞渲染，页面据此门控首屏。 */
    booted: false,
  }),
  getters: {
    authenticated: (s) => !!s.user,
    isAdmin: (s) => s.role === 'admin',
    /** 与后端 hasPerm 同口径：admin 角色直通，其余按权限点判定。 */
    hasPerm: (s) => (perm) => s.role === 'admin' || (Array.isArray(s.perms) && s.perms.includes(perm)),
  },
  actions: {
    // 启动时：调 /auth/me 校验会话 Cookie；有效则填充用户信息，无效则保持未登录（由路由守卫跳登录页）。
    // 幂等：多次调用共享同一个 Promise，调用方 await 到的永远是「校验已完成」的时点。
    async bootstrap() {
      if (!bootPromise) {
        bootPromise = (async () => {
          try {
            const data = await apiMe();
            if (data && data.authenticated) {
              // 会话有效（含 OAuth 回跳、刷新后恢复）即解除「主动退出」抑制。
              clearAutoLoginSuppression();
              this.user = data.user; this.role = data.role;
              this.avatar = data.avatar ?? null;
              this.name = data.name ?? null;
              this.phone = data.phone ?? null;
              this.email = data.email ?? null;
              this.mustChange = !!data.must_change;
              this.perms = Array.isArray(data.perms) ? data.perms : [];
              this.permsSig = data.perms_sig || '';
            }
          } catch (e) { /* 未登录 / 网络异常：保持 user=null，等待守卫重定向 */ }
        })();
      }
      await bootPromise;
      // 无论校验成功 / 未登录 / 网络异常，引导都已结束，页面可以据此放行首屏。
      this.booted = true;
    },
    async signin(username, password, remember = false) {
      const data = await apiSignin(username, password, remember);
      if (data && data.token) {
        clearAutoLoginSuppression();
        this.user = data.user; this.role = data.role;
        this.avatar = data.avatar ?? null;
        this.name = data.name ?? null;
        this.phone = data.phone ?? null;
        this.email = data.email ?? null;
        this.mustChange = !!data.must_change;
        this.booted = true;
        // signin 响应不含权限点，补一次 /me 拉取，避免菜单/按钮按空权限渲染。
        await this.reloadPerms();
        return data;
      }
      throw new Error((data && data.error) || '登录失败');
    },
    /** 单独刷新权限点与签名。 */
    async reloadPerms() {
      try {
        const data = await apiMe();
        if (data && data.authenticated) {
          this.perms = Array.isArray(data.perms) ? data.perms : [];
          this.permsSig = data.perms_sig || '';
        }
      } catch (e) { /* ignore */ }
    },
    /**
     * 角色权限被管理员改动后，后端即时生效但前端 perms 是登录时缓存的。
     * 路由切换时非阻塞调用：按签名比对，仅变化时刷新；15 秒节流避免每次导航都打 /me。
     */
    async refreshPermsIfChanged() {
      if (!this.authenticated) return;
      const now = Date.now();
      if (now - this.lastPermsCheck < 15_000) return;
      this.lastPermsCheck = now;
      try {
        const data = await apiMe();
        if (data && data.authenticated && data.perms_sig !== this.permsSig) {
          this.perms = Array.isArray(data.perms) ? data.perms : [];
          this.permsSig = data.perms_sig || '';
        }
      } catch (e) { /* ignore */ }
    },
    async signout() {
      let serverOk = true;
      try { await apiSignout(); } catch (e) { serverOk = false; }
      clearBearerToken(); // 清掉 iframe/JSAPI 场景下的 X-Token 内存态
      this.user = null; this.role = null; this.avatar = null;
      this.name = null; this.phone = null; this.email = null;
      this.mustChange = false;
      this.perms = [];
      this.permsSig = '';
      this.lastPermsCheck = 0;
      // 丢弃旧的 bootstrap 结果并重置 booted：下次进入任何页面都会重新向 /auth/me
      // 校验真实 Cookie 状态，避免旧 Promise 缓存把已退出的用户态再回填回来。
      bootPromise = null;
      this.booted = false;
      // 钉钉容器内退出后禁止 JSAPI 自动免登把用户又拉回首页（手动点登录仍可用）。
      suppressAutoLogin();
      this.requireLogin();
      return serverOk;
    },
    /**
     * 钉钉 JSAPI 免登成功后调用：后端把 wb_token 直接返回，这里存入内存并立即以 X-Token 头
     * 发起一次 /auth/me 校验，填充用户信息（绕过跨站 iframe 可能拦截的会话 Cookie）。
     */
    async applyDingtalkSession(token) {
      setBearerToken(token);
      const data = await apiMe();
      if (data && data.authenticated) {
        clearAutoLoginSuppression();
        this.user = data.user; this.role = data.role;
        this.avatar = data.avatar ?? null;
        this.name = data.name ?? null;
        this.phone = data.phone ?? null;
        this.email = data.email ?? null;
        this.mustChange = !!data.must_change;
        this.perms = Array.isArray(data.perms) ? data.perms : [];
        this.permsSig = data.perms_sig || '';
        return true;
      }
      clearBearerToken();
      return false;
    },
    // 401 或主动退出时触发：重定向到登录页（保留当前页用于登录后返回）。
    requireLogin() { if (loginRedirector) loginRedirector(); },
    // 更新个人头像（data URI），成功后同步本地 avatar 展示。
    async updateAvatar(avatar) {
      const data = await apiUpdateAvatar(avatar);
      if (data && data.ok) {
        this.avatar = data.avatar ?? avatar;
        return true;
      }
      throw new Error((data && data.error) || '头像更新失败');
    },
    // 更新个人资料（姓名 / 手机号 / 邮箱），成功后同步本地展示。
    async updateProfile(profile) {
      const data = await apiUpdateProfile(profile);
      if (data && data.ok) {
        if (data.name !== undefined) this.name = data.name ?? null;
        if (data.phone !== undefined) this.phone = data.phone ?? null;
        if (data.email !== undefined) this.email = data.email ?? null;
        return true;
      }
      throw new Error((data && data.error) || '资料更新失败');
    },
  },
});
