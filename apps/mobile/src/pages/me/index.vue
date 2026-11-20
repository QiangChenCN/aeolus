<template>
  <view class="m-screen">
    <AuthGate>
    <scroll-view class="m-scroll" scroll-y :scroll-top="scrollTop" @scroll="onScroll">
      <view class="page-head"><h1>个人中心</h1></view>

      <!-- 身份卡 -->
      <view class="pass-card">
        <view class="pass-top" @click="toast('个人资料（演示）')">
          <view class="avatar">{{ avatarChar }}</view>
          <view class="pass-id">
            <view class="pass-name">{{ displayName }}</view>
            <view class="pass-role"><text class="tag">{{ roleLabel }}</text></view>
          </view>
          <view class="pass-go">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m9 18 6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </view>
        </view>
      </view>

      <view class="sec-title">账号</view>
      <view class="group">
        <view class="cell" @click="toast('账号与安全（演示）')">
          <view class="c-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4.5" y="10" width="15" height="10" rx="2.5"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/></svg></view>
          <text class="c-label">账号与安全</text>
          <text class="c-value">已保护</text>
          <svg class="c-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m9 18 6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </view>
      </view>

      <view class="sec-title">通用</view>
      <view class="group">
        <view class="cell" @click="toggleNotify">
          <view class="c-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10.3 21a2 2 0 0 0 3.4 0" stroke-linecap="round"/></svg></view>
          <text class="c-label">消息通知</text>
          <view class="switch" :class="{ on: notifyOn }" role="switch" :aria-checked="String(notifyOn)" @click.stop="toggleNotify"></view>
        </view>
        <view class="cell" @click="toast('深色模式（演示）')">
          <view class="c-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" stroke-linejoin="round"/></svg></view>
          <text class="c-label">深色模式</text>
          <text class="c-value">跟随系统</text>
          <svg class="c-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m9 18 6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </view>
      </view>

      <view class="sec-title">关于</view>
      <view class="group">
        <view class="cell" @click="toast('帮助中心（演示）')">
          <view class="c-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.3 9.3a2.8 2.8 0 0 1 5.4.9c0 1.8-2.7 2.3-2.7 3.6" stroke-linecap="round"/><circle cx="12" cy="17" r="0.5" fill="currentColor"/></svg></view>
          <text class="c-label">帮助中心</text>
          <svg class="c-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m9 18 6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </view>
        <view class="cell" @click="toast('关于 Aeolus Workbench（演示）')">
          <view class="c-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4.5" stroke-linecap="round"/><circle cx="12" cy="8.2" r="0.5" fill="currentColor"/></svg></view>
          <text class="c-label">关于</text>
          <svg class="c-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m9 18 6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </view>
      </view>

      <view class="logout-wrap">
        <view class="btn-logout" @click="openSheet">退出登录</view>
      </view>
      <view class="version">Aeolus Workbench v1.0.0</view>
    </scroll-view>
    </AuthGate>

    <AppTabBar current="me" />

    <!-- 退出确认底部弹层 -->
    <view class="mask" :class="{ show: sheetOpen }" @click="closeSheet"></view>
    <view class="sheet" :class="{ show: sheetOpen }">
      <view class="grab"></view>
      <view class="sheet-title">确认退出登录？</view>
      <view class="sheet-desc">退出后需要重新登录才能继续使用工作台</view>
      <view class="actions">
        <view class="btn-cancel" @click="closeSheet">取消</view>
        <view class="btn-confirm" @click="confirmLogout">退出</view>
      </view>
    </view>

    <wd-toast />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useToast } from 'wot-design-uni';
import { useAuthStore } from '@shared/stores/auth.js';
import { useTabStateStore } from '../../stores/tab-state.js';
import AppTabBar from '../../components/AppTabBar.vue';
import AuthGate from '../../components/AuthGate.vue';

const auth = useAuthStore();
const tabState = useTabStateStore();
const scrollTop = ref(tabState.getScroll('me'));
function onScroll(e) { tabState.setScroll('me', e.detail.scrollTop); }
const toastApi = useToast();
function toast(msg) { toastApi.show(msg); }

const displayName = computed(() => auth.name || auth.user || '用户');
const avatarChar = computed(() => displayName.value ? String(displayName.value).charAt(0).toUpperCase() : 'A');
const roleLabel = computed(() => auth.role === 'admin' ? '管理员' : (auth.role || '成员'));

const notifyOn = ref(true);
function toggleNotify() {
  notifyOn.value = !notifyOn.value;
  toast(notifyOn.value ? '消息通知已开启' : '消息通知已关闭');
}

const sheetOpen = ref(false);
function openSheet() { sheetOpen.value = true; }
function closeSheet() { sheetOpen.value = false; }
function confirmLogout() {
  closeSheet();
  toast('已退出登录，返回登录页…（演示）');
  setTimeout(() => uni.reLaunch({ url: '/pages/login/index' }), 900);
}
</script>

<style scoped>
.pass-card {
  position: relative; margin: 6px 20px 0;
  border-radius: var(--radius-l);
  background:
    radial-gradient(300px 200px at 105% -25%, rgba(255,255,255,0.20) 0%, transparent 55%),
    linear-gradient(150deg, var(--brand-500) 0%, var(--brand-600) 90%);
  color: #fff; padding: 20px;
  box-shadow: 0 18px 40px -14px rgba(230, 72, 0, 0.55);
  overflow: hidden;
}
.pass-card::after {
  content: 'A'; position: absolute; right: -6px; top: -34px;
  font-size: 130px; font-weight: 800; font-style: italic;
  color: rgba(255,255,255,0.08); pointer-events: none; line-height: 1;
}
.pass-top { display: flex; align-items: center; gap: 15px; position: relative; z-index: 1; }
.avatar {
  width: 58px; height: 58px; border-radius: 19px;
  background: rgba(255,255,255,0.94); color: var(--brand-600);
  font-size: 24px; font-weight: 800;
  display: grid; place-items: center; flex-shrink: 0;
}
.pass-id { flex: 1; min-width: 0; }
.pass-name { font-size: 20px; font-weight: 800; letter-spacing: 0.02em; }
.pass-role { margin-top: 4px; font-size: 12.5px; color: rgba(255,255,255,0.85); }
.pass-role .tag {
  display: inline-block; background: rgba(255,255,255,0.2);
  border: 1px solid rgba(255,255,255,0.4);
  font-weight: 600; font-size: 11px;
  padding: 1.5px 8px; border-radius: 7px;
}
.pass-go {
  width: 38px; height: 38px; border-radius: 50%;
  background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.4);
  display: grid; place-items: center; flex-shrink: 0;
}
.pass-go svg { width: 17px; height: 17px; }

.group { margin: 0 20px; background: var(--card); border-radius: var(--radius-m); border: 1px solid var(--line); overflow: hidden; }
.cell { display: flex; align-items: center; gap: 13px; padding: 14px 16px; }
.cell + .cell { border-top: 1px solid var(--line); }
.c-icon { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; flex-shrink: 0; background: var(--brand-50); color: var(--brand-600); }
.c-icon svg { width: 16px; height: 16px; }
.c-label { flex: 1; font-size: 14.5px; font-weight: 500; color: var(--ink-900); }
.c-value { font-size: 13px; color: var(--ink-300); }
.c-arrow { width: 15px; height: 15px; color: var(--ink-300); flex-shrink: 0; }
.switch { position: relative; width: 46px; height: 27px; border-radius: 999px; background: var(--ink-300); transition: background 200ms; flex-shrink: 0; }
.switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 21px; height: 21px; border-radius: 50%; background: #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.2); transition: transform 220ms var(--ease-out-quart); }
.switch.on { background: var(--brand-500); }
.switch.on::after { transform: translateX(19px); }

.logout-wrap { margin: 22px 20px 0; }
.btn-logout { width: 100%; height: 50px; border-radius: var(--radius-m); background: var(--card); border: 1px solid var(--line); color: var(--danger); font-size: 15px; font-weight: 600; display: grid; place-items: center; }
.version { text-align: center; padding: 16px 0 24px; font-size: 12px; color: var(--ink-300); letter-spacing: 0.04em; }

.mask { position: fixed; inset: 0; background: rgba(43,29,21,0.45); opacity: 0; pointer-events: none; transition: opacity 240ms; z-index: 40; }
.mask.show { opacity: 1; pointer-events: auto; }
.sheet { position: fixed; left: 0; right: 0; bottom: 0; background: var(--card); border-radius: var(--radius-l) var(--radius-l) 0 0; padding: 26px 24px calc(30px + env(safe-area-inset-bottom, 0px)); transform: translateY(100%); transition: transform 300ms var(--ease-out-quart); z-index: 41; }
.sheet.show { transform: translateY(0); }
.grab { width: 40px; height: 4px; border-radius: 2px; background: var(--line); margin: -12px auto 18px; }
.sheet-title { font-size: 17px; font-weight: 700; text-align: center; }
.sheet-desc { margin-top: 10px; text-align: center; font-size: 13px; color: var(--ink-500); line-height: 1.7; }
.actions { display: flex; gap: 12px; margin-top: 22px; }
.actions > view { flex: 1; height: 48px; border-radius: var(--radius-m); font-size: 15px; font-weight: 600; display: grid; place-items: center; }
.btn-cancel { border: 1px solid var(--line); background: var(--paper); color: var(--ink-700); }
.btn-confirm { border: none; background: linear-gradient(180deg, var(--brand-500), var(--brand-600)); color: #fff; box-shadow: 0 8px 18px -8px rgba(255, 80, 0, 0.55); }
</style>
