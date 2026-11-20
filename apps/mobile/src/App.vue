<script>
import { setLoginRedirector, useAuthStore } from '@shared/stores/auth.js';
import { setUnauthorizedHandler } from '@shared/api/request.js';

export default {
  onLaunch() {
    const auth = useAuthStore();

    // 先注册回调再校验会话：bootstrap 期间若并发请求 401，也有处理器接住。
    setLoginRedirector(() => {
      uni.reLaunch({ url: '/pages/login/index' });
    });
    setUnauthorizedHandler(() => auth.requireLogin());

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
