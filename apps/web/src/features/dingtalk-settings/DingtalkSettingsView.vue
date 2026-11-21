<template>
  <div class="dt">
    <h2 class="v-title">钉钉集成</h2>

    <!-- 钉钉 DWS：授权状态 + 发消息设置 + CLI 配置（同一卡片内） -->
    <el-card class="blk" shadow="never">
      <template #header>
        <span class="blk-h">钉钉 DWS</span>
        <el-switch
          v-model="sendSettings.aiTag"
          class="blk-switch"
          active-text="AI角标"
          inactive-text="无角标"
          inline-prompt
          :loading="sendSaving"
          @change="saveAiTag"
        />
        <span class="blk-sub">开启时 dws 发出的消息带「通过AI发送」小尾巴（切换即时保存）</span>
      </template>

      <div v-if="ding.loggedIn" class="ding-ok">
        <div class="ding-ok-head">
          <span class="ok-dot"></span>
          <span class="ok-title">授权状态</span>
          <span class="ok-ver" @click="tapVersion">Version {{ dwsVersion }}</span>
          <el-button
            link
            type="primary"
            size="small"
            :loading="checking || upgradeProgress.running"
            :disabled="upgradeProgress.running || (!checking && !checkError && !updateInfo.needsUpgrade)"
            :title="checkError || upgradeProgress.error || upgradeProgress.detail"
            @click="doUpgrade"
          >
            {{ upgradeButtonText }}
          </el-button>
          <el-button v-if="changelogInfo.items.length" link type="primary" size="small" @click="changelogVisible = true">更新记录</el-button>
          <el-button size="small" type="danger" plain :loading="ding.loggingOut" @click="dingLogout">退出登录</el-button>
        </div>
        <div v-if="upgradeProgress.running" class="up-progress">
          <el-progress
            :percentage="upgradeProgress.percent >= 0 ? upgradeProgress.percent : 0"
            :show-text="upgradeProgress.percent >= 0"
          />
          <span class="up-detail">{{ upgradeProgress.detail }}</span>
        </div>
        <div class="ding-info-grid" v-if="ding.profile && ding.profile.corp_name">
          <div class="di"><span class="di-k">组织</span><span class="di-v">{{ ding.profile.corp_name }}</span></div>
          <div class="di"><span class="di-k">账号</span><span class="di-v">{{ ding.profile.user_name || '-' }}<span class="di-sub" v-if="ding.profile.user_id"> · {{ ding.profile.user_id }}</span></span></div>
          <div class="di"><span class="di-k">访问令牌</span><span class="di-v"><el-tag :type="ding.profile.token_valid ? 'success' : 'danger'" size="small" effect="light">{{ ding.profile.token_valid ? '有效' : '已失效' }}</el-tag></span></div>
          <div class="di"><span class="di-k">刷新令牌</span><span class="di-v"><el-tag :type="ding.profile.refresh_token_valid ? 'success' : 'danger'" size="small" effect="light">{{ ding.profile.refresh_token_valid ? '有效' : '已失效' }}</el-tag></span></div>
          <div class="di di-wide"><span class="di-k">有效期至</span><span class="di-v">{{ fmt(ding.profile.expires_at) }}<span class="di-sub">（剩余 {{ remainDays(ding.profile.expires_at) }} 天）</span></span></div>
        </div>
      </div>
      <template v-else>
        <p class="muted">
          钉钉未授权：发消息、解析群等依赖钉钉的功能暂不可用。点击下方按钮获取授权码，
          在浏览器或钉钉中打开授权链接并完成授权即可。
        </p>
        <el-button type="primary" :loading="ding.loading" @click="dingStart">
          {{ ding.info ? '重新获取授权码' : '获取登录授权码' }}
        </el-button>
      </template>

      <div v-if="ding.info" class="ding-card">
        <div class="ding-row">
          <span class="ding-k">授权码</span>
          <code class="ding-code">{{ ding.info.userCode }}</code>
          <el-button size="small" @click="copyText(ding.info.userCode)">复制</el-button>
        </div>
        <div class="ding-row">
          <span class="ding-k">授权链接</span>
          <a :href="ding.info.verificationUri" target="_blank" rel="noopener">点击打开授权页</a>
        </div>
        <div class="ding-row">
          <span class="ding-k">过期时间</span>
          <span>{{ new Date(ding.expireAt).toLocaleString() }}</span>
        </div>
        <el-alert
          type="info"
          :closable="false"
          title="请在浏览器/钉钉打开上方链接并确认授权，本页会自动刷新状态；授权完成后无需手动操作。"
        />
      </div>

      <template v-if="devUnlocked">
        <div class="blk-section">
          <div class="sec-h">DWS 配置（{{ items.length }} 项）</div>
          <el-collapse v-model="activeGroups" accordion>
            <el-collapse-item
              v-for="g in grouped"
              :key="g.cat"
              :title="catLabel(g.cat)"
              :name="g.cat"
            >
              <div v-for="it in g.items" :key="it.key" class="cfg-row">
                <div class="cfg-meta">
                  <code class="cfg-key">{{ it.key }}</code>
                  <span class="cfg-desc">{{ it.description }}</span>
                </div>
                <el-input
                  v-if="it.sensitive"
                  v-model="form[it.key]"
                  :placeholder="origSensitive[it.key] ? '已设置，修改请重填；留空保持不变' : '未设置'"
                  type="password"
                  show-password
                  class="cfg-input"
                />
                <el-input
                  v-else
                  v-model="form[it.key]"
                  :placeholder="'默认：' + it.default"
                  class="cfg-input"
                />
              </div>
            </el-collapse-item>
          </el-collapse>

          <div class="cfg-actions">
            <el-button type="primary" :loading="saving" @click="save">保存配置</el-button>
            <el-button @click="lockDev">锁定开发者配置</el-button>
          </div>
        </div>
      </template>
    </el-card>

    <!-- 钉钉单点登录(SSO)配置 -->
    <el-card class="blk" shadow="never">
      <template #header>
        <span class="blk-h">钉钉单点登录 (SSO) 配置</span>
        <el-switch v-model="sso.enabled" class="blk-switch" active-text="启用" inactive-text="停用" inline-prompt />
        <span class="blk-sub">停用时不改变已填凭证，钉钉登录入口即刻下线</span>
      </template>

      <el-alert
        v-if="!sso.active"
        type="warning"
        :closable="false"
        class="blk-alert"
        title="钉钉登录当前不会生效：需要 AppKey / AppSecret 齐全且上方开关为「启用」（关闭本开关即临时下线钉钉登录，系统仅保留账密登录）。"
      />

      <el-form label-width="160px" label-position="left" class="sso-form">
        <el-form-item label="AppKey">
          <el-input v-model="sso.appKey" placeholder="钉钉企业内部应用的 AppKey" />
        </el-form-item>
        <el-form-item label="AppSecret">
          <el-input
            v-model="sso.appSecret"
            :placeholder="sso.appSecretSet ? '已设置，修改请重填；留空保持不变' : '钉钉企业内部应用的 AppSecret'"
            type="password"
            show-password
          />
        </el-form-item>
        <el-form-item label="CorpId">
          <el-input v-model="sso.corpId" placeholder="企业 CorpId（JSAPI 免登需要）" />
        </el-form-item>
        <el-form-item label="OAuth2 回跳地址">
          <el-input
            v-model="sso.oauthRedirectUri"
            placeholder="https://你的域名/api/auth/dingtalk/oauth-callback"
          />
          <span class="cfg-hint">浏览器独立访问扫码登录用，须在钉钉后台「登录与分享 → 回调域名」登记该域名。</span>
        </el-form-item>
        <el-form-item label="前端地址">
          <el-input v-model="sso.frontendUrl" placeholder="留空则自动取请求来源（同域部署可留空）" />
        </el-form-item>
      </el-form>

      <div class="cfg-actions">
        <el-button type="primary" :loading="ssoSaving" @click="saveSso">保存配置</el-button>
      </div>
    </el-card>

    <el-dialog v-model="changelogVisible" :title="`${changelogInfo.version} 更新记录`" width="640px">
      <div class="cl-meta" v-if="changelogInfo.date">发布日期：{{ changelogInfo.date }}</div>
      <div class="cl-list">
        <div v-for="(line, i) in changelogInfo.items" :key="i" class="cl-item">{{ line }}</div>
      </div>
      <template #footer>
        <a v-if="changelogInfo.url" :href="changelogInfo.url" target="_blank" rel="noopener">查看完整发布说明</a>
        <el-button @click="changelogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, reactive, ref, computed } from 'vue';
import { useAppStore } from '@shared/stores/app.js';
import {
  dingAuthStart,
  dingAuthStatus,
  dingAuthLogout,
  dingConfig,
  saveDingConfig,
  dingVersion,
  dingUpgradeCheck,
  dingUpgrade,
  dingUpgradeStatus,
  getDingSendSettings,
  saveDingSendSettings,
  getSsoConfig,
  saveSsoConfig,
} from '@shared/api/dashboards.js';

const app = useAppStore();

const CAT_LABELS = {
  core: '核心',
  auth: '认证',
  network: '网络',
  security: '安全',
  audit: '审计',
  runtime: '运行时',
  debug: '调试',
  external: '外部透传',
};

/* ---------------- 钉钉授权 ---------------- */
const ding = reactive({ loading: false, info: null, expireAt: 0, loggedIn: false, profileName: '', profile: {}, loggingOut: false });
let dingTimer = null;
async function dingRefresh() {
  try {
    const r = await dingAuthStatus();
    const d = (r && r.data) || r || {};
    ding.loggedIn = !!d.authenticated;
    const p = d.profile || {};
    ding.profileName = p.profileName || p.corpName || p.name || '';
    ding.profile = p;
    if (ding.loggedIn) { ding.info = null; stopDingPoll(); }
  } catch (e) { /* 轮询错误忽略 */ }
}
async function dingLogout() {
  const ok = await app.confirmDialog({
    title: '退出钉钉登录',
    message: '确定要退出钉钉登录吗？退出后需重新发起授权，发消息等依赖钉钉的功能将暂不可用。',
    okText: '退出',
    cancelText: '取消',
  });
  if (!ok) return;
  ding.loggingOut = true;
  try {
    const r = await dingAuthLogout();
    if (r && r.ok) {
      ElMessage.success('已退出钉钉登录，可重新发起授权');
      ding.profile = {};
      await dingRefresh();
    } else {
      ElMessage.error((r && (r.error || r.message)) || '退出登录失败');
    }
  } catch (e) { ElMessage.error(e.message || '退出登录失败'); }
  finally { ding.loggingOut = false; }
}
function fmt(iso) {
  if (!iso) return '-';
  const t = new Date(iso);
  if (isNaN(t.getTime())) return String(iso);
  return t.toLocaleString('zh-CN', { hour12: false });
}
function remainDays(iso) {
  if (!iso) return '-';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '-';
  return Math.max(0, Math.ceil((t - Date.now()) / 86400000));
}
function startDingPoll() { stopDingPoll(); dingTimer = setInterval(dingRefresh, 3000); dingRefresh(); }
function stopDingPoll() { if (dingTimer) { clearInterval(dingTimer); dingTimer = null; } }
async function dingStart() {
  ding.loading = true;
  try {
    const r = await dingAuthStart();
    const d = (r && r.data) || r || {};
    ding.info = { userCode: d.userCode, verificationUri: d.verificationUri };
    ding.expireAt = Date.now() + (Number(d.expiresInSeconds) || 900) * 1000;
    startDingPoll();
    ElMessage.success('已生成授权码，请在浏览器中完成授权');
  } catch (e) { ElMessage.error(e.message || '发起授权失败'); }
  finally { ding.loading = false; }
}
function copyText(t) {
  try { navigator.clipboard?.writeText(t); ElMessage.success('已复制'); } catch { /* ignore */ }
}

/* ---------------- DWS 配置项 ---------------- */
const items = ref([]);
const form = reactive({});
const origSensitive = reactive({});
const saving = ref(false);
// 发消息 AI 角标开关：默认与 dws 保持一致（带角标），保存后立即作用于下一次发送。
const sendSettings = reactive({ aiTag: true });
const sendSaving = ref(false);
// 手风琴模式：同时只展开一组，默认全部折叠。
const activeGroups = ref('');

// 开发者配置解锁：仅前端 UI 状态（localStorage），不写后端；已保存的配置不受锁定影响。
const DEV_UNLOCK_KEY = 'aeolus-dws-dev-unlocked';
const DEV_TAPS_REQUIRED = 7;
const devUnlocked = ref((() => {
  try { return localStorage.getItem(DEV_UNLOCK_KEY) === '1'; } catch { return false; }
})());
const tapCount = ref(0);
const dwsVersion = ref('');
const checking = ref(false);
const upgradeProgress = reactive({ running: false, phase: 'idle', detail: '', percent: 0, targetVersion: null, error: null });
let upgradePollTimer = null;
const checkError = ref('');
const updateInfo = reactive({ needsUpgrade: false, current: '', latest: '' });
const changelogVisible = ref(false);
const changelogInfo = reactive({ version: '', date: '', url: '', items: [] });
let tapTimer = null;

async function loadVersion() {
  try {
    const r = await dingVersion();
    const d = (r && r.data) || r || {};
    dwsVersion.value = d.version || '';
  } catch { /* 版本号拿不到不影响功能 */ }
}
async function runCheck() {
  checking.value = true;
  checkError.value = '';
  try {
    const r = await dingUpgradeCheck();
    if (!r || r.ok === false) throw new Error((r && (r.error || r.message)) || '检查失败');
    const d = (r && r.data) || r || {};
    updateInfo.current = d.current_version || '';
    updateInfo.latest = d.latest_version || '';
    updateInfo.needsUpgrade = !!d.needs_upgrade;
    changelogInfo.version = d.latest_version || '';
    changelogInfo.date = d.release_date || '';
    changelogInfo.url = d.release_url || '';
    changelogInfo.items = Array.isArray(d.changelog) ? d.changelog : [];
    if (updateInfo.current) dwsVersion.value = updateInfo.current;
  } catch (e) {
    checkError.value = e.message || '检查失败';
    updateInfo.needsUpgrade = false;
    changelogInfo.items = [];
  } finally { checking.value = false; }
}
function applyUpgradeProgress(d) {
  upgradeProgress.running = !!d?.running;
  upgradeProgress.phase = d?.phase || 'idle';
  upgradeProgress.detail = d?.detail || '';
  upgradeProgress.percent = typeof d?.percent === 'number' ? d.percent : 0;
  upgradeProgress.targetVersion = d?.targetVersion || null;
  upgradeProgress.error = d?.error || null;
}
function stopUpgradePoll() {
  if (upgradePollTimer) { clearInterval(upgradePollTimer); upgradePollTimer = null; }
}
async function pollUpgradeStatus() {
  try {
    const r = await dingUpgradeStatus();
    const d = (r && r.data) || r || {};
    const wasRunning = upgradeProgress.running;
    applyUpgradeProgress(d);
    if (!d.running && wasRunning) {
      stopUpgradePoll();
      await loadVersion();
      await runCheck();
      if (d.phase === 'done') ElMessage.success('dws 已更新');
      else ElMessage.error(d.error || '升级失败');
    }
  } catch { /* 轮询失败下次继续 */ }
}
function startUpgradePoll() {
  stopUpgradePoll();
  upgradePollTimer = setInterval(pollUpgradeStatus, 1000);
}
async function initUpgradeState() {
  try {
    const r = await dingUpgradeStatus();
    const d = (r && r.data) || r || {};
    applyUpgradeProgress(d);
    if (d.running) { startUpgradePoll(); return false; }
  } catch { /* 状态接口不可用则走版本检查 */ }
  return true;
}
async function doUpgrade() {
  if (checking.value || upgradeProgress.running) return;
  if (checkError.value) { await runCheck(); return; }
  if (!updateInfo.needsUpgrade) return;
  const ok = await app.confirmDialog({
    title: '更新 dws CLI',
    message: `当前 ${updateInfo.current || dwsVersion.value}，最新 ${updateInfo.latest}。更新会替换 CLI 与技能包，期间请勿执行任务。`,
    okText: '更新',
    cancelText: '取消',
  });
  if (!ok) return;
  try {
    const ur = await dingUpgrade();
    if (!ur || ur.ok === false) throw new Error((ur && (ur.error || ur.message)) || '启动升级失败');
    applyUpgradeProgress((ur && ur.data) || ur);
    if (upgradeProgress.running) startUpgradePoll();
    else ElMessage.success('dws 已更新');
  } catch (e) { ElMessage.error(e.message || '启动升级失败'); }
}
function tapVersion() {
  if (devUnlocked.value) return;
  tapCount.value += 1;
  if (tapTimer) clearTimeout(tapTimer);
  tapTimer = setTimeout(() => { tapCount.value = 0; }, 5000);
  if (tapCount.value < DEV_TAPS_REQUIRED) return;
  devUnlocked.value = true;
  try { localStorage.setItem(DEV_UNLOCK_KEY, '1'); } catch { /* ignore */ }
  if (tapTimer) clearTimeout(tapTimer);
  tapCount.value = 0;
}
function lockDev() {
  devUnlocked.value = false;
  tapCount.value = 0;
  if (tapTimer) clearTimeout(tapTimer);
  try { localStorage.removeItem(DEV_UNLOCK_KEY); } catch { /* ignore */ }
}

const categories = computed(() => [...new Set(items.value.map((i) => i.category))]);
const grouped = computed(() =>
  categories.value.map((cat) => ({ cat, items: items.value.filter((i) => i.category === cat) })),
);
function catLabel(c) { return CAT_LABELS[c] || c; }

const UPGRADE_PHASE_LABELS = {
  checking: '检查中', backup: '备份中', download: '下载中', verify: '校验中',
  extract: '解压中', install: '安装中', done: '已完成', error: '更新失败',
};
const upgradeButtonText = computed(() => {
  if (upgradeProgress.running) {
    const label = UPGRADE_PHASE_LABELS[upgradeProgress.phase] || '更新中';
    return upgradeProgress.phase === 'download' && upgradeProgress.percent >= 0
      ? `${label} ${upgradeProgress.percent}%` : label;
  }
  if (checking.value) return '检查中';
  if (checkError.value) return '检查失败';
  return updateInfo.needsUpgrade ? '更新' : '已是最新';
});

async function loadConfig() {
  try {
    const r = await dingConfig();
    const body = (r && r.data) || r || {};
    const its = body.items || [];
    items.value = its;
    its.forEach((it) => {
      form[it.key] = it.value || '';
      if (it.sensitive) origSensitive[it.key] = !!it.value;
    });
  } catch (e) { ElMessage.error(e.message || '加载 dws 配置失败'); }
}
async function save() {
  saving.value = true;
  const patch = {};
  items.value.forEach((it) => {
    const v = form[it.key] ?? '';
    if (it.sensitive) {
      if (v !== '') patch[it.key] = v; // 敏感项留空 = 保持不变
    } else {
      patch[it.key] = v; // 非敏感项空 = 恢复默认
    }
  });
  try {
    const r = await saveDingConfig(patch);
    if (r && r.ok) { ElMessage.success('已保存 dws 配置'); await loadConfig(); }
    else ElMessage.error('保存失败');
  } catch (e) { ElMessage.error(e.message || '保存失败'); }
  finally { saving.value = false; }
}

async function loadSendSettings() {
  try {
    const r = await getDingSendSettings();
    const d = (r && r.data) || r || {};
    sendSettings.aiTag = d.aiTag !== false;
  } catch (e) { ElMessage.error(e.message || '加载发消息设置失败'); }
}
async function saveAiTag(v) {
  const next = !!v;
  sendSaving.value = true;
  try {
    const r = await saveDingSendSettings({ aiTag: next });
    if (r && r.ok) {
      await loadSendSettings();
      ElMessage.success(next ? '已开启 AI 角标' : '已关闭 AI 角标');
    } else {
      sendSettings.aiTag = !next;
      ElMessage.error((r && (r.error || r.message)) || '保存失败');
    }
  } catch (e) {
    sendSettings.aiTag = !next;
    ElMessage.error(e.message || '保存失败');
  } finally { sendSaving.value = false; }
}

onMounted(() => {
  dingRefresh(); loadConfig(); loadVersion(); loadSendSettings(); loadSso();
  void initUpgradeState().then((ok) => { if (ok) void runCheck(); });
});
onUnmounted(() => { stopDingPoll(); stopUpgradePoll(); });

/* ---------------- 钉钉 SSO 配置 ---------------- */
const sso = reactive({
  enabled: false,
  // 实际生效状态（开关开 且 AppKey/AppSecret 齐全）
  active: false,
  appKey: '',
  appSecret: '',
  appSecretSet: false,
  corpId: '',
  oauthRedirectUri: '',
  frontendUrl: '',
});
const ssoSaving = ref(false);
async function loadSso() {
  try {
    const r = await getSsoConfig();
    const c = (r && r.config) || {};
    sso.enabled = !!c.enabled;
    sso.active = !!c.active;
    sso.appKey = c.appKey || '';
    sso.appSecret = '';
    sso.appSecretSet = !!c.appSecretSet;
    sso.corpId = c.corpId || '';
    sso.oauthRedirectUri = c.oauthRedirectUri || '';
    sso.frontendUrl = c.frontendUrl || '';
  } catch (e) { ElMessage.error(e.message || '加载钉钉 SSO 配置失败'); }
}
async function saveSso() {
  ssoSaving.value = true;
  try {
    const r = await saveSsoConfig({
      enabled: sso.enabled,
      appKey: sso.appKey,
      appSecret: sso.appSecret, // 留空 = 保持不变（已设置时）
      corpId: sso.corpId,
      oauthRedirectUri: sso.oauthRedirectUri,
      frontendUrl: sso.frontendUrl,
    });
    if (r && r.ok) { ElMessage.success('已保存钉钉 SSO 配置'); await loadSso(); }
    else ElMessage.error((r && r.error) || '保存失败');
  } catch (e) { ElMessage.error(e.message || '保存失败'); }
  finally { ssoSaving.value = false; }
}
</script>

<style scoped>
.dt { padding: var(--sp-20); }
.v-title { margin: 0 0 var(--sp-16); font-size: var(--el-font-size-extra-large); }
.blk { margin-bottom: var(--sp-16); }
.blk-h { font-size: var(--el-font-size-medium); font-weight: var(--fw-semibold); }
.blk-sub { margin-left: var(--sp-12); font-size: var(--el-font-size-extra-small); color: var(--el-text-color-secondary); }
.blk-switch { margin-left: var(--sp-12); vertical-align: middle; }
.blk-section { margin-top: var(--sp-16); padding-top: var(--sp-16); border-top: 1px solid #ebeef5; }
.sec-h { margin-bottom: var(--sp-8); font-weight: var(--fw-semibold); font-size: var(--el-font-size-medium); }
.ok-ver { flex: none; font-size: var(--el-font-size-extra-small); color: var(--el-text-color-secondary); background: rgba(255,255,255,.7); padding: 1px 6px; border-radius: 4px; cursor: pointer; user-select: none; }
.cl-meta { margin-bottom: var(--sp-12); font-size: var(--el-font-size-extra-small); color: var(--el-text-color-secondary); }
.cl-list { max-height: 420px; overflow-y: auto; }
.cl-item { padding: var(--sp-8) 0; border-bottom: 1px dashed #ebeef5; font-size: var(--el-font-size-small); line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
.cl-item:last-child { border-bottom: none; }
.blk-alert { margin-bottom: var(--sp-16); }
.muted { color: var(--el-text-color-secondary); }
.sso-form { max-width: 720px; margin-top: var(--sp-8); }
.cfg-hint { display: block; margin-top: 4px; font-size: var(--el-font-size-extra-small); color: var(--el-text-color-secondary); line-height: 1.4; }
.ding-card { margin-top: var(--sp-16); border: 1px solid #ebeef5; border-radius: 8px; padding: var(--sp-16); }
.ding-row { display: flex; align-items: center; gap: var(--sp-12); margin-bottom: var(--sp-12); }
.ding-k { width: 72px; color: var(--el-text-color-secondary); flex: none; }
.ding-code { font-size: 18px; letter-spacing: 2px; background: #f5f7fa; padding: 2px 8px; border-radius: 4px; }
.cfg-row { display: flex; flex-direction: column; align-items: stretch; gap: var(--sp-8); padding: var(--sp-12) 0; border-bottom: 1px dashed #f0f0f0; }
.cfg-row:last-child { border-bottom: none; }
.cfg-meta { min-width: 0; }
.cfg-key { font-size: var(--el-font-size-small); color: var(--el-text-color-primary); background: #f5f7fa; padding: 1px 6px; border-radius: 4px; }
.cfg-desc { display: block; margin-top: 4px; font-size: var(--el-font-size-extra-small); color: var(--el-text-color-secondary); line-height: 1.4; }
.cfg-input { width: 360px; max-width: 100%; }
.cfg-actions { margin-top: var(--sp-16); display: flex; align-items: center; gap: var(--sp-12); flex-wrap: wrap; }
.ding-ok { border: 1px solid #e1f3d8; background: #f0f9eb; border-radius: 8px; padding: var(--sp-16); }
.ding-ok-head { display: flex; align-items: center; gap: var(--sp-12); margin-bottom: var(--sp-12); }
.ok-dot { width: 9px; height: 9px; border-radius: 50%; background: #67c23a; box-shadow: 0 0 0 3px rgba(103,194,58,.18); flex: none; }
.ok-title { font-weight: 600; font-size: var(--el-font-size-medium); flex: 1; }
.up-progress { display: flex; align-items: center; gap: var(--sp-12); margin-bottom: var(--sp-12); }
.up-progress .el-progress { flex: 1; }
.up-detail { flex: none; font-size: var(--el-font-size-extra-small); color: var(--el-text-color-secondary); }
.ding-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-10) var(--sp-24); }
.di { display: flex; align-items: baseline; gap: var(--sp-10); min-width: 0; }
.di-wide { grid-column: 1 / -1; }
.di-k { width: 64px; color: var(--el-text-color-secondary); flex: none; font-size: var(--el-font-size-extra-small); }
.di-v { font-size: var(--el-font-size-small); color: #303133; word-break: break-all; }
.di-sub { color: var(--el-text-color-secondary); margin-left: 4px; }
</style>
