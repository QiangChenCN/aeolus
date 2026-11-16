<template>
  <div class="autorun">
    <div class="ar-bar">
      <h2 class="v-title">自动任务</h2>
      <span class="v-sub">调度器自动执行的运行记录（与「定时任务」的排期配置独立）</span>
      <span class="sp" />
      <el-select v-model="status" placeholder="全部状态" clearable style="width: 130px" @change="load">
        <el-option v-for="(txt, k) in STATUS_TXT" :key="k" :label="txt" :value="k" />
      </el-select>
      <el-button size="small" @click="showLog = true">
        <el-icon><Document /></el-icon> 调度日志
      </el-button>
      <el-button size="small" :loading="loading" @click="load">
        <el-icon><Refresh /></el-icon> 刷新
      </el-button>
    </div>

    <!-- 今日概览 -->
    <div class="ar-stats">
      <div class="stat">
        <span class="stat-num success">{{ stats.success || 0 }}</span>
        <span class="stat-lab">今日成功</span>
      </div>
      <div class="stat">
        <span class="stat-num danger">{{ stats.failed || 0 }}</span>
        <span class="stat-lab">今日失败</span>
      </div>
      <div class="stat">
        <span class="stat-num warn">{{ (stats.retrying || 0) + (stats.running || 0) }}</span>
        <span class="stat-lab">执行中/待重试</span>
      </div>
      <div class="stat">
        <span class="stat-num">{{ stats.skipped || 0 }}</span>
        <span class="stat-lab">今日跳过</span>
      </div>
      <div class="stat">
        <span class="stat-num">{{ stats.missed || 0 }}</span>
        <span class="stat-lab">今日错过</span>
      </div>
      <div class="stat">
        <span class="stat-num next">{{ next ? next.remind_at.replace('T', ' ') : '—' }}</span>
        <span class="stat-lab">下次执行{{ next ? '：' + next.title : '' }}</span>
      </div>
    </div>

    <el-table :data="rows" stripe class="ar-table" empty-text="暂无自动执行记录">
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="statusTag(row.status)">{{ STATUS_TXT[row.status] || row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="item_title" label="事项" min-width="180" show-overflow-tooltip />
      <el-table-column prop="task_name" label="关联任务" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">{{ row.task_name || row.item_task_id || '—' }}</template>
      </el-table-column>
      <el-table-column label="触发时间" width="170">
        <template #default="{ row }">{{ fmt(row.due_at) }}</template>
      </el-table-column>
      <el-table-column label="次数" width="70">
        <template #default="{ row }">{{ row.attempt || '—' }}</template>
      </el-table-column>
      <el-table-column prop="finished_at" label="完成时间" width="170" />
      <el-table-column prop="message" label="说明" min-width="200" show-overflow-tooltip />
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.run_id" link type="primary" size="small" @click="runs.openLog(row.run_id)">日志</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-drawer v-model="showLog" title="调度器日志（最近 50 条）" size="520px">
      <pre class="ar-log">{{ (scheduler.log || []).join('\n') || '暂无日志' }}</pre>
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh, Document } from '@element-plus/icons-vue';
import { fetchCronAutoRuns } from '../../api/dashboards.js';
import { useRunsStore } from '../../stores/runs.js';

// cron_run 状态文案（与 tokens.js 的通用任务状态集不同，独立维护）
const STATUS_TXT = {
  running: '执行中', retrying: '待重试', success: '成功', failed: '失败',
  skipped: '已跳过', missed: '已错过',
};

const runs = useRunsStore();

const rows = ref([]);
const stats = ref({});
const next = ref(null);
const scheduler = ref({});
const status = ref('');
const loading = ref(false);
const showLog = ref(false);

function statusTag(s) {
  return s === 'success' ? 'success' : s === 'failed' ? 'danger'
    : s === 'running' || s === 'retrying' ? 'warning' : 'info';
}
function fmt(s) { return s ? String(s).replace('T', ' ') : '—'; }

async function load() {
  loading.value = true;
  try {
    const res = await fetchCronAutoRuns(status.value, 200);
    if (res && res.ok) {
      rows.value = res.runs || [];
      stats.value = res.stats || {};
      next.value = res.next || null;
      scheduler.value = res.scheduler || {};
    }
  } catch (e) {
    ElMessage.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}
onMounted(load);
</script>

<style scoped>
.autorun { padding: var(--sp-20); }
.ar-bar { display: flex; align-items: baseline; gap: var(--sp-12); margin-bottom: var(--sp-16); flex-wrap: wrap; }
.v-title { margin: 0; font-size: var(--el-font-size-extra-large); }
.v-sub { color: var(--el-text-color-secondary); font-size: var(--el-font-size-base); }
.ar-bar .sp { flex: 1; }
.ar-stats { display: flex; gap: var(--sp-12); flex-wrap: wrap; margin-bottom: var(--sp-16); }
.stat { flex: 1; min-width: 120px; background: var(--el-fill-color-light); border-radius: var(--el-border-radius-base); padding: var(--sp-12); display: flex; flex-direction: column; gap: 4px; }
.stat-num { font-size: 22px; font-weight: 600; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stat-num.success { color: var(--el-color-success); }
.stat-num.danger { color: var(--el-color-danger); }
.stat-num.warn { color: var(--el-color-warning); }
.stat-num.next { font-size: 15px; color: var(--el-color-primary); }
.stat-lab { color: var(--el-text-color-secondary); font-size: var(--el-font-size-small); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ar-table { border-radius: var(--el-border-radius-base); overflow: hidden; }
.ar-log { font-family: monospace; font-size: 12px; line-height: 1.7; white-space: pre-wrap; word-break: break-all; margin: 0; color: var(--el-text-color-regular); }
</style>
