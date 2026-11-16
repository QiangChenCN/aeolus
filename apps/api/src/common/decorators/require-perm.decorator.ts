import { SetMetadata } from '@nestjs/common';

/**
 * 路由权限声明（声明式 RBAC 的权威入口）。
 *
 * 用法（必须标在路由方法上，不存在类级/映射表兜底）：
 *   @Get('users')
 *   @RequirePerm('admin:users')
 *   users() { ... }
 *
 * AccessGuard 只读方法上的这份元数据；启动时扫描全部路由，缺声明即拒绝启动。
 * 权限与 handler 一一绑定，改路径不会失效，漏声明无法上线。
 */
export const REQUIRE_PERM_KEY = 'require_perm';

export const RequirePerm = (perm: string) => SetMetadata(REQUIRE_PERM_KEY, perm);
