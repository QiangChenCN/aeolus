<template>
  <!-- 会话门控：bootstrap 完成前不渲染依赖登录态的内容；未登录则重定向登录页。
       uni-app 不等待 onLaunch 返回的 Promise，所以用组件级判断，而不是靠启动流程 await。
       组件自身不产生包裹节点（H5 优先，与 AppTabBar 的 inline SVG 同口径），
       插槽节点在 DOM 上仍是父容器的直接子节点，原有 flex 布局不受影响。 -->
  <slot v-if="auth.booted && auth.authenticated" />
  <view v-else-if="auth.booted" class="gate-loading">正在跳转登录…</view>
  <view v-else class="gate-loading">
    <slot name="loading">
      <view class="gate-loading-text">正在加载…</view>
    </slot>
  </view>
</template>

<script setup>
import { watch } from 'vue';
import { useAuthStore } from '@shared/stores/auth.js';

const auth = useAuthStore();

// bootstrap 结束后仍未登录 → 重定向上登录页（与 401 处理器同一落点）。
// 只在 booted 翻转时判断一次：未引导完成前不能误判，引导后 authenticated 变化由 signin/401 流程接管。
watch(
  () => auth.booted,
  (booted) => {
    if (booted && !auth.authenticated) {
      uni.reLaunch({ url: '/pages/login/index' });
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.gate-loading {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-300);
  font-size: 14px;
}
.gate-loading-text {
  color: var(--ink-300);
  font-size: 14px;
}
</style>
