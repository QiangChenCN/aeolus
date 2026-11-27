<template>
  <view class="m-screen">
    <AuthGate>
    <scroll-view class="m-scroll" scroll-y :scroll-top="scrollTop" @scroll="onScroll">
      <view class="page-head"><h1>考勤</h1></view>
      <view class="seg-tabs">
        <view v-for="(f, i) in filters" :key="f" class="seg-tab" :class="{ active: i === active }" @click="setFilter(i)">{{ f }}</view>
      </view>
      <view v-if="visibleItems.length" class="list">
        <view v-for="item in visibleItems" :key="item.id" class="row" @click="toast(item.title + '（演示）')">
          <view class="r-ico"><ListIcon name="calendar" /></view>
          <view class="r-main">
            <view class="r-title">{{ item.title }}</view>
            <view class="r-sub">{{ item.sub }}</view>
          </view>
          <view class="r-tag" :class="item.tagClass">{{ item.tag }}</view>
        </view>
      </view>
      <view v-else class="empty">该时段暂无考勤记录</view>
    </scroll-view>
    </AuthGate>
    <AppTabBar current="att" />
    <wd-toast />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useToast } from 'wot-design-uni';
import { useTabStateStore } from '../../stores/tab-state.js';
import AppTabBar from '../../components/AppTabBar.vue';
import AuthGate from '../../components/AuthGate.vue';
import ListIcon from '../../components/ListIcon.vue';

const tabState = useTabStateStore();
const filters = ['午高峰', '晚高峰'];
const active = ref(tabState.getFilter('att'));
const scrollTop = ref(tabState.getScroll('att'));
function setFilter(i) { active.value = i; tabState.setFilter('att', i); }
function onScroll(e) { tabState.setScroll('att', e.detail.scrollTop); }
const toastApi = useToast();
function toast(msg) { toastApi.show(msg); }

// 演示数据：两个时段各一组；午高峰有缺勤，晚高峰全部正常。
const items = [
  { id: 1, period: 0, title: '黄江镇站 · 应到 24 实到 22', sub: '2 人未上线', tag: '缺勤 2', tagClass: 'tag-danger' },
  { id: 2, period: 0, title: '长安万科站 · 应到 18 实到 18', sub: '全部上线', tag: '正常', tagClass: 'tag-ok' },
  { id: 3, period: 1, title: '大岭山大学城站 · 应到 15 实到 15', sub: '全部上线', tag: '正常', tagClass: 'tag-ok' },
];
const visibleItems = computed(() => items.filter((i) => i.period === active.value));
</script>
