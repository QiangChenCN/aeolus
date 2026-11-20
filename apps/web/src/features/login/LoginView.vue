<template>
  <div class="login-page">
    <div class="login-card">
      <!-- 左侧品牌区 -->
      <aside class="login-brand">
        <img class="lb-logo" src="@shared-ui/assets/aeolus-workbench.svg" alt="Aeolus" />
        <h1 class="lb-title">Aeolus WorkBench</h1>
        <p class="lb-tag">一站式任务编排与数据看板</p>
        <ul class="lb-feats">
          <li><el-icon><List /></el-icon> 任务编排与运行记录</li>
          <li><el-icon><DataLine /></el-icon> 实时数据看板</li>
          <li><el-icon><ChatDotRound /></el-icon> 机器人接入与配置</li>
        </ul>
        <p class="lb-foot">登录即进入受保护的工作区</p>
      </aside>

      <!-- 右侧表单区 -->
      <section class="login-form">
        <h2 class="lf-title">登录工作台</h2>
        <p class="lf-sub">使用工作台账号登录以继续</p>

        <el-alert
          v-if="error"
          class="lf-alert"
          :title="error"
          type="error"
          :closable="false"
          show-icon
        />

        <el-alert
          v-if="dt.dtStatus === 'logging'"
          class="lf-alert"
          title="正在通过钉钉自动登录…"
          type="info"
          :closable="false"
          show-icon
        />
        <el-alert
          v-else-if="dt.dtStatus === 'unbound'"
          class="lf-alert"
          :title="dt.dtMessage"
          type="warning"
          :closable="false"
          show-icon
        />
        <el-alert
          v-else-if="dt.dtStatus === 'failed'"
          class="lf-alert"
          :title="dt.dtMessage"
          type="warning"
          :closable="false"
          show-icon
        />

        <el-form label-position="top" @submit.prevent="submit">
          <el-form-item label="用户名">
            <el-input
              v-model="username"
              size="large"
              placeholder="请输入用户名"
              :prefix-icon="User"
              autofocus
              :disabled="loading"
            />
          </el-form-item>
          <el-form-item label="密码">
            <el-input
              v-model="password"
              size="large"
              type="password"
              show-password
              placeholder="请输入密码"
              :prefix-icon="Lock"
              :disabled="loading"
              @keyup.enter="submit"
            />
          </el-form-item>
          <div class="lf-remember">
            <el-checkbox v-model="remember">记住我（7 天内免登录）</el-checkbox>
          </div>
          <div class="lf-actions">
            <el-button
              type="primary"
              size="large"
              class="lf-btn"
              :loading="loading"
              @click="submit"
            >登录</el-button>

            <!-- 仅在非钉钉环境（普通浏览器）显示：钉钉容器内统一走 JSAPI 免登，
                 不再额外给出 OAuth2 授权入口（扫码登录按钮对手机端无意义）。 -->
            <el-button
              v-if="dt.dtEnabled && !dt.inDingtalk"
              size="large"
              class="lf-btn lf-btn--ding"
              :icon="ChatDotRound"
              @click="dt.openOauth"
            >使用钉钉扫码登录</el-button>
          </div>
        </el-form>

        <p class="lf-hint">
          登录即代表您同意相关使用规范；如忘记密码或无法登录，请联系系统管理员。
        </p>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { User, Lock, List, DataLine, ChatDotRound } from '@element-plus/icons-vue';
import { useAuthStore } from '@shared/stores/auth.js';
import { useDingtalkLogin } from '@shared/composables/useDingtalkLogin.js';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const username = ref('');
const password = ref('');
const remember = ref(false);
const loading = ref(false);
const error = ref('');

// 钉钉免登 / 绑定逻辑与移动端共用，跳转落点由各端自行决定
const dt = useDingtalkLogin({
  onSuccess: () => {
    router.replace(auth.mustChange ? '/settings/profile' : redirectTarget());
  },
});

function redirectTarget() {
  return typeof route.query.redirect === 'string' && route.query.redirect
    ? route.query.redirect
    : '/';
}

async function submit() {
  error.value = '';
  if (!username.value || !password.value) { error.value = '请输入用户名和密码'; return; }
  loading.value = true;
  try {
    await auth.signin(username.value, password.value, remember.value);
    // 初始密码必须先改：后端已拦截其它接口，这里先把用户送到个人中心
    if (auth.mustChange) {
      router.replace('/settings/profile');
      return;
    }
    // 登录成功后，若有「已通过钉钉验证的待绑定凭证」则自动绑定当前账号
    await dt.bindAfterSignin();
    router.replace(redirectTarget());
  } catch (e) {
    error.value = e.message || '登录失败';
  } finally {
    loading.value = false;
  }
}

</script>

<style scoped>
.login-page {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sp-24);
  background: linear-gradient(135deg, #eef2ff 0%, #f7f9fc 100%);
}
.login-card {
  width: min(880px, 100%);
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  overflow: hidden;
  box-shadow: 0 18px 50px rgba(20, 30, 60, 0.12);
}
.login-brand {
  padding: var(--sp-40);
  color: var(--el-bg-color);
  background: linear-gradient(150deg, var(--el-color-primary) 0%, #4f6bff 100%);
  display: flex;
  flex-direction: column;
}
.lb-logo { width: 64px; height: 64px; border-radius: 14px; box-shadow: 0 6px 18px rgba(0, 20, 60, 0.25); }
.lb-title { margin: var(--sp-16) 0 var(--sp-8); font-size: 22px; font-weight: var(--fw-bold); }
.lb-tag { margin: 0 0 var(--sp-32); font-size: var(--el-font-size-base); opacity: 0.92; }
.lb-feats {
  list-style: none;
  margin: auto 0 var(--sp-24);
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-14);
}
.lb-feats li {
  display: flex;
  align-items: center;
  gap: var(--sp-10);
  font-size: var(--el-font-size-base);
}
.lb-foot { margin: 0; font-size: 12px; opacity: 0.8; }

.login-form {
  padding: var(--sp-40);
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.lf-title { margin: 0; font-size: 22px; font-weight: var(--fw-bold); }
.lf-sub { margin: var(--sp-8) 0 var(--sp-24); color: var(--el-text-color-secondary); }
.lf-alert { margin-bottom: var(--sp-16); }
.lf-actions { display: flex; flex-direction: column; gap: var(--sp-12); margin-top: var(--sp-12); }
.lf-actions .lf-btn { margin-left: 0; } /* 覆盖 Element Plus 的 .el-button + .el-button { margin-left: 12px } */
.lf-btn { width: 100%; }
/* 钉钉按钮作为次级操作：去掉默认描边带来的视觉错位感，与上方主按钮保持一致的盒模型 */
.lf-btn--ding {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.lf-remember { margin: 0 0 var(--sp-4); }
.lf-hint { margin: var(--sp-20) 0 0; font-size: 12px; line-height: 1.6; color: var(--el-text-color-secondary); }

@media (max-width: 720px) {
  .login-card { grid-template-columns: 1fr; }
  .login-brand { display: none; }
}
</style>
