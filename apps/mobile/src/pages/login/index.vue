<template>
  <view class="phone">
    <!-- 顶部品牌区 -->
    <header class="hero">
      <view class="speed-lines" />
      <view class="brand-badge">
        <image class="badge-logo" src="@shared-ui/assets/aeolus-workbench.svg" mode="aspectFit" />
        <text>Aeolus Workbench</text>
      </view>
      <view class="hero-title">欢迎回来，</view>
      <view class="hero-title accent">工作正当时</view>
      <view class="hero-sub">登录工作台，数据与任务一站管理</view>
    </header>

    <!-- 表单面板 -->
    <main class="panel">
      <!-- 登录方式 Tab -->
      <view class="seg-tabs">
        <view class="seg-tab" :class="{ active: mode === 'pwd' }" @click="mode = 'pwd'">密码登录</view>
        <view class="seg-tab" :class="{ active: mode === 'sms' }" @click="mode = 'sms'">验证码登录</view>
      </view>

      <!-- 验证码登录 -->
      <view v-if="mode === 'sms'">
        <view class="field">
          <wd-icon name="phone" size="20px" color="#c2b4ab" />
          <input v-model="phone" class="field-input" type="number" maxlength="11" placeholder="手机号" />
        </view>
        <view class="field">
          <wd-icon name="lock" size="20px" color="#c2b4ab" />
          <input v-model="smsCode" class="field-input" type="number" maxlength="6" placeholder="验证码" />
          <text class="link-btn" @click="sendCode">{{ codeText }}</text>
        </view>
        <view v-if="smsError" class="field-error">{{ smsError }}</view>
        <view class="aux-row">
          <text @click="toast.show('请联系管理员重置手机号登录')">换手机号登录？</text>
          <text @click="toast.show('验证码已重发')">收不到验证码</text>
        </view>
        <view class="btn-main" :class="{ shake: shakeBtn }" @click="submitSms">登 录</view>
      </view>

      <!-- 密码登录 -->
      <view v-else>
        <view class="field">
          <wd-icon name="lock" size="20px" color="#c2b4ab" />
          <input v-model="username" class="field-input" type="text" placeholder="手机号 / 工号" autocomplete="username" />
        </view>
        <view class="field">
          <wd-icon name="lock" size="20px" color="#c2b4ab" />
          <input
            v-model="password"
            class="field-input"
            :type="showPassword ? 'text' : 'password'"
            placeholder="密码"
            autocomplete="current-password"
          />
          <image
            v-show="showPassword"
            class="eye-icon"
            src="@shared-ui/assets/eye-open.svg"
            mode="aspectFit"
            @click="showPassword = !showPassword"
          />
          <image
            v-show="!showPassword"
            class="eye-icon"
            src="@shared-ui/assets/eye-closed.svg"
            mode="aspectFit"
            @click="showPassword = !showPassword"
          />
        </view>
        <view class="aux-row">
          <view class="remember" @click="remember = !remember">
            <view class="remember-box" :class="{ checked: remember }">
              <wd-icon v-if="remember" name="check" size="11px" color="#fff" />
            </view>
            <text>七天内免登录</text>
          </view>
          <text @click="toast.show('请联系管理员重置密码')">忘记密码</text>
        </view>
        <view class="btn-main" :class="{ shake: shakeBtn, disabled: loading }" @click="submitPwd">{{ loading ? '登录中…' : '登 录' }}</view>
      </view>

      <!-- 协议 -->
      <view class="agreement" @click="agreed = !agreed">
        <view class="agreement-radio" :class="{ checked: agreed }">
          <wd-icon v-if="agreed" name="check" size="11px" color="#fff" />
        </view>
        <view class="agreement-text">
          我已阅读并同意 <text class="link">《用户服务协议》</text>与<text class="link">《隐私政策》</text>，知晓工作台数据仅用于内部管理
        </view>
      </view>

      <!-- 钉钉自动登录 / OAuth 回跳状态提示，与桌面端同口径 -->
      <view v-if="dt.dtMessage" class="dt-message">{{ dt.dtMessage }}</view>

      <!-- 其他登录方式 -->
      <view class="divider">其他登录方式</view>
      <view class="oauth">
        <view class="oauth-btn" @click="dingtalkLogin"><image class="oauth-icon" src="@/static/icons/dingtalk.svg" mode="aspectFit" /></view>
      </view>

      <view class="footer">遇到问题？<text class="footer-link" @click="toast.show('已通知管理员协助')">联系管理员</text></view>
      <view class="desktop-entry" @click="toDesktop">切换桌面版</view>
    </main>

    <!-- 轻提示组件：登录失败/操作反馈用 toast.error / toast.show -->
    <wd-toast />
  </view>
</template>

<script setup>
import { reactive, ref, onMounted, onUnmounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useToast } from 'wot-design-uni';
import { useAuthStore } from '@shared/stores/auth.js';
import { useDingtalkLogin } from '@shared/composables/useDingtalkLogin.js';
import { setManualView, targetPath } from '@shared/utils/view-mode.js';

const auth = useAuthStore();

// OAuth 回调（未绑定 / 失败）由后端重定向回本页并带 query。onLoad 早于 onMounted，
// 用 reactive 对象注入共享 composable，probe 执行时才能读到最新的页面参数。
const pageQuery = reactive({});
onLoad((options) => { Object.assign(pageQuery, options || {}); });
const dt = useDingtalkLogin({
  query: pageQuery,
  configParams: 'view=mobile',
  onSuccess: () => uni.reLaunch({ url: '/pages/index/index' }),
});

// OAuth 成功后后端直接跳 /m/，本页首次加载时会话已就绪；与桌面端路由守卫同口径直接进首页。
onMounted(async () => {
  await auth.bootstrap();
  if (auth.authenticated) uni.reLaunch({ url: '/pages/index/index' });
});

const mode = ref('pwd');
const username = ref('');
const password = ref('');
const phone = ref('');
const smsCode = ref('');
const remember = ref(false);
const agreed = ref(false);
const showPassword = ref(false);
const loading = ref(false);
const shakeBtn = ref(false);
const smsError = ref('');
const codeText = ref('获取验证码');

// 页面级计时器句柄：卸载时必须清理，否则 reLaunch 后 setInterval 仍每 1 秒改动已销毁的响应式对象。
let codeTimer = null;
const shakeTimers = [];
onUnmounted(() => {
  if (codeTimer) clearInterval(codeTimer);
  shakeTimers.forEach(clearTimeout);
});

const toast = useToast();

function shake() {
  shakeBtn.value = false;
  shakeTimers.push(setTimeout(() => { shakeBtn.value = true; }, 10));
  shakeTimers.push(setTimeout(() => { shakeBtn.value = false; }, 400));
}

function checkAgreement() {
  if (!agreed.value) {
    shake();
    toast.show('请先勾选同意服务协议');
    return false;
  }
  return true;
}

function sendCode() {
  if (!/^1\d{10}$/.test(phone.value)) { smsError.value = '请输入正确的 11 位手机号'; return; }
  smsError.value = '';
  let left = 60;
  codeText.value = left + 's 后重发';
  if (codeTimer) clearInterval(codeTimer);
  codeTimer = setInterval(() => {
    left--;
    if (left <= 0) { clearInterval(codeTimer); codeTimer = null; codeText.value = '重新获取'; }
    else codeText.value = left + 's 后重发';
  }, 1000);
  toast.show('验证码已发送');
}

async function submitSms() {
  if (!/^1\d{10}$/.test(phone.value)) { smsError.value = '请输入正确的 11 位手机号'; return; }
  if (smsCode.value.length < 4) { smsError.value = '请输入 6 位验证码'; return; }
  if (!checkAgreement()) return;
  toast.show('验证码登录暂未接入，请使用密码登录');
}

async function submitPwd() {
  if (loading.value) return;
  if (!username.value || !password.value) { toast.error('请输入手机号 / 工号和密码'); return; }
  if (!checkAgreement()) return;
  loading.value = true;
  try {
    await auth.signin(username.value, password.value, remember.value);
    // 与桌面端一致：若钉钉 OAuth 已完成身份校验但账号未绑定，此处登录成功后自动绑定。
    await dt.bindAfterSignin();
    uni.reLaunch({ url: '/pages/index/index' });
  } catch (e) {
    toast.error(e.message || '登录失败');
  } finally {
    loading.value = false;
  }
}

function dingtalkLogin() {
  if (!dt.dtEnabled) {
    toast.show('钉钉登录未启用，请联系管理员');
    return;
  }
  // 钉钉客户端内手动点击视为主动登录：force 会解除退出时设置的自动免登抑制。
  if (dt.inDingtalk) {
    dt.probe(true);
    return;
  }
  // 普通浏览器与桌面端一致：跳钉钉 OAuth2 授权页，回调种会话 Cookie 后回到移动端。
  dt.openOauth();
}

function toDesktop() {
  // 切换桌面版依赖浏览器 cookie 与 location，仅 H5 可用。
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    toast.show('请在浏览器中打开以切换桌面版');
    return;
  }
  setManualView('desktop');
  window.location.replace(targetPath('mobile', window.location.pathname, window.location.search));
}
</script>

<style scoped>
.phone {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--paper);
  padding-top: env(safe-area-inset-top);
}

/* 顶部品牌区 */
.hero {
  position: relative;
  flex: none;
  padding: 44px 28px 52px;
  overflow: hidden;
  background:
    radial-gradient(340px 220px at 110% -30%, rgba(255, 255, 255, 0.22) 0%, transparent 60%),
    linear-gradient(145deg, var(--brand-500) 0%, var(--brand-600) 88%);
  color: #fff;
  border-bottom-right-radius: 36px;
}
.speed-lines {
  position: absolute;
  right: -14px;
  bottom: -8px;
  width: 120px;
  height: 120px;
  background: repeating-linear-gradient(-35deg, transparent 0 14px, rgba(255, 255, 255, 0.18) 14px 18px);
  border-radius: 50% 50% 0 60%;
}
.brand-badge {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 14px 5px 6px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
}
.badge-logo {
  width: 22px;
  height: 22px;
  display: block;
  border-radius: 50%;
  overflow: hidden;
}
.hero-title {
  position: relative;
  margin-top: 22px;
  font-size: 32px;
  font-weight: 800;
  line-height: 1.25;
  letter-spacing: 0.01em;
}
.hero-title.accent {
  display: inline-block;
  border-bottom: 5px solid rgba(255, 255, 255, 0.45);
  padding-bottom: 1px;
}
.hero-sub {
  position: relative;
  margin-top: 10px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.85);
}

/* 表单面板 */
.panel {
  flex: 1;
  margin-top: -28px;
  padding: 30px 26px 20px;
  background: #fff;
  border-radius: 28px 28px 0 0;
  box-shadow: 0 -12px 30px rgba(140, 60, 15, 0.1);
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
}

.seg-tabs { margin-bottom: 26px; }

.field {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 56px;
  margin-bottom: 14px;
  padding: 0 16px;
  border: 1.5px solid var(--line);
  border-radius: 16px;
  background: var(--paper);
}
.field-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  font-size: 16px;
  color: var(--ink-900);
  background: transparent;
}
.field-input::placeholder { color: var(--ink-300); }
.link-btn { flex: none; font-size: 14px; font-weight: 600; color: var(--brand-600); }
.eye-icon { flex: none; width: 22px; height: 22px; }
.field-error { color: #d93025; font-size: 12px; margin: -8px 4px 12px; }

.aux-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 2px 2px 22px;
  font-size: 13px;
  color: var(--ink-500);
}
.remember { display: flex; align-items: center; gap: 6px; }
.remember-box {
  width: 15px;
  height: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ink-300);
  border-radius: 3px;
  background: #fff;
}
.remember-box.checked { background: var(--brand-500); border-color: var(--brand-500); }

.btn-main {
  width: 100%;
  height: 54px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: linear-gradient(180deg, var(--brand-500) 0%, var(--brand-600) 100%);
  color: #fff;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.14em;
  box-shadow: 0 10px 22px -8px rgba(255, 80, 0, 0.55);
}
.btn-main.disabled { opacity: 0.7; pointer-events: none; }
.btn-main.shake { animation: shake 380ms cubic-bezier(0.25, 1, 0.5, 1); }
@keyframes shake {
  20% { transform: translateX(-6px); }
  45% { transform: translateX(5px); }
  70% { transform: translateX(-3px); }
  100% { transform: translateX(0); }
}

.agreement {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: 18px;
  font-size: 12px;
  color: var(--ink-500);
  line-height: 1.6;
}
.agreement-radio {
  flex: none;
  width: 17px;
  height: 17px;
  margin-top: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid var(--ink-300);
  border-radius: 50%;
}
.agreement-radio.checked { border-color: var(--brand-500); background: var(--brand-500); }
.agreement-text { flex: 1; }
.link { color: var(--brand-600); font-weight: 600; }

.dt-message {
  margin: 4px 4px -10px;
  font-size: 12px;
  line-height: 1.5;
  color: #c2410c;
}

.divider {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  margin: 26px 0 18px;
  color: var(--ink-300);
  font-size: 12px;
  letter-spacing: 0.08em;
}
.divider::before, .divider::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 30%;
  height: 1px;
  background: var(--line);
}
.divider::before { left: 0; }
.divider::after { right: 0; }

.oauth { display: flex; align-items: center; justify-content: center; gap: 48px; }
.oauth-btn {
  display: flex;
  align-items: center;
  justify-content: center;
}
.oauth-icon { width: 33px; height: 33px; }

.footer {
  margin-top: auto;
  padding-top: 18px;
  text-align: center;
  font-size: 12px;
  color: var(--ink-300);
}
.footer-link { color: var(--ink-500); font-weight: 600; }
.desktop-entry { margin-top: 10px; text-align: center; font-size: 11px; color: var(--ink-300); text-decoration: underline; }

/* 登录提示条与 Wot UI 覆盖统一在全局 */
</style>
