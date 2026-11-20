<template>
  <view class="m-screen">
    <scroll-view class="m-scroll" scroll-y>
      <view class="page-head"><h1>任务</h1></view>
      <view class="filter">
        <view v-for="(f, i) in filters" :key="f" class="filter-btn" :class="{ active: i === active }" @click="active = i">{{ f }}</view>
      </view>
      <view class="list">
        <view class="row" @click="toast('任务详情（演示）')">
          <view class="r-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="m8.5 12 2.3 2.3 4.7-4.8" stroke-linecap="round" stroke-linejoin="round"/></svg></view>
          <view class="r-main">
            <view class="r-title">商站任务 · 黄江镇站素材补交</view>
            <view class="r-sub">今天 18:00 截止</view>
          </view>
          <view class="r-tag tag-danger">紧急</view>
        </view>
        <view class="row" @click="toast('任务详情（演示）')">
          <view class="r-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 11.5a8.5 8.5 0 1 1-4.6-7.6" stroke-linecap="round"/><path d="M9 12.5 12 15.5 20 7" stroke-linecap="round" stroke-linejoin="round"/></svg></view>
          <view class="r-main">
            <view class="r-title">违规申诉 · 大岭山站 2 条</view>
            <view class="r-sub">今天 18:00 截止</view>
          </view>
          <view class="r-tag tag-danger">紧急</view>
        </view>
        <view class="row" @click="toast('任务详情（演示）')">
          <view class="r-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="6" width="17" height="13" rx="2.5"/><path d="M9 3.5h6v4H9z"/><path d="M10.5 12.5h3" stroke-linecap="round"/></svg></view>
          <view class="r-main">
            <view class="r-title">健康证复审通知 · 3 人</view>
            <view class="r-sub">本周五前</view>
          </view>
          <view class="r-tag tag-warn">提醒</view>
        </view>
      </view>
    </scroll-view>
    <AppTabBar current="task" />
    <wd-toast />
  </view>
</template>

<script setup>
import { ref } from 'vue';
import { useToast } from 'wot-design-uni';
import AppTabBar from '../../components/AppTabBar.vue';

const filters = ['待处理', '进行中', '已完成'];
const active = ref(0);
const toastApi = useToast();
function toast(msg) { toastApi.show(msg); }
</script>
