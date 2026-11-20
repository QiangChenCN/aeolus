<template>
  <view class="m-screen">
    <scroll-view class="m-scroll" scroll-y>
      <view class="page-head"><h1>考勤</h1></view>
      <view class="filter">
        <view v-for="(f, i) in filters" :key="f" class="filter-btn" :class="{ active: i === active }" @click="active = i">{{ f }}</view>
      </view>
      <view class="list">
        <view class="row" @click="toast('排班详情（演示）')">
          <view class="r-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17" stroke-linecap="round"/></svg></view>
          <view class="r-main">
            <view class="r-title">黄江镇站 · 应到 24 实到 22</view>
            <view class="r-sub">2 人未上线</view>
          </view>
          <view class="r-tag tag-danger">缺勤 2</view>
        </view>
        <view class="row" @click="toast('排班详情（演示）')">
          <view class="r-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17" stroke-linecap="round"/></svg></view>
          <view class="r-main">
            <view class="r-title">长安万科站 · 应到 18 实到 18</view>
            <view class="r-sub">全部上线</view>
          </view>
          <view class="r-tag tag-ok">正常</view>
        </view>
        <view class="row" @click="toast('排班详情（演示）')">
          <view class="r-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17" stroke-linecap="round"/></svg></view>
          <view class="r-main">
            <view class="r-title">大岭山大学城站 · 应到 15 实到 15</view>
            <view class="r-sub">全部上线</view>
          </view>
          <view class="r-tag tag-ok">正常</view>
        </view>
      </view>
    </scroll-view>
    <AppTabBar current="att" />
    <wd-toast />
  </view>
</template>

<script setup>
import { ref } from 'vue';
import { useToast } from 'wot-design-uni';
import AppTabBar from '../../components/AppTabBar.vue';

const filters = ['午高峰', '晚高峰'];
const active = ref(0);
const toastApi = useToast();
function toast(msg) { toastApi.show(msg); }
</script>
