import { defineStore } from 'pinia';

/**
 * tab 页 UI 状态保持。
 * AppTabBar 用 redirectTo 切页会销毁重建页面实例，导致筛选位与滚动位置丢失。
 * store 生命周期跟随应用而非页面，故可跨 redirectTo 保持；不持久化，重启应用后回到默认。
 */
export const useTabStateStore = defineStore('tabState', {
  state: () => ({
    filters: {}, // key: 页面标识 -> 筛选索引
    scroll: {},  // key: 页面标识 -> scrollTop
  }),
  actions: {
    getFilter(key, fallback = 0) { return this.filters[key] ?? fallback; },
    setFilter(key, value) { this.filters[key] = value; },
    getScroll(key) { return this.scroll[key] ?? 0; },
    setScroll(key, value) { this.scroll[key] = value; },
  },
});
