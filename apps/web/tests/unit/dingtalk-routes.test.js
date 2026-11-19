import { describe, it, expect } from 'vitest';
import router from '../../src/router/index.js';

// 路由结构回归：三方集成（钉钉授权/SSO/DWS）留在系统设置；机器人一级模块仅含凭证/实例；旧地址全部兼容。
const routeByPath = (p) => router.getRoutes().find((r) => r.path === p);

describe('机器人与三方集成路由结构', () => {
  it('钉钉授权/SSO/DWS 仍在系统设置下（入口名为三方集成）', () => {
    const r = routeByPath('/settings/dingtalk');
    expect(r).toBeTruthy();
    expect(r.name).toBe('dingtalk-settings');
    // 网页标题（meta.title → document.title）改为三方集成，内容标题仍为钉钉集成
    expect(r.meta.title).toBe('三方集成');
    expect(r.meta.kind).toBe('sys-dingtalk');
    expect(r.meta.perm).toBe('admin:bot');
  });

  it('机器人分组为纯分组路由：无 component、无 meta.tabs，避免侧栏与 Tab 双重入口', () => {
    const parent = routeByPath('/bot');
    expect(parent).toBeTruthy();
    expect(parent.component).toBeUndefined();
    expect(parent.meta.tabs).toBeUndefined();
    // 旧路径仅作为兼容重定向保留，不再是机器人模块的页面
    expect(routeByPath('/bot/dingtalk').redirect.name).toBe('dingtalk-settings');
  });

  it('全局配置为第一个子页，也是默认落地页', () => {
    const parent = routeByPath('/bot');
    expect(parent.redirect.name).toBe('bot-assembly');
    const childOrder = router.getRoutes()
      .filter((r) => r.name && r.name.startsWith('bot-') && r.path.startsWith('/bot/'))
      .map((r) => r.path);
    expect(childOrder[0]).toBe('/bot/assembly');
  });

  it('三个子页（全局配置/凭证/实例）均为 admin:bot 保护的 botcfg 页面', () => {
    for (const p of ['/bot/credentials', '/bot/instances', '/bot/assembly']) {
      const r = routeByPath(p);
      expect(r).toBeTruthy();
      expect(r.meta.perm).toBe('admin:bot');
      expect(r.meta.kind).toBe('botcfg');
    }
    expect(routeByPath('/bot/assembly').meta.title).toBe('全局配置');
  });

  it('旧地址重定向到正确归属', () => {
    const cases = [
      ['/settings/dingtalk/auth', 'dingtalk-settings'],
      ['/bot/dingtalk', 'dingtalk-settings'],
      ['/settings/dingtalk/credentials', 'bot-credentials'],
      ['/settings/dingtalk/robot', 'bot-credentials'],
      ['/settings/dingtalk/global', 'bot-instances'],
      ['/settings/dingtalk/instance', 'bot-instances'],
      ['/settings/dingtalk/instances', 'bot-instances'],
      ['/bot/global', 'bot-instances'],
      ['/bot/robot', 'bot-credentials'],
      ['/bot/instance', 'bot-instances'],
    ];
    for (const [path, name] of cases) {
      expect(routeByPath(path).redirect.name, path).toBe(name);
    }
  });
});
