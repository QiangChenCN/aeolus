<template>
  <view class="m-screen">
    <AuthGate>
    <scroll-view class="m-scroll" scroll-y :scroll-top="scrollTop" @scroll="onScroll">
      <view class="page-head"><h1>任务</h1></view>
      <view class="filter">
        <view v-for="(f, i) in filters" :key="f" class="filter-btn" :class="{ active: i === active }" @click="setFilter(i)">{{ f }}</view>
      </view>
      <view v-if="visibleItems.length" class="list">
        <view v-for="item in visibleItems" :key="item.id" class="row" @click="toast(item.title + '（演示）')">
          <view class="r-ico"><ListIcon :name="item.icon" /></view>
          <view class="r-main">
            <view class="r-title">{{ item.title }}</view>
            <view class="r-sub">{{ item.sub }}</view>
          </view>
          <view class="r-tag" :class="item.tagClass">{{ item.tag }}</view>
        </view>
      </view>
      <view v-else class="empty">该分类下暂无任务</view>
    </scroll-view>
    </AuthGate>
    <AppTabBar current="task" />
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
const filters = ['待处理', '进行中', '已完成'];
const active = ref(tabState.getFilter('task'));
const scrollTop = ref(tabState.getScroll('task'));
function setFilter(i) { active.value = i; tabState.setFilter('task', i); }
function onScroll(e) { tabState.setScroll('task', e.detail.scrollTop); }
const toastApi = useToast();
function toast(msg) { toastApi.show(msg); }

// 演示数据：筛选按 status 分组；接真实 API 时只需替换 items 来源，模板与图标组件不用改。
const items = [
  { id: 1, status: 0, icon: 'task', title: '商站任务 · 黄江镇站素材补交', sub: '今天 18:00 截止', tag: '紧急', tagClass: 'tag-danger' },
  { id: 2, status: 0, icon: 'appeal', title: '违规申诉 · 大岭山站 2 条', sub: '今天 18:00 截止', tag: '紧急', tagClass: 'tag-danger' },
  { id: 3, status: 0, icon: 'health', title: '健康证复审通知 · 3 人', sub: '本周五前', tag: '提醒', tagClass: 'tag-warn' },
];
const visibleItems = computed(() => items.filter((i) => i.status === active.value));
</script>
