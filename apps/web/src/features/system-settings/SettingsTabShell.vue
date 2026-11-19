<template>
  <div class="tabshell">
    <div class="tabshell-bar">
      <el-menu :default-active="activePath" mode="horizontal" router class="tabshell-menu">
        <el-menu-item v-for="t in tabs" :key="t.to" :index="t.to">{{ t.label }}</el-menu-item>
      </el-menu>
    </div>
    <router-view v-slot="{ Component }">
      <component :is="Component" />
    </router-view>
  </div>
</template>

<script setup>
/* 设置类合并页通用壳：tab 项来自父路由 meta.tabs（label + to），无需为每个合并页单独写壳组件。 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const tabs = computed(() => {
  const parent = route.matched.find((r) => r.meta && Array.isArray(r.meta.tabs));
  return (parent && parent.meta.tabs) || [];
});
const activePath = computed(() => {
  const hit = tabs.value.find((t) => route.path.startsWith(t.to));
  return (hit && hit.to) || (tabs.value[0] && tabs.value[0].to) || '';
});
</script>

<style scoped>
.tabshell { display: flex; flex-direction: column; min-height: 100%; }
.tabshell-bar { padding: var(--sp-12) var(--sp-20) 0; background: var(--el-bg-color); }
.tabshell-menu { border-bottom: 1px solid var(--el-border-color); }
.tabshell-menu :deep(.el-menu-item) { height: 44px; line-height: 44px; }
</style>
