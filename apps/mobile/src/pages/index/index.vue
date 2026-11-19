<template>
  <view class="m-home">
    <view class="welcome">
      <view class="wc-label">移动端工作空间</view>
      <view class="wc-title">你好，{{ displayName }}</view>
      <view class="wc-sub">欢迎使用 Aeolus 移动端</view>
    </view>

    <wd-notice-bar
      v-if="auth.mustChange"
      text="初始密码尚未修改，部分功能不可用。请先在桌面端个人中心完成改密。"
      type="warning"
    />

    <view class="placeholder">
      <wd-icon name="chart-line" size="36px" color="#FF5000" />
      <view class="ph-title">页面建设中</view>
      <view class="ph-desc">移动端将优先接入考核看板、运单查询与任务中心。当前页面为布局占位。</view>
    </view>

    <SwitchToDesktop />
  </view>
</template>

<script setup>
import { computed } from 'vue';
import { useAuthStore } from '@shared/stores/auth.js';
import SwitchToDesktop from '../../components/SwitchToDesktop.vue';

const auth = useAuthStore();
const displayName = computed(() => auth.name || auth.user || '用户');
</script>

<style scoped>
.m-home { padding: 12px; display: flex; flex-direction: column; gap: 12px; }

.welcome {
  padding: 20px;
  border-radius: 16px;
  color: #fff;
  background: linear-gradient(135deg, var(--c-brand), var(--c-brand-dark));
}
.wc-label { font-size: 12px; opacity: 0.85; }
.wc-title { margin: var(--sp-8) 0 var(--sp-4); font-size: 20px; font-weight: var(--fw-bold); }
.wc-sub { font-size: 13px; opacity: 0.9; }

.placeholder {
  padding: 40px 20px;
  border: 1px dashed #dcdee0;
  border-radius: 16px;
  text-align: center;
  background: #fff;
}
.ph-title { margin: var(--sp-12) 0 var(--sp-8); font-size: 15px; font-weight: 600; }
.ph-desc { font-size: 13px; line-height: 1.6; color: #969799; }
</style>
