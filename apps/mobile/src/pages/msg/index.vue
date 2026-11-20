<template>
  <view class="m-screen">
    <AuthGate>
    <scroll-view class="m-scroll" scroll-y :scroll-top="scrollTop" @scroll="onScroll">
      <view class="page-head"><h1>消息</h1></view>
      <view v-if="items.length" class="list">
        <view v-for="item in items" :key="item.id" class="row" @click="toast(item.title + '（演示）')">
          <view class="r-ico"><ListIcon :name="item.icon" /></view>
          <view class="r-main">
            <view class="r-title">{{ item.title }}</view>
            <view class="r-sub">{{ item.sub }}</view>
          </view>
          <view v-if="item.unread" class="dot"></view>
        </view>
      </view>
      <view v-else class="empty">暂无消息</view>
    </scroll-view>
    </AuthGate>
    <AppTabBar current="msg" />
    <wd-toast />
  </view>
</template>

<script setup>
import { ref } from 'vue';
import { useToast } from 'wot-design-uni';
import { useTabStateStore } from '../../stores/tab-state.js';
import AppTabBar from '../../components/AppTabBar.vue';
import AuthGate from '../../components/AuthGate.vue';
import ListIcon from '../../components/ListIcon.vue';

const tabState = useTabStateStore();
const scrollTop = ref(tabState.getScroll('msg'));
function onScroll(e) { tabState.setScroll('msg', e.detail.scrollTop); }
const toastApi = useToast();
function toast(msg) { toastApi.show(msg); }

const items = [
  { id: 1, icon: 'notice', title: '站长通知 · 午高峰运力调整', sub: '10:02 · 点击查看详情', unread: true },
  { id: 2, icon: 'bell', title: '系统提醒 · 2 条申诉即将超时', sub: '09:30 · 请尽快处理', unread: true },
  { id: 3, icon: 'bell', title: '昨日考勤报表已生成', sub: '昨天 22:00 · 可在报表导出查看', unread: false },
];
</script>
