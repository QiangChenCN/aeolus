import { test, expect } from '@playwright/test';

// 钉钉设置页是「一改就崩且难自测」的典型：藏在登录守卫之后，且承载 SSO / DWS 大量配置项。
// 真实 SSO 需要后端 + 钉钉凭证，这里用 page.route 模拟已登录会话与各接口的 benign 响应，
// 让页面能正常渲染，从而验证「登录守卫放行 + 页面与 SSO 配置表单渲染」这条链路。
test.beforeEach(async ({ page }) => {
  // 已登录会话：守卫据此放行
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: true,
        user: { username: 'admin' },
        role: 'admin',
        name: 'Admin',
        avatar: null,
        phone: null,
        email: null,
      }),
    }),
  );
  // 其余钉钉相关接口返回无害默认值，避免页面报错（不影响关键表单渲染）
  await page.route('**/api/ding/auth/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { authenticated: false, profile: {} } }),
    }),
  );
  await page.route('**/api/ding/config', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { items: [] } }),
    }),
  );
  await page.route('**/api/auth/dingtalk/sso-config', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          enabled: false,
          appKey: '',
          appSecretSet: false,
          corpId: '',
          oauthRedirectUri: '',
          frontendUrl: '',
        },
      }),
    }),
  );
  // 机器人配置接口：供「凭证配置 / 机器人实例」页渲染
  await page.route('**/api/bot/config', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ config: { botEnabled: true } }),
    }),
  );
  await page.route('**/api/bot/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        gatewayConnected: true,
        botEnabled: true,
        detail: '',
        bots: [{ botId: 'std-achievement', displayName: '运力达成查询', type: 'dingtalk', enabled: true, credentialsRef: 'dingtalk:achievement', queryTimeout: 60, aiCardTyping: true }],
        connections: [{ ref: 'dingtalk:achievement', connected: true }],
      }),
    }),
  );
  await page.route('**/api/bot/credentials', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        groups: [{ id: 'dingtalk:achievement', label: '达成查询', type: 'dingtalk', clientId: 'ding123', hasSecret: true, enabled: true }],
      }),
    }),
  );
});

test('已登录可进入系统设置钉钉集成页并渲染 SSO 配置表单', async ({ page }) => {
  await page.goto('/settings/integrations');
  // 守卫放行：停留在三方集成页而非跳登录
  await expect(page).toHaveURL(/\/settings\/integrations$/);

  // 收敛到页面容器 .dt，避免与侧边栏同名菜单项触发严格模式冲突
  const dt = page.locator('.dt');
  await expect(dt).toBeVisible();
  await expect(dt.getByText('钉钉集成')).toBeVisible();

  // SSO 配置卡片（关键配置项：AppKey / AppSecret / OAuth2 回跳地址）
  await expect(dt.getByText('钉钉单点登录', { exact: false })).toBeVisible();
  await expect(dt.getByText('AppKey')).toBeVisible();
  await expect(dt.getByText('OAuth2 回跳地址')).toBeVisible();
});

test('实例页只管参数与连接状态，绑定操作已移到全局配置', async ({ page }) => {
  await page.goto('/bot/instances');
  await expect(page).toHaveURL(/\/bot\/instances$/);

  // 唯一入口在侧栏：页面顶部不再有 Tab 壳（避免与侧栏二级菜单重复）
  await expect(page.locator('.tabshell-menu')).toHaveCount(0);

  const bi = page.locator('.bi');
  await expect(bi).toBeVisible();
  await expect(bi.getByText('实例清单')).toBeVisible();
  await expect(bi.getByText('运行状态')).toHaveCount(0); // 已移到全局配置页
  const table = bi.locator('.el-table');
  await expect(table).toBeVisible();
  await expect(table.getByText('凭据分组')).toBeVisible();
  await expect(table.getByText('查询超时(秒)')).toBeVisible();
  await expect(table.getByText('实例启用', { exact: true })).toBeVisible();
  await expect(table.locator('.el-input-number')).toBeVisible();
  await expect(table.getByText('运行中')).toBeVisible();
  // 内容边界：凭据分组只读（无下拉），绑定在全局配置
  await expect(table.locator('.el-select')).toHaveCount(0);
  await expect(table.getByText('类型', { exact: true })).toHaveCount(0);
});

test('全局配置：整体状态 + 绑定关系一屏总览与组装', async ({ page }) => {
  await page.goto('/bot/assembly');
  await expect(page).toHaveURL(/\/bot\/assembly$/);
  await expect(page.locator('.tabshell-menu')).toHaveCount(0);

  const ba = page.locator('.ba');
  await expect(ba).toBeVisible();
  await expect(ba.getByText('运行状态')).toBeVisible(); // 总开关/重连已移入
  await expect(ba.getByText('机器人总开关')).toBeVisible();
  await expect(ba.getByText('绑定关系总览')).toBeVisible();
  const table = ba.locator('.el-table');
  await expect(table.getByText('绑定凭据分组')).toBeVisible();
  await expect(table.getByText('绑定状态')).toBeVisible();
  await expect(table.locator('.el-select').first()).toBeVisible(); // 组装用绑定下拉
  await expect(ba.getByText('全局配置')).toBeVisible();
});

test('凭证管理页无连接状态列，连接状态只在实例页呈现', async ({ page }) => {
  await page.goto('/bot/credentials');
  await expect(page).toHaveURL(/\/bot\/credentials$/);
  await expect(page.locator('.tabshell-menu')).toHaveCount(0);

  const bc = page.locator('.bc');
  await expect(bc).toBeVisible();
  await expect(bc.getByText('被引用')).toBeVisible();
  await expect(bc.getByText('凭据启用')).toBeVisible();
  await expect(bc.getByText('连接状态', { exact: true })).toHaveCount(0);
});

test('旧机器人地址统一重定向到一级模块', async ({ page }) => {
  await page.goto('/settings/dingtalk/instance');
  await expect(page).toHaveURL(/\/bot\/instances$/);

  await page.goto('/settings/dingtalk/global');
  await expect(page).toHaveURL(/\/bot\/instances$/);

  await page.goto('/settings/dingtalk/robot');
  await expect(page).toHaveURL(/\/bot\/credentials$/);

  await page.goto('/bot/dingtalk');
  await expect(page).toHaveURL(/\/settings\/integrations$/);

  await page.goto('/settings/dingtalk');
  await expect(page).toHaveURL(/\/settings\/integrations$/);
});
