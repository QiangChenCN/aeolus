<template>
  <view class="m-login">
    <view class="lg-hero">
      <view class="lg-mark">A</view>
      <view class="lg-title-brand">Aeolus WorkBench</view>
      <view class="lg-tag">任务编排与数据看板</view>
    </view>

    <view class="lg-panel">
      <view class="lg-title">登录工作台</view>
      <view class="lg-sub">使用工作台账号登录以继续</view>

      <wd-notice-bar
        v-if="notice"
        :text="notice"
        :type="noticeType"
        custom-class="lg-notice"
      />

      <wd-input
        v-model="username"
        label="用户名"
        placeholder="请输入用户名"
        :prefix-icon="null"
        clearable
      />
      <wd-input
        v-model="password"
        label="密码"
        placeholder="请输入密码"
        type="password"
        clearable
      />

      <view class="lg-remember">
        <wd-checkbox v-model="remember" shape="square">记住我（7 天内免登录）</wd-checkbox>
      </view>

      <wd-button
        type="primary"
        block
        :loading="loading"
        custom-class="lg-submit"
        @click="submit"
      >登录</wd-button>

      <view class="lg-hint">登录即代表您同意相关使用规范；如忘记密码或无法登录，请联系系统管理员。</view>
    </view>

    <SwitchToDesktop />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useAuthStore } from '@shared/stores/auth.js';
import SwitchToDesktop from '../../components/SwitchToDesktop.vue';
import { useDingtalkLogin } from '@shared/composables/useDingtalkLogin.js';

const auth = useAuthStore();

const username = ref('');
const password = ref('');
const remember = ref(false);
const loading = ref(false);
const error = ref('');

// 钉钉登录逻辑与桌面端共用；uni-app H5 容器内会自动免登，小程序端暂不提供扫码入口
const dt = useDingtalkLogin({
  onSuccess: () => uni.reLaunch({ url: '/pages/index/index' }),
  query: {},
});

const notice = computed(() => {
  if (error.value) return error.value;
  if (dt.dtStatus.value === 'logging') return '正在通过钉钉自动登录…';
  if (dt.dtStatus.value === 'unbound' || dt.dtStatus.value === 'failed') return dt.dtMessage.value;
  return '';
});
const noticeType = computed(() => (error.value || dt.dtStatus.value === 'failed' ? 'error' : 'warning'));

async function submit() {
  error.value = '';
  if (!username.value || !password.value) { error.value = '请输入用户名和密码'; return; }
  loading.value = true;
  try {
    await auth.signin(username.value, password.value, remember.value);
    await dt.bindAfterSignin();
    uni.reLaunch({ url: '/pages/index/index' });
  } catch (e) {
    error.value = e.message || '登录失败';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.m-login { min-height: 100vh; padding-top: env(safe-area-inset-top); }

.lg-hero {
  padding: clamp(48px, 12vh, 96px) 24px 56px;
  color: #fff;
  background: linear-gradient(155deg, var(--c-brand) 0%, var(--c-brand-dark) 100%);
  border-bottom-left-radius: 28px;
  border-bottom-right-radius: 28px;
}
.lg-mark {
  width: 52px; height: 52px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.2);
  font-size: 26px; font-weight: var(--fw-bold);
}
.lg-title-brand { margin-top: var(--sp-16); font-size: 22px; font-weight: var(--fw-bold); }
.lg-tag { margin-top: var(--sp-6); font-size: 13px; opacity: 0.9; }

.lg-panel {
  margin: -28px 16px 0;
  padding: 24px 20px calc(28px + env(safe-area-inset-bottom));
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 10px 30px rgba(20, 30, 60, 0.08);
}
.lg-title { font-size: 20px; font-weight: var(--fw-bold); }
.lg-sub { margin: var(--sp-6) 0 var(--sp-20); color: #969799; font-size: 13px; }
.lg-remember { margin: var(--sp-16) 0; font-size: 13px; }
.lg-submit { height: 48px; }
.lg-hint { margin-top: var(--sp-20); font-size: 12px; line-height: 1.6; color: #969799; }
</style>
