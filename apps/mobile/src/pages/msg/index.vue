<template>
  <view class="m-screen">
    <scroll-view class="m-scroll" scroll-y>
      <view class="page-head"><h1>消息</h1></view>
      <view class="list">
        <view class="row" @click="toast('消息详情（演示）')">
          <view class="r-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5.5h16A1.5 1.5 0 0 1 21.5 7v9a1.5 1.5 0 0 1-1.5 1.5h-9L6.5 21v-3.5H4A1.5 1.5 0 0 1 2.5 16V7A1.5 1.5 0 0 1 4 5.5z" stroke-linejoin="round"/></svg></view>
          <view class="r-main">
            <view class="r-title">站长通知 · 午高峰运力调整</view>
            <view class="r-sub">10:02 · 点击查看详情</view>
          </view>
          <view class="dot"></view>
        </view>
        <view class="row" @click="toast('消息详情（演示）')">
          <view class="r-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10.3 21a2 2 0 0 0 3.4 0" stroke-linecap="round"/></svg></view>
          <view class="r-main">
            <view class="r-title">系统提醒 · 2 条申诉即将超时</view>
            <view class="r-sub">09:30 · 请尽快处理</view>
          </view>
          <view class="dot"></view>
        </view>
        <view class="row" @click="toast('消息详情（演示）')">
          <view class="r-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10.3 21a2 2 0 0 0 3.4 0" stroke-linecap="round"/></svg></view>
          <view class="r-main">
            <view class="r-title">昨日考勤报表已生成</view>
            <view class="r-sub">昨天 22:00 · 可在报表导出查看</view>
          </view>
        </view>
      </view>
    </scroll-view>
    <AppTabBar current="msg" />
    <wd-toast />
  </view>
</template>

<script setup>
import { useToast } from 'wot-design-uni';
import AppTabBar from '../../components/AppTabBar.vue';

const toastApi = useToast();
function toast(msg) { toastApi.show(msg); }
</script>
