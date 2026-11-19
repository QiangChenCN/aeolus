<template>
  <div class="bi">
    <h2 class="v-title">实例管理</h2>
    <p class="muted bi-lead">实例运行参数与连接状态在此管理（连接状态仅在此页呈现）。总开关、重连与凭据绑定请到「全局配置」，应用凭据在「凭证管理」创建。</p>

    <section class="bi-card">
      <h3 class="bi-h">实例清单</h3>
      <div v-if="!status.bots.length" class="bi-empty muted">
        <span>加载中…</span>
      </div>
      <el-table v-else :data="status.bots" stripe border class="bi-table">
        <el-table-column label="名称" min-width="170">
          <template #default="{ row }">
            <el-input
              :model-value="row.displayName"
              size="small"
              :loading="!!row._saving"
              placeholder="实例展示名"
              @change="(v) => renameInstance(row, v)" />
          </template>
        </el-table-column>
        <el-table-column prop="botId" label="botId" min-width="150" />
        <el-table-column label="推送渠道" width="110">
          <template #default="{ row }">
            <el-tag
              v-if="row.credentialsRef && findCred(row.credentialsRef)"
              size="small"
              :type="findCred(row.credentialsRef).type === 'wecom' ? 'warning' : 'success'">
              {{ typeLabel(findCred(row.credentialsRef).type) }}
            </el-tag>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="凭据分组" min-width="210">
          <template #default="{ row }">
            <span v-if="row.credentialsRef && findCred(row.credentialsRef)" class="inst-cred">
              {{ findCred(row.credentialsRef).label }}（{{ row.credentialsRef }}）
            </span>
            <span v-else class="muted">{{ row.credentialsRef || '未绑定' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="查询超时(秒)" width="140">
          <template #default="{ row }">
            <el-input-number
              :model-value="row.queryTimeout"
              :min="5"
              :max="600"
              size="small"
              controls-position="right"
              :loading="!!row._saving"
              @change="(v) => setBotTimeout(row, v)" />
          </template>
        </el-table-column>
        <el-table-column label="打字效果" width="100">
          <template #default="{ row }">
            <el-switch
              :model-value="row.aiCardTyping !== false"
              :loading="!!row._saving"
              @change="(v) => setBotTyping(row, v)" />
          </template>
        </el-table-column>
        <el-table-column label="状态" min-width="140">
          <template #default="{ row }">
            <el-tag v-if="!row.enabled" size="small" type="info">已禁用</el-tag>
            <el-tag v-else-if="!row.credentialsRef" size="small" type="warning">未绑定凭据</el-tag>
            <el-tag v-else-if="!credExists(row.credentialsRef)" size="small" type="danger">绑定凭据不存在</el-tag>
            <el-tag v-else-if="channelMismatch(row)" size="small" type="danger">渠道不匹配</el-tag>
            <el-tag v-else-if="!credEnabled(row.credentialsRef)" size="small" type="warning">凭据已停用</el-tag>
            <el-tag v-else-if="!credHasSecret(row.credentialsRef)" size="small" type="danger">凭据缺少 Secret</el-tag>
            <el-tag v-else-if="refConnected(row.credentialsRef)" size="small" type="success">运行中</el-tag>
            <el-tag v-else size="small" type="warning">网关未连接</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="实例启用" width="100">
          <template #default="{ row }">
            <el-switch :model-value="row.enabled" :loading="!!row._saving" @change="(v) => toggleBot(row, v)" />
          </template>
        </el-table-column>
      </el-table>
      <p class="muted bi-tip">
        「状态」列为本模块唯一的连接状态视图，「打字效果」为实例级开关（钉钉 AI 卡片逐字动画）。凭据绑定请在「全局配置」完成——那里一屏看全所有实例的绑定关系；未绑定的实例不参与消息收发。
      </p>
    </section>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue';
import { useBotConfig } from '@shared/composables/useBotConfig.js';

const {
  status, loadAll, toggleBot, renameInstance, setBotTimeout, setBotTyping,
  refConnected, credExists, credEnabled, credHasSecret, channelMismatch, typeLabel, findCred, activate, deactivate,
} = useBotConfig();

onMounted(async () => { activate(); await loadAll(); });
onUnmounted(deactivate);
</script>

<style scoped>
.bi { padding: var(--sp-20); }
.v-title { margin: 0 0 var(--sp-8); font-size: var(--el-font-size-extra-large); }
.bi-lead { margin: 0 0 var(--sp-16); }
.bi-card { background: var(--surface); border: 1px solid var(--el-border-color); border-radius: var(--r-lg); padding: var(--sp-16) var(--sp-20); margin-bottom: var(--sp-16); }
.bi-h { margin: 0 0 var(--sp-12); font-size: var(--el-font-size-medium); }
.bi-table { margin-top: var(--sp-8); }
.bi-table :deep(.el-input-number) { width: 120px; }
.bi-tip { margin-top: var(--sp-8); }
.inst-cred { color: var(--el-text-color-primary); }
.bi-empty { padding: var(--sp-24); }
.muted { color: var(--el-text-color-secondary); }
</style>
