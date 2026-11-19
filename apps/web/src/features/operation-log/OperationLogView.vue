<template>
  <div class="op-log">
    <div class="op-head">
      <h2 class="op-title">操作日志</h2>
      <span class="op-sub">全项目级溯源：谁 · 时间 · 用什么代码 · 操作了什么</span>
    </div>

    <el-tabs v-model="tab" @tab-change="load">
      <el-tab-pane label="操作记录" name="operation">
        <el-form class="op-filter" :inline="true" @submit.prevent="load">
          <el-form-item label="操作者">
            <el-input v-model="f.actor" placeholder="system / 用户名 / machine" clearable style="width: 190px" />
          </el-form-item>
          <el-form-item label="动作">
            <el-input v-model="f.action" placeholder="rollup.history / GET /api/..." clearable style="width: 240px" />
          </el-form-item>
          <el-form-item label="起始">
            <el-date-picker v-model="f.from" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" :clearable="true" />
          </el-form-item>
          <el-form-item label="结束">
            <el-date-picker v-model="f.to" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" :clearable="true" />
          </el-form-item>
          <el-form-item label="条数">
            <el-input-number v-model="f.limit" :min="1" :max="500" :step="50" controls-position="right" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="load">查询</el-button>
            <el-button @click="reset">重置</el-button>
          </el-form-item>
        </el-form>

        <el-alert v-if="error" type="error" :title="error" show-icon class="op-err" />

        <el-table
          :data="rows"
          v-loading="loading"
          stripe
          border
          class="op-table"
          empty-text="暂无记录"
        >
          <el-table-column prop="ts" label="时间" width="180" />
          <el-table-column prop="actor" label="操作者" width="150" />
          <el-table-column prop="method" label="方法" width="80" />
          <el-table-column prop="action" label="动作" min-width="240" show-overflow-tooltip />
          <el-table-column prop="target" label="对象" width="170" show-overflow-tooltip />
          <el-table-column prop="code" label="代码" width="260" show-overflow-tooltip />
          <el-table-column prop="status" label="状态" width="80" />
          <el-table-column prop="duration_ms" label="耗时(ms)" width="100" />
          <el-table-column label="详情" min-width="220">
            <template #default="{ row }">
              <el-tooltip :content="row.detail || '-'" placement="top" :disabled="!row.detail">
                <span class="op-detail">{{ row.detail || '-' }}</span>
              </el-tooltip>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 权限决策日志：回答"为什么允许/拒绝"，与操作记录（谁做了什么）互补 -->
      <el-tab-pane label="权限决策" name="authz">
        <el-form class="op-filter" :inline="true" @submit.prevent="load">
          <el-form-item label="用户">
            <el-input v-model="a.username" placeholder="用户名 / machine" clearable style="width: 180px" />
          </el-form-item>
          <el-form-item label="路径">
            <el-input v-model="a.path" placeholder="/api/..." clearable style="width: 220px" />
          </el-form-item>
          <el-form-item label="结果">
            <el-select v-model="a.decision" clearable placeholder="全部" style="width: 120px">
              <el-option label="允许" value="allow" />
              <el-option label="拒绝" value="deny" />
            </el-select>
          </el-form-item>
          <el-form-item label="条数">
            <el-input-number v-model="a.limit" :min="1" :max="500" :step="50" controls-position="right" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="load">查询</el-button>
            <el-button @click="resetAuthz">重置</el-button>
          </el-form-item>
        </el-form>

        <el-alert v-if="authzError" type="error" :title="authzError" show-icon class="op-err" />

        <el-table
          :data="authzRows"
          v-loading="authzLoading"
          stripe
          border
          class="op-table"
          empty-text="暂无记录（仅记录拒绝与敏感权限放行）"
        >
          <el-table-column prop="ts" label="时间" width="180" />
          <el-table-column prop="username" label="用户" width="130" />
          <el-table-column prop="role" label="角色" width="110" />
          <el-table-column prop="method" label="方法" width="75" />
          <el-table-column prop="path" label="端点" min-width="220" show-overflow-tooltip />
          <el-table-column prop="perm" label="所需权限" width="140" />
          <el-table-column label="结果" width="85">
            <template #default="{ row }">
              <el-tag :type="row.decision === 'allow' ? 'success' : 'danger'" size="small">
                {{ row.decision === 'allow' ? '允许' : '拒绝' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="reason" label="命中规则" min-width="220" show-overflow-tooltip />
          <el-table-column prop="ip" label="IP" width="130" />
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { fetchOperationLog, fetchAuthzDecisions } from '@shared/api/operation-log.js';

const tab = ref('operation');

const rows = ref([]);
const loading = ref(false);
const error = ref('');
const f = reactive({ actor: '', action: '', from: '', to: '', limit: 100 });

const authzRows = ref([]);
const authzLoading = ref(false);
const authzError = ref('');
const a = reactive({ username: '', path: '', decision: '', limit: 100 });

async function load() {
  if (tab.value === 'authz') return loadAuthz();
  loading.value = true;
  error.value = '';
  try {
    const r = await fetchOperationLog({ ...f });
    rows.value = (r && r.logs) || [];
  } catch (e) {
    error.value = (e && e.message) || '查询失败';
  } finally {
    loading.value = false;
  }
}

async function loadAuthz() {
  authzLoading.value = true;
  authzError.value = '';
  try {
    const r = await fetchAuthzDecisions({ ...a });
    authzRows.value = (r && r.items) || [];
  } catch (e) {
    authzError.value = (e && e.message) || '查询失败';
  } finally {
    authzLoading.value = false;
  }
}

function reset() {
  f.actor = '';
  f.action = '';
  f.from = '';
  f.to = '';
  f.limit = 100;
  load();
}

function resetAuthz() {
  a.username = '';
  a.path = '';
  a.decision = '';
  a.limit = 100;
  loadAuthz();
}

onMounted(load);
</script>

<style scoped>
.op-log { padding: 16px; }
.op-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.op-title { margin: 0; font-size: 18px; }
.op-sub { color: var(--el-text-color-secondary); font-size: 13px; }
.op-filter { margin-bottom: 12px; flex-wrap: wrap; }
.op-err { margin-bottom: 12px; }
.op-table { width: 100%; }
.op-detail {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
