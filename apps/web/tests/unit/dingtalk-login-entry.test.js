import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock('@shared/stores/auth.js', () => ({
  useAuthStore: () => ({ mustChange: false, signin: vi.fn() }),
}));
vi.mock('@shared/api/auth.js', () => ({
  dingtalkConfig: vi.fn(async () => ({
    enabled: true,
    corpId: 'test-corp',
    authorizeUrl: 'https://login.dingtalk.com/oauth2/auth?test=1',
  })),
  dingtalkJsapi: vi.fn(),
  dingtalkBind: vi.fn(),
}));

import { dingtalkConfig } from '@shared/api/auth.js';
import LoginView from '../../src/features/login/LoginView.vue';

function dingButton(w) {
  return w.findAll('button').find((b) => b.text().includes('使用钉钉扫码登录'));
}

// 回归：共享 composable 返回对象中的 ref 必须能在模板里以 dt.xxx 解包。
// 否则 !dt.inDingtalk 恒为 false，PC 端钉钉扫码登录按钮永远不显示。
describe('登录页钉钉 SSO 入口', () => {
  it('后端启用钉钉且非钉钉容器时展示扫码登录按钮', async () => {
    const w = mount(LoginView);
    await flushPromises();
    expect(dingButton(w)).toBeTruthy();
  });

  it('后端未启用钉钉时不展示扫码登录按钮', async () => {
    vi.mocked(dingtalkConfig).mockResolvedValueOnce({ enabled: false });
    const w = mount(LoginView);
    await flushPromises();
    expect(dingButton(w)).toBeUndefined();
  });
});
