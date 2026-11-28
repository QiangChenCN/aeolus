<template>
  <div class="fm">
    <h2 class="v-title">AI 功能地图</h2>
    <p class="muted">
      DeepSeek Harness 全量能力盘点与当前集成状态。标记为「待扩展」的能力可后续按需启用；
      「不接入」是安全、资源或产品形态上的主动取舍，不是遗漏。
    </p>

    <div class="legend">
      <span v-for="(meta, key) in STATUS_META" :key="key" class="lg">
        <el-tag :type="meta.type" size="small" effect="light">{{ meta.label }}</el-tag>
        <span class="muted small">
          {{ key === 'ready' ? '已实现并可用' : key === 'planned' ? '可后续扩展' : '主动不接入' }}
        </span>
      </span>
    </div>

    <el-card v-for="cat in categories" :key="cat.key" shadow="never" class="cat">
      <template #header>
        <div class="cat-h">
          <span class="cat-t">{{ cat.name }}</span>
          <span class="muted small">{{ cat.items.length }} 项</span>
        </div>
      </template>
      <el-table :data="cat.items" size="small" border stripe>
        <el-table-column prop="name" label="能力" width="240" />
        <el-table-column prop="desc" label="说明" min-width="280" />
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="STATUS_META[row.status].type" size="small" effect="light">
              {{ STATUS_META[row.status].label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="note" label="备注 / 扩展方向" min-width="300" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { AI_FEATURE_CATEGORIES, STATUS_META } from './feature-catalog.js';

const categories = AI_FEATURE_CATEGORIES;
</script>

<style scoped>
.fm { padding: var(--sp-20); max-width: 1200px; }
.v-title { margin: 0 0 var(--sp-12); font-size: var(--el-font-size-extra-large); }
.muted { color: var(--el-text-color-secondary); }
.small { font-size: var(--el-font-size-extra-small); }
.legend { display: flex; gap: var(--sp-16); margin: 12px 0 16px; flex-wrap: wrap; }
.lg { display: inline-flex; align-items: center; gap: 6px; }
.cat { margin-bottom: 14px; }
.cat-h { display: flex; justify-content: space-between; align-items: center; }
.cat-t { font-weight: var(--fw-semibold); }
</style>
