import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';

import '@shared-ui/tokens.css';
import './styles/app.css';

import App from './App.vue';

export function createApp() {
  const app = createSSRApp(App);
  app.use(createPinia());

  // 共享模块里有 Element Plus 的 ElMessage 裸调用（桌面端约定）。
  // uni-app 端提供静默兜底，避免运行时 ReferenceError；后续各端页面改用本端反馈组件。
  window.ElMessage = {
    success: () => {},
    info: () => {},
    warning: () => {},
    error: () => {},
  };
  window.ElNotification = window.ElMessage;

  return { app };
}
