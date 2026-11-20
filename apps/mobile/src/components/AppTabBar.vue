<template>
  <!-- 自定义底部标签栏：1:1 还原 menu.html 原型（含未读角标）。
       图标用 inline SVG 以保留 currentColor 激活变色；H5 优先，
       若后续要上小程序端需替换为 image / iconfont。 -->
  <view class="tabbar">
    <view
      v-for="tab in tabs"
      :key="tab.key"
      class="tab-btn"
      :class="{ active: tab.key === current }"
      :aria-current="tab.key === current ? 'page' : undefined"
      @click="switchTo(tab)"
    >
      <view class="tab-ico">
        <!-- 工作台 -->
        <svg v-if="tab.key === 'home'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 11 12 4l8 7v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-8z" stroke-linejoin="round"/><path d="M10 20.5v-5h4v5" stroke-linecap="round"/></svg>
        <!-- 任务 -->
        <svg v-else-if="tab.key === 'task'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="m8.5 12 2.3 2.3 4.7-4.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <!-- 考勤 -->
        <svg v-else-if="tab.key === 'att'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17" stroke-linecap="round"/><path d="M9.5 14.5 12 17l3-3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <!-- 消息 -->
        <svg v-else-if="tab.key === 'msg'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10.3 21a2 2 0 0 0 3.4 0" stroke-linecap="round"/></svg>
        <!-- 我的 -->
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="8" r="3.5"/><path d="M5 19.5c1-3.6 3.8-5.5 7-5.5s6 1.9 7 5.5" stroke-linecap="round"/></svg>

        <view v-if="tab.key === 'task'" class="badge">3</view>
        <view v-if="tab.key === 'msg' && current !== 'msg'" class="badge">2</view>
      </view>
      <text class="tab-label">{{ tab.label }}</text>
    </view>
  </view>
</template>

<script setup>
const props = defineProps({
  // 当前页标识：home | task | att | msg | me
  current: { type: String, required: true },
});

const tabs = [
  { key: 'home', label: '工作台', url: '/pages/index/index' },
  { key: 'task', label: '任务', url: '/pages/task/index' },
  { key: 'att', label: '考勤', url: '/pages/att/index' },
  { key: 'msg', label: '消息', url: '/pages/msg/index' },
  { key: 'me', label: '我的', url: '/pages/me/index' },
];

function switchTo(tab) {
  if (tab.key === props.current) return;
  // redirectTo 关闭当前页再打开，避免 5 个 tab 在页面栈里无限堆积。
  uni.redirectTo({ url: tab.url });
}
</script>

<style scoped>
.tabbar {
  flex-shrink: 0;
  display: flex;
  background: var(--card);
  border-top: 1px solid var(--line);
  padding: 8px 8px calc(10px + env(safe-area-inset-bottom, 0px));
}
.tab-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 5px 0;
  color: var(--ink-300);
  position: relative;
  transition: color 180ms var(--ease-out-quart);
}
.tab-btn.active { color: var(--brand-600); }
.tab-ico { position: relative; width: 22px; height: 22px; }
.tab-ico svg { width: 22px; height: 22px; display: block; }
.tab-label { font-size: 10.5px; font-weight: 600; letter-spacing: 0.02em; }
.badge {
  position: absolute; top: -4px; left: calc(50% + 6px);
  min-width: 16px; height: 16px; padding: 0 4px;
  border-radius: 999px; background: var(--danger); color: #fff;
  font-size: 10px; font-weight: 700; line-height: 16px; text-align: center;
  border: 2px solid var(--card); box-sizing: content-box;
}
</style>
