<template>
  <view class="m-screen">
    <scroll-view class="m-scroll" scroll-y>
      <view class="hero">
        <view class="hi">早上好，{{ displayName }}</view>
        <view class="hero-title">今日概览</view>
      </view>

      <view class="metrics">
        <view class="metric" @click="toast('今日任务详情（演示）')">
          <view class="n">12</view><view class="t">今日任务</view>
        </view>
        <view class="metric" @click="toast('待处理详情（演示）')">
          <view class="n warn">3</view><view class="t">待处理</view>
        </view>
        <view class="metric" @click="toast('异常详情（演示）')">
          <view class="n warn">1</view><view class="t">异常</view>
        </view>
      </view>

      <view class="sec-title">快捷入口</view>
      <view class="grid">
        <view class="q-item" @click="toast('数据看板（演示）')">
          <view class="q-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V10M10 20V4M16 20v-7M21 20H3" stroke-linecap="round"/></svg></view>
          <text class="q-label">数据看板</text>
        </view>
        <view class="q-item" @click="toast('站点与人员（演示）')">
          <view class="q-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.7-3 3-4.5 5.5-4.5s4.8 1.5 5.5 4.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.6c2 .3 3.6 1.5 4 3.9" stroke-linecap="round"/></svg></view>
          <text class="q-label">站点人员</text>
        </view>
        <view class="q-item" @click="toast('报表导出（演示）')">
          <view class="q-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3.5h8L19 8v12.5H6z" stroke-linejoin="round"/><path d="M9 12h6M9 15.5h6" stroke-linecap="round"/></svg></view>
          <text class="q-label">报表导出</text>
        </view>
        <view class="q-item" @click="toast('系统设置（演示）')">
          <view class="q-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 4.5V3M12 21v-1.5M4.5 12H3M21 12h-1.5M6.7 6.7 5.6 5.6M18.4 18.4l-1.1-1.1M6.7 17.3l-1.1 1.1M18.4 5.6l-1.1 1.1" stroke-linecap="round"/></svg></view>
          <text class="q-label">设置</text>
        </view>
      </view>

      <wd-notice-bar
        v-if="auth.mustChange"
        text="初始密码尚未修改，部分功能不可用。请先在桌面端个人中心完成改密。"
        type="warning"
      />

      <view class="sec-title">待办提醒</view>
      <view class="list" style="margin-bottom: 24px">
        <view class="row" @click="toast('申诉处理（演示）')">
          <view class="r-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 4 3 20h18L12 4z" stroke-linejoin="round"/><path d="M12 10v4" stroke-linecap="round"/><circle cx="12" cy="17" r=".5" fill="currentColor"/></svg></view>
          <view class="r-main">
            <view class="r-title">2 条违规申诉待处理</view>
            <view class="r-sub">截止今天 18:00</view>
          </view>
          <view class="r-tag tag-danger">紧急</view>
        </view>
        <view class="row" @click="toast('健康证提醒（演示）')">
          <view class="r-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="6" width="17" height="13" rx="2.5"/><path d="M9 3.5h6v4H9z"/><path d="M10.5 12.5h3" stroke-linecap="round"/></svg></view>
          <view class="r-main">
            <view class="r-title">3 人健康证 7 日内到期</view>
            <view class="r-sub">需通知复审</view>
          </view>
          <view class="r-tag tag-warn">提醒</view>
        </view>
      </view>
    </scroll-view>
    <AppTabBar current="home" />
    <wd-toast />
  </view>
</template>

<script setup>
import { computed } from 'vue';
import { useToast } from 'wot-design-uni';
import { useAuthStore } from '@shared/stores/auth.js';
import AppTabBar from '../../components/AppTabBar.vue';

const auth = useAuthStore();
const displayName = computed(() => auth.name || auth.user || '用户');
const toastApi = useToast();
function toast(msg) { toastApi.show(msg); }
</script>

<style scoped>
.hero {
  padding: calc(56px + env(safe-area-inset-top, 0px)) 24px 46px;
  background:
    radial-gradient(340px 220px at 110% -30%, rgba(255,255,255,.22) 0%, transparent 60%),
    linear-gradient(145deg, var(--brand-500) 0%, var(--brand-600) 88%);
  color: #fff;
  border-bottom-right-radius: 36px;
  position: relative;
  overflow: hidden;
}
.hero::after {
  content: 'A';
  position: absolute; right: -4px; top: -30px;
  font-size: 120px; font-weight: 800; font-style: italic;
  color: rgba(255,255,255,.10); line-height: 1; pointer-events: none;
}
.hero .hi { font-size: 14px; opacity: .85; position: relative; z-index: 1; }
.hero-title { margin-top: 4px; font-size: 26px; font-weight: 800; position: relative; z-index: 1; }

.metrics { display: flex; gap: 12px; margin: -28px 20px 0; position: relative; z-index: 2; }
.metric {
  flex: 1; background: var(--card);
  border-radius: var(--radius-m);
  padding: 14px 16px;
  box-shadow: 0 10px 24px rgba(140,60,15,.12);
  border: 1px solid var(--line);
}
.metric .n { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; }
.metric .n.warn { color: var(--danger); }
.metric .t { margin-top: 2px; font-size: 12px; color: var(--ink-500); }

.grid {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 10px; margin: 0 20px;
  background: var(--card); border-radius: var(--radius-m);
  border: 1px solid var(--line); padding: 14px 6px;
}
.q-item { display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 6px 0; }
.q-icon {
  width: 40px; height: 40px; border-radius: 13px;
  display: grid; place-items: center;
  background: var(--brand-50); color: var(--brand-600);
}
.q-icon svg { width: 19px; height: 19px; }
.q-label { font-size: 11.5px; color: var(--ink-700); }
</style>
