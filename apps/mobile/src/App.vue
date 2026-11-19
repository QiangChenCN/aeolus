<script>
import { setLoginRedirector, useAuthStore } from '@shared/stores/auth.js';
import { setUnauthorizedHandler } from '@shared/api/request.js';

export default {
  onLaunch() {
    const auth = useAuthStore();
    auth.bootstrap();

    setLoginRedirector(() => {
      uni.reLaunch({ url: '/pages/login/index' });
    });
    setUnauthorizedHandler(() => auth.requireLogin());
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
