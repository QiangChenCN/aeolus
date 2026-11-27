<template>
  <div class="tabshell">
    <div class="tabshell-bar">
      <el-tabs v-model="activePath" class="tabshell-tabs" @tab-change="(p) => $router.push(String(p))">
        <el-tab-pane v-for="t in tabs" :key="t.to" :label="t.label" :name="t.to" />
      </el-tabs>
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
const activePath = computed({
  get() {
    const hit = tabs.value.find((t) => route.path.startsWith(t.to));
    return (hit && hit.to) || (tabs.value[0] && tabs.value[0].to) || '';
  },
  set() { /* 选中由 @tab-change 路由跳转驱动，v-model 仅承接回显 */ },
});
</script>

<style scoped>
.tabshell { display: flex; flex-direction: column; min-height: 100%; }
.tabshell-bar { padding: var(--sp-12) var(--sp-20) 0; background: var(--el-bg-color); }
.tabshell-tabs :deep(.el-tabs__content) { display: none; }
</style>
