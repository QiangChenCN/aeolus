<template>
  <div class="ba">
    <h2 class="v-title">全局配置</h2>
    <p class="muted ba-lead">
      一屏看全整体运行状态与「凭据分组 ↔ 机器人实例」的绑定关系，并在此完成组装。
      单项参数请在「凭证管理」「实例管理」中维护。
    </p>

    <!-- 运行状态：总开关 / 网关状态 / 重连（从实例管理页移入，唯一入口） -->
    <section class="ba-card">
      <h3 class="ba-h">运行状态</h3>
      <div class="ba-swrow">
        <span class="stat-k">机器人总开关</span>
        <el-switch :model-value="bot.botEnabled" :loading="savingBot" @change="saveBot" />
        <el-tag size="small" :type="switchState.type">{{ switchState.text }}</el-tag>
        <span class="muted">关闭则停止所有 Stream 连接（切换即时保存）</span>
        <el-button size="small" :loading="reloadingBot" @click="doReload">立即重连</el-button>
        <span v-if="lastUpdated" class="ba-poll">自动刷新 · {{ lastUpdated }}</span>
      </div>
      <div class="ba-stats">
        <div class="stat">
          <span class="stat-k">实例数</span>
          <span class="stat-v">{{ status.bots.length }}</span>
        </div>
        <div class="stat">
          <span class="stat-k">凭据分组</span>
          <span class="stat-v">{{ creds.length }}</span>
        </div>
        <div class="stat">
          <span class="stat-k">已连接分组</span>
          <span class="stat-v">{{ connectedCount }}</span>
        </div>
      </div>
    </section>

    <!-- 绑定关系总览：一屏看全并在此组装 -->
    <section class="ba-card">
      <h3 class="ba-h">绑定关系总览</h3>
      <div v-if="!status.bots.length" class="ba-empty muted"><span>加载中…</span></div>
      <el-table v-else :data="status.bots" stripe border class="ba-table">
        <el-table-column label="机器人实例" min-width="180">
          <template #default="{ row }">
            <span class="ba-name">{{ row.displayName }}</span>
            <span class="ba-botid">{{ row.botId }}</span>
          </template>
        </el-table-column>
        <el-table-column label="实例渠道" width="110">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ typeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="绑定凭据分组" min-width="260">
          <template #default="{ row }">
            <el-select
              :model-value="row.credentialsRef || ''"
              size="small"
              :loading="!!row._binding"
              placeholder="未绑定"
              @change="(v) => bindBot(row, v)">
              <el-option label="未绑定" value="" />
              <el-option v-for="c in credsFor(row)" :key="c.id" :label="c.label + '（' + c.id + '）'" :value="c.id" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="渠道" min-width="100">
          <template #default="{ row }">
            <el-tag v-if="row.credentialsRef && findCred(row.credentialsRef)" size="small">{{ typeLabel(findCred(row.credentialsRef).type) }}</el-tag>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="绑定状态" min-width="160">
          <template #default="{ row }">
            <el-tag v-if="!row.credentialsRef" size="small" type="warning">未绑定</el-tag>
            <el-tag v-else-if="!credExists(row.credentialsRef)" size="small" type="danger">凭据不存在</el-tag>
            <el-tag v-else-if="channelMismatch(row)" size="small" type="danger">渠道不匹配</el-tag>
            <el-tag v-else-if="!credEnabled(row.credentialsRef)" size="small" type="warning">凭据已停用</el-tag>
            <el-tag v-else-if="!credHasSecret(row.credentialsRef)" size="small" type="danger">凭据缺 Secret</el-tag>
            <el-tag v-else size="small" type="success">已组装</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="实例启用" width="100">
          <template #default="{ row }">
            <el-switch :model-value="row.enabled" :loading="!!row._saving" @change="(v) => toggleBot(row, v)" />
          </template>
        </el-table-column>
      </el-table>
      <p class="muted ba-tip">
        「绑定状态」描述凭据组装是否完备；连接状态（是否真正连上）只在「实例管理」页呈现。绑定下拉只列同渠道凭据。
      </p>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import { useBotConfig } from '../../composables/useBotConfig.js';

const {
  bot, savingBot, reloadingBot, status, lastUpdated, creds,
  loadAll, saveBot, doReload, toggleBot, bindBot,
  findCred, credExists, credEnabled, credHasSecret, channelMismatch, typeLabel, activate, deactivate,
} = useBotConfig();

const switchState = computed(() => {
  if (!bot.botEnabled) return { text: '已禁用', type: 'info' };
  if (status.gatewayConnected) return { text: '运行中', type: 'success' };
  return { text: '已停止', type: 'warning' };
});

const connectedCount = computed(() =>
  (status.connections || []).filter((c) => c.connected).length,
);

/** 绑定下拉只列同渠道凭据；历史异渠道绑定保留该项以便发现。 */
function credsFor(row) {
  const same = creds.value.filter((c) => (c.type || 'dingtalk') === (row.type || 'dingtalk'));
  const current = creds.value.find((c) => c.id === row.credentialsRef);
  return current && !same.includes(current) ? [current, ...same] : same;
}

onMounted(async () => { activate(); await loadAll(); });
onUnmounted(deactivate);
</script>

<style scoped>
.ba { padding: var(--sp-20); }
.v-title { margin: 0 0 var(--sp-8); font-size: var(--el-font-size-extra-large); }
.ba-lead { margin: 0 0 var(--sp-16); }
.ba-card { background: var(--surface); border: 1px solid var(--el-border-color); border-radius: var(--r-lg); padding: var(--sp-16) var(--sp-20); margin-bottom: var(--sp-16); }
.ba-h { margin: 0 0 var(--sp-12); font-size: var(--el-font-size-medium); }
.ba-swrow { display: flex; align-items: center; gap: var(--sp-10); flex-wrap: wrap; margin-bottom: var(--sp-14); }
.ba-stats { display: flex; align-items: center; gap: var(--sp-20); flex-wrap: wrap; }
.stat { display: flex; align-items: center; gap: var(--sp-8); }
.stat-k { color: var(--el-text-color-secondary); font-size: 12px; }
.stat-v { font-weight: var(--fw-semibold); color: var(--el-text-color-primary); }
.ba-poll { font-size: 12px; color: var(--el-text-color-secondary); }
.ba-table { margin-top: var(--sp-8); }
.ba-name { font-weight: var(--fw-semibold); color: var(--el-text-color-primary); display: block; }
.ba-botid { font-size: 12px; color: var(--el-text-color-secondary); }
.ba-tip { margin-top: var(--sp-8); }
.ba-empty { padding: var(--sp-24); }
.muted { color: var(--el-text-color-secondary); }
</style>
