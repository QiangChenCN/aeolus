<template>
  <view class="switch-desktop" @click="toDesktop">
    <wd-icon name="desktop" size="16px" color="#969799" />
    <text class="sd-label">切换桌面版</text>
  </view>
</template>

<script setup>
function toDesktop() {
  // 写 cookie 覆盖后端 UA 软跳转，避免移动端用户被反复弹回 /m/
  const oneYear = 365 * 24 * 60 * 60;
  document.cookie = `wb_view=desktop; path=/; max-age=${oneYear}; SameSite=Lax`;
  window.location.href = '/';
}
</script>

<style scoped>
.switch-desktop {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 16px 0 calc(16px + env(safe-area-inset-bottom));
  color: #969799;
  font-size: 12px;
}
</style>
