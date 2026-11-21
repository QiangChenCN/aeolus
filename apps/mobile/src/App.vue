<script>
import { watch } from 'vue';
import { setLoginRedirector, useAuthStore } from '@shared/stores/auth.js';
import { setUnauthorizedHandler } from '@shared/api/request.js';
import { useTaskCenterStore } from './stores/task-center.js';
import { enforceView } from '@shared/utils/view-mode.js';

export default {
  onLaunch() {
    // H5 全局视图守卫：小程序/App 无 window，enforceView 直接返回 false。
    // UA 或手动偏好判到桌面端时 replace 到对应桌面路由，后续初始化不再执行。
    if (enforceView('mobile')) return;

    const auth = useAuthStore();
    const taskCenter = useTaskCenterStore();

    // 先注册回调再校验会话：bootstrap 期间若并发请求 401，也有处理器接住。
    setLoginRedirector(() => {
      uni.reLaunch({ url: '/pages/login/index' });
    });
    setUnauthorizedHandler(() => auth.requireLogin());

    // 登录态就绪后启动任务中心的快照加载与事件流；退出即断开。
    watch(
      () => auth.authenticated,
      (ok) => {
        if (ok) taskCenter.start();
        else taskCenter.stop();
      },
      { immediate: true },
    );

    // uni-app 不等待 onLaunch 返回的 Promise，这里保持同步调用；
    // 首屏竞态由各页面的 <AuthGate> 组件级门控处理，await 在这里没有阻塞意义。
    auth.bootstrap();
  },
};
</script>

<style>
page {
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
  background: #f7f8fa;
  color: #323233;
}
</style>
