<template>
  <div class="ais">
    <h2 class="v-title">AI 设置</h2>
    <p class="muted">
      配置 DeepSeek Harness 使用的模型与凭据。保存后立即生效，无需重启服务。密钥以 0600 权限落盘在
      <code>apps/api/runtime/.ai_settings.json</code>，不会进 git，也不会回显明文。
    </p>

    <el-card shadow="never" class="blk">
      <template #header><span class="blk-h">连接配置</span></template>

      <div class="status" :class="statusClass">
        <span class="st-dot"></span>
        <span v-if="loading">检测中…</span>
        <span v-else-if="masked.hasKey">
          已配置密钥（{{ masked.source === 'file' ? 'UI 保存' : '服务器环境变量' }}，{{ masked.apiKeyMasked }}）
        </span>
        <span v-else>尚未配置密钥，AI 助手不可用</span>
      </div>

      <el-form label-width="140px" class="form" @submit.prevent>
        <el-form-item label="DeepSeek API Key">
          <el-input v-model="form.apiKey" type="password" show-password clearable
            :placeholder="masked.hasKey ? '留空 = 沿用当前密钥' : 'sk-...'" />
        </el-form-item>
        <el-form-item label="Base URL（可选）">
          <el-input v-model="form.baseUrl" clearable placeholder="留空使用 DeepSeek 官方端点；可填自建/代理的 OpenAI 兼容端点" />
        </el-form-item>
        <el-form-item label="模型">
          <el-input v-model="form.model" clearable placeholder="deepseek-v4-flash" />
        </el-form-item>
        <el-form-item label="单次超时（秒）">
          <el-input-number v-model="form.timeoutSeconds" :min="30" :max="900" :step="30" />
        </el-form-item>
        <el-form-item label="启用 AI 助手">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>

      <div class="actions">
        <el-button type="primary" :loading="saving" v-perm="'config:write'" @click="save">保存配置</el-button>
        <el-button :loading="testing" @click="test">检测服务状态</el-button>
      </div>

      <div v-if="lastResult" class="result" :class="lastResult.ok ? 'ok' : 'bad'">
        {{ lastResult.message }}
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { fetchAiSettings, saveAiSettings, fetchAiStatus } from '@shared/api/dashboards.js';

const loading = ref(true);
const saving = ref(false);
const testing = ref(false);
const lastResult = ref(null);
const masked = reactive({ hasKey: false, apiKeyMasked: '', source: 'none', baseUrl: '', model: '', timeoutSeconds: 300, enabled: true });
const form = reactive({ apiKey: '', baseUrl: '', model: 'deepseek-v4-flash', timeoutSeconds: 300, enabled: true });
const statusClass = computed(() => loading.value ? 'st--run' : masked.hasKey ? 'st--ok' : 'st--warn');

async function load() {
  loading.value = true;
  try {
    const d = await fetchAiSettings();
    Object.assign(masked, {
      hasKey: !!d.hasKey, apiKeyMasked: d.apiKeyMasked || '', source: d.source || 'none',
      baseUrl: d.baseUrl || '', model: d.model || '', timeoutSeconds: d.timeoutSeconds || 300,
      enabled: d.enabled !== false,
    });
    form.baseUrl = d.baseUrl || '';
    form.model = d.model || 'deepseek-v4-flash';
    form.timeoutSeconds = d.timeoutSeconds || 300;
    form.enabled = d.enabled !== false;
  } catch (e) {
    ElMessage.error(e.message || '读取配置失败');
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    const d = await saveAiSettings({ ...form });
    Object.assign(masked, { hasKey: !!d.hasKey, apiKeyMasked: d.apiKeyMasked || '', source: d.source || 'none' });
    form.apiKey = '';
    lastResult.value = { ok: true, message: '配置已保存，立即生效。' };
    ElMessage.success('已保存');
  } catch (e) {
    lastResult.value = { ok: false, message: e.message || '保存失败' };
  } finally {
    saving.value = false;
  }
}

async function test() {
  testing.value = true;
  try {
    const d = await fetchAiStatus();
    lastResult.value = {
      ok: !!d.available && !!d.configured,
      message: `DSH SDK ${d.available ? '可用' : '不可用'}；密钥 ${d.configured ? '已配置' : '未配置'}；模型 ${d.model || '-'}${d.error ? '；' + d.error : ''}`,
    };
  } catch (e) {
    lastResult.value = { ok: false, message: e.message || '检测失败' };
  } finally {
    testing.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.ais { padding: var(--sp-20); max-width: 860px; }
.v-title { margin: 0 0 var(--sp-12); font-size: var(--el-font-size-extra-large); }
.muted { color: var(--el-text-color-secondary); }
code { background: var(--el-fill-color-light); padding: 1px 4px; border-radius: 3px; }
.blk { margin-top: 14px; }
.blk-h { font-weight: var(--fw-semibold); }
.status { display: flex; align-items: center; gap: 8px; padding: 10px 12px; margin-bottom: 14px; border: 1px solid #ebeef5; border-radius: 6px; font-size: var(--el-font-size-small); }
.st-dot { width: 8px; height: 8px; border-radius: 50%; background: #909399; }
.st--ok .st-dot { background: #67c23a; }
.st--warn .st-dot { background: #e6a23c; }
.st--run .st-dot { background: #409eff; }
.form { max-width: 640px; }
.actions { display: flex; gap: 8px; margin-top: 8px; }
.result { margin-top: 12px; padding: 8px 12px; border-radius: 4px; font-size: var(--el-font-size-small); }
.result.ok { background: var(--el-color-success-light-9); color: var(--el-color-success); }
.result.bad { background: var(--el-color-danger-light-9); color: var(--el-color-danger); }
</style>
