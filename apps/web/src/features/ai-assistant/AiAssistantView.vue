<template>
  <div class="ai">
    <h2 class="v-title">AI 助手</h2>
    <p class="muted">
      基于 DeepSeek Harness 的智能助手。所有数据仅经 Aeolus 后端转发，DSH 以无头进程运行于服务器，不提供文件与命令执行能力。
      <RouterLink to="/settings/ai-features" class="lnk">查看功能地图 →</RouterLink>
    </p>

    <div class="status" :class="statusClass">
      <span class="st-dot"></span>
      <span v-if="status.loading">正在检测 AI 服务状态…</span>
      <span v-else-if="status.configured && status.available && status.enabled">
        已就绪：模型 {{ status.model }}（DSH SDK 可用）
      </span>
      <span v-else-if="!status.configured">
        尚未配置 DeepSeek API Key，请到
        <RouterLink to="/settings/ai" class="lnk">系统设置 → AI 设置</RouterLink>
        填写。
      </span>
      <span v-else>
        AI 服务不可用：{{ status.error || 'DSH SDK 未安装或被停用' }}
      </span>
    </div>

    <el-card shadow="never" class="chat">
      <template #header>
        <div class="chat-h">
          <span>对话</span>
          <span class="muted small">
            <span v-if="sessionId">会话 {{ sessionId.slice(0, 8) }}…（续接中）</span>
            <span v-else>新会话</span>
          </span>
        </div>
      </template>

      <div ref="listEl" class="msgs">
        <div v-if="!messages.length" class="empty">
          <div class="empty-t">向 AI 助手提问</div>
          <div class="muted">例如：总结一下最近一周的配送超时情况，给出三条改进建议。</div>
        </div>
        <div v-for="(m, i) in messages" :key="i" class="msg" :class="'msg--' + m.role">
          <div class="who">{{ m.role === 'user' ? '我' : 'AI' }}</div>
          <div class="bubble">
            <div class="text" v-text="m.text"></div>
            <div v-if="m.error" class="err">{{ m.error }}</div>
          </div>
        </div>
        <div v-if="running" class="msg msg--ai">
          <div class="who">AI</div>
          <div class="bubble muted">正在思考（可能需要 1–5 分钟，服务器同时只跑一个任务）…</div>
        </div>
      </div>

      <div class="composer">
        <el-input
          v-model="input"
          type="textarea"
          :rows="3"
          :disabled="running"
          placeholder="输入问题；Enter 发送，Shift+Enter 换行"
          @keydown.enter.exact.prevent="send"
        />
        <div class="composer-b">
          <el-button text size="small" @click="reset">新会话</el-button>
          <el-button type="primary" :loading="running" :disabled="!canSend" @click="send">发送</el-button>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { fetchAiStatus, runAi } from '@shared/api/dashboards.js';

const status = reactive({ loading: true, configured: false, available: false, enabled: true, model: '', error: '' });
const statusClass = computed(() => {
  if (status.loading) return 'st--run';
  return status.configured && status.available && status.enabled ? 'st--ok' : 'st--warn';
});

const messages = ref([]);
const input = ref('');
const running = ref(false);
const sessionId = ref('');
const listEl = ref(null);
const canSend = computed(() => !running.value && !!input.value.trim() && status.configured);

async function loadStatus() {
  status.loading = true;
  try {
    const d = await fetchAiStatus();
    Object.assign(status, {
      configured: !!d.configured,
      available: !!d.available,
      enabled: d.enabled !== false,
      model: d.model || '',
      error: d.error || '',
    });
  } catch (e) {
    status.error = e.message || '状态检测失败';
  } finally {
    status.loading = false;
  }
}

function scrollBottom() {
  nextTick(() => { if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight; });
}

async function send() {
  const prompt = input.value.trim();
  if (!prompt || running.value) return;
  messages.value.push({ role: 'user', text: prompt });
  input.value = '';
  running.value = true;
  messages.value.push({ role: 'ai', text: '', error: '' });
  const idx = messages.value.length - 1;
  scrollBottom();
  try {
    const d = await runAi({ prompt, sessionId: sessionId.value || undefined });
    if (d.ok === false) {
      messages.value[idx].error = d.error || '执行失败';
    } else {
      messages.value[idx].text = d.final_response || '（无返回内容）';
      if (d.session_id) sessionId.value = d.session_id;
      if (d.finish_reason && d.finish_reason !== 'completed') {
        messages.value[idx].error = `结束原因：${d.finish_reason}`;
      }
    }
  } catch (e) {
    messages.value[idx].error = e.message || '请求失败';
  } finally {
    running.value = false;
    scrollBottom();
  }
}

function reset() {
  sessionId.value = '';
  messages.value = [];
  ElMessage.success('已开启新会话');
}

onMounted(loadStatus);
</script>

<style scoped>
.ai { padding: var(--sp-20); max-width: 920px; }
.v-title { margin: 0 0 var(--sp-12); font-size: var(--el-font-size-extra-large); }
.muted { color: var(--el-text-color-secondary); }
.small { font-size: var(--el-font-size-extra-small); }
.lnk { color: var(--el-color-primary); text-decoration: none; }
.status {
  display: flex; align-items: center; gap: 8px; padding: 10px 12px; margin: 12px 0;
  border: 1px solid #ebeef5; border-radius: 6px; font-size: var(--el-font-size-small);
}
.st-dot { width: 8px; height: 8px; border-radius: 50%; background: #909399; flex: none; }
.st--ok .st-dot { background: #67c23a; }
.st--warn .st-dot { background: #e6a23c; }
.st--run .st-dot { background: #409eff; }
.chat-h { display: flex; justify-content: space-between; align-items: center; }
.msgs {
  min-height: 340px; max-height: 56vh; overflow-y: auto; padding: 12px 4px;
  display: flex; flex-direction: column; gap: 12px;
}
.empty { margin: auto; text-align: center; padding: 40px 0; }
.empty-t { font-size: var(--el-font-size-medium); font-weight: var(--fw-semibold); margin-bottom: 8px; }
.msg { display: flex; gap: 10px; align-items: flex-start; }
.msg--user { flex-direction: row-reverse; }
.who {
  flex: none; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center;
  background: var(--el-fill-color-light); font-size: 12px; color: var(--el-text-color-regular);
}
.msg--user .who { background: var(--el-color-primary-light-9); color: var(--el-color-primary); }
.bubble {
  max-width: 78%; padding: 10px 12px; border-radius: 8px; background: var(--el-fill-color-light);
  font-size: var(--el-font-size-small); line-height: 1.6;
}
.msg--user .bubble { background: var(--el-color-primary-light-9); }
.text { white-space: pre-wrap; word-break: break-word; }
.err { margin-top: 6px; color: var(--el-color-danger); font-size: var(--el-font-size-extra-small); }
.composer { border-top: 1px solid #ebeef5; padding-top: 12px; }
.composer-b { display: flex; justify-content: space-between; margin-top: 8px; }
</style>
