<template>
  <div class="srcpage" v-loading="loading">
    <el-card class="page-card" shadow="never">
    <h2 class="v-title">取数基座</h2>
    <p class="muted">
      当前全部取数服务的只读盘点（由后端目录下发）。状态取自页面顶部的登录态胶囊，不在此处发起额外探活。
    </p>

    <div v-if="items.length">
      <div class="bar">
        <el-button-group>
          <el-button size="small" :type="viewMode === 'card' ? 'primary' : ''" @click="viewMode = 'card'">卡片</el-button>
          <el-button size="small" :type="viewMode === 'list' ? 'primary' : ''" @click="viewMode = 'list'">列表</el-button>
        </el-button-group>
        <el-button size="small" :loading="loading" @click="load"><el-icon><Refresh /></el-icon> 刷新</el-button>
        <span class="muted">共 {{ items.length }} 项，点击查看详情</span>
      </div>

      <div v-if="viewMode === 'card'" class="grid">
        <div v-for="s in items" :key="s.id" class="src-card" @click="openDetail(s)">
          <div class="card-head">
            <div class="card-title">
              <span class="card-name">{{ s.name }}</span>
              <el-tag v-for="t in (s.tags || [])" :key="t" size="small" type="warning" effect="plain">{{ t }}</el-tag>
            </div>
            <el-tag size="small" :type="statusOf(s).tag">{{ statusOf(s).label }}</el-tag>
          </div>
          <div class="card-desc">{{ s.desc }}</div>
          <div class="card-meta">
            <span>{{ s.service }}</span>
            <span>触发：{{ s.trigger }}</span>
            <span>入口 {{ s.endpoints.length }} 个</span>
          </div>
          <div class="card-foot">
            <span class="muted">{{ (s.linked || []).slice(0, 2).join('、') || '—' }}</span>
            <span class="more">详情 →</span>
          </div>
        </div>
      </div>

      <el-table v-else :data="items" stripe border class="tbl" @row-click="openDetail">
        <el-table-column prop="name" label="基座" min-width="180" />
        <el-table-column label="标签" width="90">
          <template #default="{ row }">
            <el-tag v-for="t in (row.tags || [])" :key="t" size="small" type="warning" effect="plain">{{ t }}</el-tag>
            <span v-if="!(row.tags || []).length" class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="service" label="服务类" min-width="220" />
        <el-table-column prop="trigger" label="触发" width="110" />
        <el-table-column label="依赖" width="100">
          <template #default="{ row }">{{ authLabel(row.dependsOn) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="130">
          <template #default="{ row }">
            <el-tag size="small" :type="statusOf(row).tag">{{ statusOf(row).label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="关联" min-width="180">
          <template #default="{ row }">{{ (row.linked || []).join('、') || '—' }}</template>
        </el-table-column>
      </el-table>
    </div>

    <el-empty v-else-if="!loading" description="暂无取数基座数据" />
    </el-card>

    <el-drawer v-model="drawer" :title="current ? current.name + ' · 详情' : '取数基座详情'" size="min(560px, 92vw)">
      <template v-if="current">
        <el-alert
          v-if="!canDetail"
          type="info"
          :closable="false"
          show-icon
          title="内部信息（服务文件、落盘路径、任务 ID）仅对具备「风神账号配置」权限的用户开放。"
          class="tip"
        />
        <el-descriptions v-else-if="detail" :column="1" border size="small">
          <el-descriptions-item label="标签">
            <el-tag v-for="t in (detail.tags || [])" :key="t" size="small" type="warning" effect="plain" class="detail-tag">{{ t }}</el-tag>
            <span v-if="!(detail.tags || []).length" class="muted">—</span>
          </el-descriptions-item>
          <el-descriptions-item label="服务类">{{ detail.service }}</el-descriptions-item>
          <el-descriptions-item label="源文件">{{ detail.file }}</el-descriptions-item>
          <el-descriptions-item label="触发方式">{{ detail.trigger }}</el-descriptions-item>
          <el-descriptions-item label="登录态依赖">{{ authLabel(detail.dependsOn) }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag size="small" :type="statusOf(detail).tag">{{ statusOf(detail).label }}</el-tag>
            <span class="muted tip-inline">{{ statusOf(detail).tip }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="HTTP 入口">
            <div v-for="e in detail.endpoints" :key="e" class="mono">{{ e }}</div>
            <span v-if="!detail.endpoints.length" class="muted">无对外端点（仅内部调用）</span>
          </el-descriptions-item>
          <el-descriptions-item label="可用参数">
            <div v-for="p in (detail.params || [])" :key="p" class="param">{{ p }}</div>
            <span v-if="!(detail.params || []).length" class="muted">—</span>
          </el-descriptions-item>
          <el-descriptions-item label="落盘 / 数据表">
            <div v-for="x in detail.storage" :key="x" class="mono">{{ x }}</div>
            <span v-if="!detail.storage.length" class="muted">无自有落盘</span>
          </el-descriptions-item>
          <el-descriptions-item label="关联任务">
            {{ (detail.tasks || []).join('、') || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="原始层 kind">
            {{ (detail.rawKinds || []).join('、') || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="关联看板 / 消费者">
            {{ (detail.linked || []).join('、') || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="说明"><span class="notes">{{ detail.notes || '—' }}</span></el-descriptions-item>
        </el-descriptions>
        <div v-else class="muted">详情加载失败，请稍后重试。</div>

        <el-descriptions v-if="!canDetail" :column="1" border size="small" class="basic">
          <el-descriptions-item label="服务类">{{ current.service }}</el-descriptions-item>
          <el-descriptions-item label="触发方式">{{ current.trigger }}</el-descriptions-item>
          <el-descriptions-item label="说明">{{ current.desc }}</el-descriptions-item>
        </el-descriptions>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useAppStore } from '@shared/stores/app.js';
import { useAuthStore } from '@shared/stores/auth.js';
import { fetchSources, fetchSourceDetail } from '@shared/api/sources.js';

const app = useAppStore();
const auth = useAuthStore();

const loading = ref(false);
const items = ref([]);
const viewMode = ref('card');
const drawer = ref(false);
const current = ref(null);
const detail = ref(null);

const canDetail = computed(() => auth.hasPerm('admin:aeolus'));

function statusOf(s) {
  if (s.dependsOn === 'aeolus' || s.dependsOn === 'quark') {
    const state = s.dependsOn === 'quark' ? app.quark?.status : app.cookie?.status;
    if (!state) return { key: 'pending', label: '检测中', tag: 'info', tip: '登录态尚未探测' };
    if (state === 'invalid') return { key: 'bad', label: '登录态失效', tag: 'danger', tip: '请到「外部凭证」重新配置或登录' };
    if (state === 'valid') return { key: 'ok', label: '正常', tag: 'success', tip: '登录态有效' };
    return { key: 'pending', label: '待确认', tag: 'warning', tip: '登录态未知，可能网络抖动' };
  }
  return {
    key: 'ok',
    label: '已接入',
    tag: 'success',
    tip: s.dependsOn === 'dingtalk' ? '依赖钉钉应用凭证' : '无外部登录态依赖',
  };
}

function authLabel(dep) {
  return ({ aeolus: '风神 Cookie', quark: 'Quark DA', dingtalk: '钉钉应用', none: '无' })[dep] || '—';
}

async function load() {
  loading.value = true;
  try {
    const r = await fetchSources();
    items.value = (r && r.items) || [];
  } catch (e) {
    ElMessage.error(e.message || '加载取数基座失败');
  } finally {
    loading.value = false;
  }
}

async function openDetail(s) {
  current.value = s;
  detail.value = null;
  drawer.value = true;
  if (!canDetail.value) return;
  try {
    const r = await fetchSourceDetail(s.id);
    detail.value = (r && r.item) || null;
  } catch (e) {
    if (e.status !== 403) ElMessage.error(e.message || '加载详情失败');
  }
}

onMounted(load);
</script>

<style scoped>
.srcpage {
  display: flex; flex-direction: column;
  height: 100%; box-sizing: border-box; padding: var(--sp-20);
}
.page-card { display: flex; flex-direction: column; flex: 1; width: 100%; min-height: 0; }
.page-card :deep(.el-card__body) { flex: 1; min-height: 0; overflow: auto; padding: var(--sp-16); }
.v-title { margin: 0 0 var(--sp-8); font-size: var(--el-font-size-extra-large); }
.muted { color: var(--el-text-color-secondary); font-size: var(--el-font-size-extra-small); }
.bar { display: flex; align-items: center; gap: var(--sp-12); margin-bottom: var(--sp-12); flex-wrap: wrap; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--sp-12); }
.src-card {
  display: flex; flex-direction: column; gap: var(--sp-8);
  padding: var(--sp-16); border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base); background: var(--el-bg-color);
  cursor: pointer; transition: border-color .15s, box-shadow .15s;
}
.src-card:hover { border-color: var(--el-color-primary); box-shadow: 0 2px 12px rgba(0, 0, 0, .06); }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-8); }
.card-title { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
.card-name { font-weight: var(--fw-semibold); }
.detail-tag { margin-right: 4px; }
.card-desc { flex: 1; font-size: var(--el-font-size-extra-small); color: var(--el-text-color-regular); line-height: 1.6; }
.card-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11px; color: var(--el-text-color-secondary); }
.card-foot { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-8); }
.more { color: var(--el-color-primary); font-size: var(--el-font-size-extra-small); }
.tbl { cursor: pointer; }
.tip { margin-bottom: var(--sp-12); }
.tip-inline { margin-left: var(--sp-8); }
.basic { margin-top: var(--sp-12); }
.mono { font-family: var(--font-mono, monospace); font-size: 12px; }
.notes { white-space: pre-line; }
.param { font-size: 12px; line-height: 1.7; }
@media (max-width: 992px) {
  .srcpage { padding: var(--sp-12); }
}
</style>
