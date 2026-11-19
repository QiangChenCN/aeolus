import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { dingtalkConfig, dingtalkJsapi, dingtalkBind } from '../api/auth.js';
import { useAuthStore } from '../stores/auth.js';

/**
 * 钉钉登录（JSAPI 免登 / OAuth 回跳 / 绑定）共享逻辑。
 * 桌面登录页与移动端登录页共用，避免两套实现口径漂移。
 * onSuccess 由调用方提供，负责跳转到各自端的首页。
 */
export function useDingtalkLogin({ onSuccess, query = null } = {}) {
  const auth = useAuthStore();
  // 桌面端用 vue-router；uni-app 等无 router 环境由调用方注入 query（如页面 onLoad 参数）。
  // useRoute 在无 router 时会返回 undefined，必须判空后再取 query。
  let resolvedQuery = query;
  if (!resolvedQuery) {
    const route = useRoute();
    resolvedQuery = route && route.query ? route.query : {};
  }

  const dtEnabled = ref(false);
  const dtCorpId = ref('');
  const dtAuthorizeUrl = ref('');
  const inDingtalk = ref(false);
  const dtLoading = ref(false);
  const dtStatus = ref(''); // idle | logging | unbound | failed
  const dtMessage = ref('');
  /** 免登返回「未绑定」时记住的一次性绑定凭证，待账密登录成功后自动绑定。 */
  const pendingBindToken = ref('');

  function isInDingtalk() {
    if (typeof navigator !== 'undefined' && /DingTalk/i.test(navigator.userAgent)) return true;
    return typeof window !== 'undefined' && !!window.dd;
  }

  function ensureDingtalkJsApi() {
    return new Promise((resolve, reject) => {
      if (window.dd) return resolve();
      const s = document.createElement('script');
      s.src = 'https://g.alicdn.com/dingding/dingtalk-jsapi/3.0.25/dingtalk.open.js';
      // 脚本既不 onload 也不 onerror 时（网络被静默拦截等）不能无限等，否则界面永远卡住
      const timer = setTimeout(() => reject(new Error('钉钉 JSAPI 脚本加载超时')), 10000);
      s.onload = () => { clearTimeout(timer); resolve(); };
      s.onerror = () => { clearTimeout(timer); reject(new Error('钉钉 JSAPI 脚本加载失败')); };
      document.head.appendChild(s);
    });
  }

  /** 从钉钉返回结果里取出免登码（兼容 {code} / {authCode} / 直接返回字符串三种形态）。 */
  function pickAuthCode(r) {
    const v = typeof r === 'string' ? r : (r?.code ?? r?.authCode ?? '');
    return v ? String(v) : '';
  }

  // 取免登授权码：优先新版 promise 风格 dd.getAuthCode，回退到经典回调风格。
  // 必须自带超时 + 能力检测：某些环境 SDK 既不 resolve 也不 reject，或根本没有可用的
  // 免登 API（可选链会让调用静默变成 no-op），Promise 永不落定 → 页面一直卡在登录中。
  function getAuthCode(corpId, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const dd = window.dd;
      if (!dd) return reject(new Error('钉钉 JSAPI 未就绪'));

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('获取免登码超时（钉钉 JSAPI 无响应）'));
      }, timeoutMs);

      // 把任意拒绝值（钉钉 SDK 常拒绝为 {errCode,errMsg} 对象而非 Error）统一转成可读字符串
      const fail = (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(
          new Error(
            e?.errMsg || e?.errorMessage || e?.message ||
              (typeof e === 'string' ? e : JSON.stringify(e)) || '获取免登码失败',
          ),
        );
      };
      // 成功也做收敛：拿到空码视同失败，别把空串发到后端
      const done = (r) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const code = pickAuthCode(r);
        if (code) resolve(code);
        else fail({ errMsg: '钉钉返回的免登码为空' });
      };

      const hasNew = typeof dd.getAuthCode === 'function';
      const hasOld = !!dd.runtime?.permission?.requestAuthCode;
      if (!hasNew && !hasOld) {
        settled = true;
        clearTimeout(timer);
        return reject(new Error('当前环境不支持钉钉免登（缺少 getAuthCode / requestAuthCode）'));
      }

      if (hasNew) {
        let p = null;
        try {
          p = dd.getAuthCode({ corpId });
        } catch (e) {
          return fail(e);
        }
        if (p && typeof p.then === 'function') {
          p.then(done).catch(fail);
          return;
        }
        // 非 promise 形态（老 SDK 可能直接返回 undefined）→ 继续尝试回调风格
      }

      if (hasOld) {
        dd.runtime.permission.requestAuthCode({ corpId, onSuccess: done, onFail: fail });
        return;
      }

      settled = true;
      clearTimeout(timer);
      reject(new Error('钉钉免登调用未返回结果'));
    });
  }

  /** 把错误信息统一转成可读字符串（兼容 Error / 普通对象 / 字符串）。 */
  function errText(e) {
    if (!e) return '未知错误';
    if (typeof e === 'string') return e;
    if (e.message) return e.message;
    try { return JSON.stringify(e); } catch { return String(e); }
  }

  async function autoDingtalkLogin() {
    if (!dtCorpId.value) return;
    dtLoading.value = true;
    dtStatus.value = 'logging';
    dtMessage.value = '正在通过钉钉自动登录…';
    try {
      await ensureDingtalkJsApi();
      const authCode = await getAuthCode(dtCorpId.value);
      const data = await dingtalkJsapi(authCode);
      if (data && data.ok && data.token) {
        const ok = await auth.applyDingtalkSession(data.token);
        if (ok) {
          if (onSuccess) onSuccess();
          return;
        }
      } else if (data && data.needBind) {
        dtStatus.value = 'unbound';
        // 记住这个钉钉身份：用户用已分配的账号登录后会自动完成绑定，之后即可免登。
        // 不再依赖管理员手工绑定，也不再自动开户（那样会造出 dt_<unionid> 这类无意义的账号）。
        pendingBindToken.value = data.bindToken || '';
        dtMessage.value =
          '该钉钉身份尚未绑定本系统账号。请用你已分配的账号（工号）登录 —— ' +
          '登录成功后会自动绑定当前钉钉，下次打开即可直接免登。';
        dtLoading.value = false;
        return;
      }
      dtStatus.value = 'failed';
      dtMessage.value = '钉钉自动登录未成功：' + errText(data && data.error) + '（可用账号密码登录）';
      dtLoading.value = false;
    } catch (e) {
      dtStatus.value = 'failed';
      // eslint-disable-next-line no-console
      console.error('[钉钉免登失败]', e);
      dtMessage.value =
        '钉钉自动登录失败：' + errText(e) + '（可用账号密码登录' +
        (!inDingtalk.value && dtAuthorizeUrl.value ? '，或点击下方「使用钉钉扫码登录」' : '') + '）';
      dtLoading.value = false;
    }
  }

  /** OAuth 回跳的三种结果都要落到界面上；随后探测三方集成配置，钉钉容器内自动免登。 */
  function probe() {
    const dt = resolvedQuery.dingtalk;
    if (dt === 'needbind' && typeof resolvedQuery.bindToken === 'string') {
      dtStatus.value = 'unbound';
      pendingBindToken.value = resolvedQuery.bindToken;
      dtMessage.value =
        '钉钉已认证成功，但该钉钉身份尚未绑定本系统账号。请用工号密码登录 —— 登录成功后会自动完成绑定，之后即可直接免登。';
    } else if (dt === 'error') {
      dtStatus.value = 'failed';
      const msg = typeof resolvedQuery.msg === 'string' ? resolvedQuery.msg : '';
      dtMessage.value = '钉钉登录失败：' + (msg || '未知原因') + '（可用账号密码登录）';
    } else if (dt === 'disabled') {
      dtStatus.value = 'failed';
      dtMessage.value = '钉钉登录未启用：请先在「三方集成」填写 AppKey / AppSecret 并开启开关。';
    }
    dingtalkConfig()
      .then((cfg) => {
        if (cfg && cfg.enabled) {
          dtEnabled.value = true;
          dtCorpId.value = cfg.corpId || '';
          dtAuthorizeUrl.value = cfg.authorizeUrl || '';
          inDingtalk.value = isInDingtalk();
          if (inDingtalk.value) autoDingtalkLogin();
        }
      })
      .catch(() => { /* 钉钉配置探测失败不影响账密登录 */ });
  }

  /** 账密登录成功后，若已有钉钉验证过的待绑定凭证则自动绑定。绑定失败不影响本次登录。 */
  async function bindAfterSignin() {
    if (!pendingBindToken.value) return;
    try {
      await dingtalkBind(undefined, pendingBindToken.value);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[钉钉绑定失败]', e);
    }
  }

  function openOauth() {
    if (dtAuthorizeUrl.value) window.location.href = dtAuthorizeUrl.value;
  }

  onMounted(probe);

  return {
    dtEnabled, dtCorpId, dtAuthorizeUrl, inDingtalk, dtLoading,
    dtStatus, dtMessage, pendingBindToken,
    bindAfterSignin, openOauth, probe,
  };
}
