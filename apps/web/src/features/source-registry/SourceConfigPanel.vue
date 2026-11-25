<template>
  <div class="cfgpanel" v-loading="loading">
    <el-alert
      type="warning"
      :closable="false"
      show-icon
      class="tip"
    >
      <template #title>
        <span>启用开关后，<b>生产取数也会改用已发布配置</b>（URL / 请求模板 / 轮询参数）；关闭则立即回退内建默认。</span>
        <span v-if="cfg && cfg.type === 'async-export'">三段式试运行会真实触发一次上游导出任务。</span>
      </template>
    </el-alert>

    <template v-if="cfg">
      <div class="bar">
        <el-switch v-model="enabled" @change="toggleEnabled" />
        <span :class="enabled ? 'on-text' : 'muted'">
          {{ enabled ? '已启用：生产取数使用配置' : '未启用：生产取数走内建' }}
        </span>
        <el-tag v-if="detail.publishedVersion" type="success">v{{ detail.publishedVersion }}</el-tag>
        <el-tag v-else type="info">未发布</el-tag>
        <div class="spacer" />
        <el-button :loading="saving" @click="saveDraft">保存草稿</el-button>
        <el-button type="primary" :loading="publishing" :disabled="!detail.hasDraft" @click="publish">
          发布
        </el-button>
      </div>

      <el-form label-position="top">
        <!-- 通用：认证引用 + 上限 -->
        <el-row :gutter="12">
          <el-col :span="8">
            <el-form-item label="认证引用（不可编辑）">
              <el-input :model-value="cfg.authRef" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="超时 ms">
              <el-input-number v-model="cfg.limits.timeoutMs" :min="1" :max="120000" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="最大行数">
              <el-input-number v-model="cfg.limits.maxRows" :min="1" :max="200" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <!-- http-query：单次请求 -->
        <template v-if="cfg.type === 'http-query'">
          <el-row :gutter="12">
            <el-col :span="16">
              <el-form-item label="上游 URL">
                <el-input v-model="cfg.http.url" placeholder="https://..." />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="请求方法">
                <el-select v-model="cfg.http.method" style="width: 100%">
                  <el-option label="POST" value="POST" />
                  <el-option label="GET" value="GET" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row v-if="cfg.http.page" :gutter="12">
            <el-col :span="8">
              <el-form-item label="最大页数">
                <el-input-number v-model="cfg.http.page.maxPages" :min="1" :max="200" style="width: 100%" />
              </el-form-item>
            </el-col>
          </el-row>
        </template>

        <!-- signed-download：两段式签名下载 -->
        <template v-else-if="cfg.type === 'signed-download'">
          <el-row :gutter="12">
            <el-col :span="16">
              <el-form-item label="触发下载 URL">
                <el-input v-model="cfg.download.triggerUrl" class="mono" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="解析器">
                <el-select v-model="cfg.download.parser" style="width: 100%">
                  <el-option label="violation-csv（违规 GBK）" value="violation-csv" />
                  <el-option label="schedule-xlsx（排班）" value="schedule-xlsx" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="12">
            <el-col :span="8">
              <el-form-item label="签名 URL 字段路径">
                <el-input v-model="cfg.download.urlPath" class="mono" placeholder="data" />
              </el-form-item>
            </el-col>
          </el-row>
        </template>

        <!-- quark-widget：只暴露端点 -->
        <template v-else-if="cfg.type === 'quark-widget'">
          <el-alert type="info" :closable="false" show-icon
            title="Quark Widget 的 payload 与运行时凭证强耦合，仅端点可改，且暂不支持试运行。" class="tip" />
          <el-form-item label="WidgetAction URL">
            <el-input v-model="cfg.quark.url" class="mono" />
          </el-form-item>
          <el-row :gutter="12">
            <el-col :span="8"><el-form-item label="reportId"><el-input v-model="cfg.quark.reportId" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item label="datasetGuid"><el-input-number v-model="cfg.quark.datasetGuid" style="width: 100%" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item label="widgetId"><el-input v-model="cfg.quark.widgetId" /></el-form-item></el-col>
          </el-row>
        </template>

        <!-- passthrough：薄封装 -->
        <template v-else-if="cfg.type === 'passthrough'">
          <el-alert type="warning" :closable="false" show-icon
            :title="'该基座无独立取数点，配置继承上游：' + cfg.passthrough.inherits + '。请到上游基座编辑配置。'" class="tip" />
          <el-form-item label="说明"><el-input :model-value="cfg.passthrough.note || ''" disabled /></el-form-item>
        </template>

        <!-- async-export：三段式异步导出 -->
        <template v-else-if="cfg.type === 'async-export'">
          <el-row :gutter="12">
            <el-col :span="8">
              <el-form-item label="① 触发导出 URL">
                <el-input v-model="cfg.export.triggerUrl" class="mono" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="② 查询任务 URL">
                <el-input v-model="cfg.export.taskListUrl" class="mono" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="③ 取签名 URL">
                <el-input v-model="cfg.export.taskUrlUrl" class="mono" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="12">
            <el-col :span="6">
              <el-form-item label="轮询间隔 ms">
                <el-input-number v-model="cfg.export.pollIntervalMs" :min="100" :max="60000" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="轮询超时 ms">
                <el-input-number v-model="cfg.export.pollTimeoutMs" :min="1" :max="600000" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="下载超时 ms">
                <el-input-number v-model="cfg.export.downloadTimeoutMs" :min="1" :max="600000" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="解析器">
                <el-select v-model="cfg.export.parser" style="width: 100%">
                  <el-option label="delivery-xlsx（运单）" value="delivery-xlsx" />
                  <el-option label="violation-csv（违规）" value="violation-csv" />
                  <el-option label="schedule-xlsx（排班）" value="schedule-xlsx" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="12">
            <el-col :span="6">
              <el-form-item label="任务 ID 字段">
                <el-input v-model="cfg.export.claim.idPath" class="mono" />
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="任务状态字段">
                <el-input v-model="cfg.export.claim.statusPath" class="mono" />
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="完成状态值">
                <el-input-number v-model="cfg.export.claim.readyStatus" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="触发前记录最大 ID">
                <el-switch v-model="cfg.export.claim.maxIdSnapshot" />
              </el-form-item>
            </el-col>
          </el-row>
        </template>

        <el-form-item
          v-if="cfg.type === 'http-query' || cfg.type === 'async-export' || cfg.type === 'signed-download'"
          :label="'请求体模板（任意 JSON：对象/数组/字符串，' + VAR_HINT + ' 占位符可出现在 key、value 或字符串片段）'"
        >
          <el-input v-model="bodyText" type="textarea" :rows="12" class="mono" spellcheck="false" />
        </el-form-item>
      </el-form>

      <el-divider content-position="left">试运行参数（自动取自模板中的 {{ VAR_HINT }}）</el-divider>
      <el-alert
        v-if="!templateVars.length"
        type="info"
        :closable="false"
        show-icon
        title="当前请求模板中没有占位符，无需填写参数。"
        class="tip"
      />
      <el-row :gutter="12">
        <el-col v-for="name in templateVars" :key="name" :span="8" class="var-col">
          <el-form-item :label="name">
            <el-input v-model="values[name]" :placeholder="defaultFor(name) || '填写 ' + name" />
          </el-form-item>
        </el-col>
        <el-col :span="8" class="var-col">
          <el-button type="primary" style="width: 100%; margin-top: 22px" :loading="running" @click="runDry">
            试运行（不改草稿）
          </el-button>
        </el-col>
      </el-row>
      <p class="muted">
        变量来自请求体（含嵌套 key、数组元素、字符串片段）与 URL 中的占位符；内置变量已预填默认值，均可改写。
      </p>

      <template v-if="result">
        <el-divider content-position="left">试运行结果</el-divider>
        <div class="steps">
          <el-tag v-for="(s, i) in result.steps" :key="i" :type="s.ok ? 'success' : 'danger'" class="step-tag">
            {{ s.name }} · {{ s.elapsedMs }}ms
          </el-tag>
        </div>
        <p class="muted">
          上游总数 {{ result.total }}，预览 {{ result.returned }} 行，总耗时 {{ result.elapsedMs }}ms。未落盘、未写库。
        </p>
        <el-table :data="result.rows" stripe border max-height="320">
          <el-table-column
            v-for="col in previewColumns"
            :key="col"
            :prop="col"
            :label="col"
            min-width="140"
            show-overflow-tooltip
          />
        </el-table>
      </template>

      <el-divider content-position="left">版本历史</el-divider>
      <el-table :data="detail.history || []" stripe border>
        <el-table-column prop="version" label="版本" width="76" />
        <el-table-column prop="actor" label="操作者" width="110" />
        <el-table-column prop="reason" label="说明" />
        <el-table-column prop="created_at" label="时间" width="165" />
        <el-table-column label="操作" width="80">
          <template #default="{ row }">
            <el-button link type="primary" @click="rollback(row.version)">回滚</el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  fetchSourceConfig,
  saveSourceConfig,
  publishSourceConfig,
  rollbackSourceConfig,
  setSourceConfigEnabled,
  dryRunSourceConfig,
} from '@shared/api/sources.js';

const props = defineProps({
  sourceId: { type: String, required: true },
});

const loading = ref(false);
const saving = ref(false);
const publishing = ref(false);
const running = ref(false);
const detail = ref(null);
const cfg = ref(null);
const bodyText = ref('{}');
const enabled = ref(false);
const values = ref({});
const result = ref(null);
const VAR_HINT = '{{var}}';

const previewColumns = computed(() => {
  const rows = result.value?.rows || [];
  if (!rows.length) return [];
  return Object.keys(rows[0])
    .filter((k) => !/[\u4e00-\u9fa5]/.test(k))
    .slice(0, 12);
});

/** 递归收集任意 JSON 结构里的 {{var}}：对象 key、value、数组元素、字符串片段。 */
function collectVars(node, out) {
  if (typeof node === 'string') {
    for (const m of node.matchAll(/\{\{(\w+)\}\}/g)) out.add(m[1]);
  } else if (Array.isArray(node)) {
    for (const item of node) collectVars(item, out);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      collectVars(k, out);
      collectVars(v, out);
    }
  }
  return out;
}

const templateVars = computed(() => {
  const out = new Set();
  const type = cfg.value?.type;
  if (type === 'http-query') {
    collectVars(cfg.value?.http?.body, out);
    collectVars(cfg.value?.http?.url || '', out);
  } else if (type === 'async-export') {
    collectVars(cfg.value?.export?.triggerBody, out);
    for (const k of ['triggerUrl', 'taskListUrl', 'taskUrlUrl']) {
      collectVars(cfg.value?.export?.[k] || '', out);
    }
  } else if (type === 'signed-download') {
    collectVars(cfg.value?.download?.triggerBody, out);
    collectVars(cfg.value?.download?.triggerUrl || '', out);
  }
  return [...out].sort();
});

const BUILTIN_VAR_DEFAULTS = {
  date: () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10),
  timeField: () => 'trackingFinish',
  teamIds: () => '',
  rider: () => '',
  current: () => '1',
  pageSize: () => '50',
  period: () => '0-86400',
};
function defaultFor(name) {
  const d = BUILTIN_VAR_DEFAULTS[name];
  return d ? d() : '';
}

watch(
  templateVars,
  (names) => {
    const next = { ...values.value };
    for (const n of names) if (!(n in next)) next[n] = defaultFor(n);
    for (const k of Object.keys(next)) if (!names.includes(k)) delete next[k];
    values.value = next;
  },
  { immediate: true },
);

async function load() {
  loading.value = true;
  try {
    const r = await fetchSourceConfig(props.sourceId);
    detail.value = r.item;
    const base = r.item.draft || r.item.published || r.item.builtin;
    cfg.value = JSON.parse(JSON.stringify(base));
    cfg.value.limits = cfg.value.limits || {};
    let body;
    if (cfg.value.type === 'async-export') body = (cfg.value.export || {}).triggerBody;
    else if (cfg.value.type === 'signed-download') body = (cfg.value.download || {}).triggerBody;
    else body = (cfg.value.http || {}).body;
    bodyText.value = JSON.stringify(body || {}, null, 2);
    enabled.value = !!r.item.enabled;
  } catch (e) {
    ElMessage.error(e.message || '加载配置失败');
  } finally {
    loading.value = false;
  }
}

function syncBody() {
  try {
    // 不规则请求体允许任意 JSON：对象、数组、字符串、标量都可作为模板载体。
    const parsed = JSON.parse(bodyText.value);
    if (cfg.value.type === 'async-export') {
      cfg.value.export = cfg.value.export || {};
      cfg.value.export.triggerBody = parsed;
    } else if (cfg.value.type === 'signed-download') {
      cfg.value.download = cfg.value.download || {};
      cfg.value.download.triggerBody = parsed;
    } else {
      cfg.value.http = cfg.value.http || {};
      cfg.value.http.body = parsed;
    }
    return true;
  } catch (e) {
    ElMessage.error('请求体模板不是合法 JSON：' + e.message);
    return false;
  }
}

async function saveDraft() {
  if (!syncBody()) return;
  saving.value = true;
  try {
    await saveSourceConfig(props.sourceId, cfg.value);
    ElMessage.success('草稿已保存');
    await load();
  } catch (e) {
    ElMessage.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function publish() {
  publishing.value = true;
  try {
    const r = await publishSourceConfig(props.sourceId);
    ElMessage.success(`已发布 v${r.version}`);
    await load();
  } catch (e) {
    ElMessage.error(e.message || '发布失败');
  } finally {
    publishing.value = false;
  }
}

async function rollback(version) {
  try {
    await ElMessageBox.confirm(`回滚到 v${version}？当前配置将被覆盖并以新版本号发布。`, '确认回滚', { type: 'warning' });
  } catch {
    return;
  }
  try {
    const r = await rollbackSourceConfig(props.sourceId, version);
    ElMessage.success(`已回滚，当前版本 v${r.version}`);
    await load();
  } catch (e) {
    ElMessage.error(e.message || '回滚失败');
  }
}

async function toggleEnabled(val) {
  try {
    await setSourceConfigEnabled(props.sourceId, val);
    ElMessage.success(val ? '配置覆盖已启用' : '已关闭，回退内建默认');
    await load();
  } catch (e) {
    ElMessage.error(e.message || '切换失败');
    enabled.value = !val;
  }
}

async function runDry() {
  if (!syncBody()) return;
  running.value = true;
  result.value = null;
  try {
    result.value = await dryRunSourceConfig(props.sourceId, {
      values: values.value,
      configOverride: cfg.value,
    });
  } catch (e) {
    ElMessage.error(e.message || '试运行失败');
  } finally {
    running.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.cfgpanel { padding: 4px 2px 12px; }
.tip { margin-bottom: 12px; }
.bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.spacer { flex: 1; }
.muted { color: var(--el-text-color-secondary); font-size: var(--el-font-size-extra-small); }
.on-text { color: var(--el-color-warning); font-size: var(--el-font-size-extra-small); font-weight: var(--fw-semibold); }
.mono { font-family: var(--font-mono, monospace); font-size: 12px; }
.var-col { min-width: 0; }
.steps { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.step-tag { margin: 0; }
</style>
