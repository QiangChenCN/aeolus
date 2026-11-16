import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PATH_METADATA } from '@nestjs/common/constants';
import { MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import { Type } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../../modules/auth/auth.service';
import { REQUIRE_PERM_KEY } from '../decorators/require-perm.decorator';
import { extractToken } from '../token.util';

/**
 * 统一访问闸门（全局 APP_GUARD）。对应旧 server.py 的「机器令牌闸门 + RBAC 会话鉴权」双闸门：
 *
 *  1) 机器令牌闸门：除认证端点外，所有 /api 必须携带有效 AUTH_TOKEN
 *     （Authorization: Bearer <t> 或 ?token=<t>）。浏览器同源调用由会话令牌代替。
 *  2) RBAC 会话鉴权：权限点只从端点方法上的 @RequirePerm 读取，没有任何映射表或类级兜底。
 *     · perm='view'：需会话拥有 view；无会话的系统/iframe 调用放行。
 *     · perm='self'：仅需有效会话（个人改密等）。
 *     · perm='machine'：仅内部服务（有效机器令牌），会话不算。
 *
 * 启动时 onModuleInit 扫描所有 controller 路由：任何路由的方法上缺少 @RequirePerm，
 * 直接抛错拒绝启动 —— 权限声明与 handler 一一绑定，改路径不会失效，漏声明无法上线。
 *
 * 数据权限（team 维度行级隔离）不在此处裁决，由 DataPermService + ProxyController 在
 * 委托 Python 计算前下发 x-scope（纵深防御：RBAC 管"能不能看"，数据权限管"看哪些"）。
 *
 * 可解释性：每次裁决写入 rbac_audit（action=authz:*），含 required_perm / 命中来源 / 结果；
 * 高频的 view/self 放行不记，只记拒绝与敏感权限放行，避免审计表膨胀。
 */
// 钉钉登录端点同样豁免机器令牌闸门：它们是「无会话建会话」的入口（与 signin 同位），
// 且免登/JSAPI 流程由前端在钉钉内拉起、OAuth 回调由钉钉浏览器跳转，都不可能预先持有机器令牌。
const EXEMPT_MACHINE = new Set([
  '/api/auth/me',
  '/api/auth/signin',
  '/api/auth/logout',
  '/api/auth/dingtalk/jsapi',
  '/api/auth/dingtalk/oauth-callback',
  '/api/auth/dingtalk/bind',
  '/api/auth/dingtalk/config',
  '/health',
  // 前端「服务」胶囊的探测端点：必须无凭证可调（未登录 / 登录页也要能判断后端是否活着），
  // 且它只返回时间戳与 uptime，不含任何业务数据。
  '/api/health',
]);

/**
 * 路径规范化：Guard 的路由→权限表是精确字符串匹配，而 Express/Nest 路由大小写不敏感且
 * 容忍尾斜杠。若直接拿原始 req.url 查表，`/api/admin/user/`、`/API/ADMIN/USER` 都会
 * 落回默认，但 Express 仍会路由到管理员接口 —— 低权限用户可借此提权。
 */
export function normalizeRequestPath(url: string): string {
  let p = (url || '/').split('?')[0];
  try {
    p = decodeURIComponent(p);
  } catch {
    /* 非法百分号编码：保持原样，Express 也不会匹配到合法路由 */
  }
  p = p.replace(/\/{2,}/g, '/').toLowerCase();
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p || '/';
}

@Injectable()
export class AccessGuard implements CanActivate, OnModuleInit {
  constructor(
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
    private readonly modules: ModulesContainer,
  ) {}

  /**
   * 启动自检：所有 Nest 路由必须有显式权限声明（方法级或类级 @RequirePerm）。
   * 这样即使将来有人删掉遗留映射条目，也不会出现「路由存在但没人管权限」的裸奔端点。
   */
  onModuleInit(): void {
    const scanner = new MetadataScanner();
    const missing: string[] = [];
    for (const moduleRef of this.modules.values()) {
      for (const wrapper of moduleRef.controllers.values()) {
        const metatype = wrapper.metatype as Type<unknown> | undefined;
        if (!metatype?.prototype) continue;
        const base = (Reflect.getMetadata(PATH_METADATA, metatype) as string | undefined) ?? '';
        for (const name of scanner.getAllMethodNames(metatype.prototype)) {
          const fn = (metatype.prototype as Record<string, unknown>)[name];
          if (typeof fn !== 'function') continue;
          if (Reflect.getMetadata(PATH_METADATA, fn) === undefined) continue; // 非路由方法
          // 只认方法级声明：类级声明与映射表均已移除，不存在"继承兜底"。
          if (Reflect.getMetadata(REQUIRE_PERM_KEY, fn)) continue;
          const sub = (Reflect.getMetadata(PATH_METADATA, fn) as string | undefined) ?? '';
          missing.push(`${metatype.name}.${name} (/${[base, sub].filter(Boolean).join('/')})`);
        }
      }
    }
    if (missing.length) {
      throw new Error(
        `[权限自检] ${missing.length} 个路由未声明权限，请在 controller 方法上加 @RequirePerm：\n  ` +
          missing.join('\n  '),
      );
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    // 操作日志：先解析「谁在操作」挂到 req.actor，供全局 OperationLogMiddleware 在响应结束时读取
    (req as unknown as { actor?: string }).actor = this.resolveActor(req);
    const path = normalizeRequestPath(req.url || '/');

    // 入口页（HTML + 机器令牌注入）对所有人公开：浏览器首屏 GET / 还没有会话/机器令牌。
    if (path === '/' || path === '/index.html') return true;

    // 认证端点豁免机器令牌闸门
    if (EXEMPT_MACHINE.has(path)) {
      if (path === '/api/auth/logout' && !this.auth.getSession(this.token(req))) {
        throw new UnauthorizedException('not logged in');
      }
      return true;
    }

    // 1) 机器令牌闸门
    if (!this.machineOk(req)) {
      this.decide(req, undefined, 'machine', false, 'invalid or missing machine token');
      throw new UnauthorizedException('invalid or missing token');
    }

    // 2) RBAC 会话鉴权
    const session = this.auth.getSession(this.token(req)) ?? undefined;

    // 初始密码强制修改：must_change 用户除「改密 / 读自身状态 / 登出」外一律拦截。
    if (session && this.auth.getUser(session.user)?.must_change && path !== '/api/account/change-pw') {
      this.decide(req, session, 'self', false, 'must_change: 请先修改初始密码');
      throw new ForbiddenException('请先修改初始密码');
    }

    // 唯一权限来源：handler 上的 @RequirePerm。启动自检已保证其存在；
    // 万一运行时仍缺失，按 admin 拒绝（fail-closed），绝不放行。
    const methodPerm = this.reflector.get<string>(REQUIRE_PERM_KEY, context.getHandler());
    const perm = methodPerm ?? 'admin';
    const source = methodPerm ? 'method:@RequirePerm' : 'default:fail-closed';

    if (perm === 'self') {
      if (!session) {
        this.decide(req, undefined, perm, false, 'self: 未登录');
        throw new UnauthorizedException('not logged in');
      }
      this.decide(req, session, perm, true, source);
      return true;
    }
    if (perm === 'view') {
      // 有会话：按角色判定 view 权限；无会话：说明是持机器令牌的系统/iframe 调用，放行基线 view。
      if (session) {
        const ok = this.auth.hasPerm(session.role, 'view');
        this.decide(req, session, perm, ok, ok ? source : `role 缺少 view；required=${source}`);
        if (!ok) throw new ForbiddenException('permission denied: view');
        return true;
      }
      this.decide(req, undefined, perm, true, source + ' (machine/system caller)');
      return true;
    }
    if (perm === 'machine') {
      // 仅内部服务可调用：必须持有效机器令牌，会话不算。
      const ok = this.machineTokenMatches(req);
      this.decide(req, session, perm, ok, ok ? source : 'machine token required');
      if (!ok) throw new ForbiddenException('machine token required');
      return true;
    }
    if (!session) {
      this.decide(req, undefined, perm, false, `未登录；required=${source}`);
      throw new UnauthorizedException('not logged in');
    }
    const ok = this.auth.hasPerm(session.role, perm);
    this.decide(req, session, perm, ok, ok ? source : `role=${session.role} 未包含 ${perm}；required=${source}`);
    if (!ok) throw new ForbiddenException('permission denied: ' + perm);
    return true;
  }

  /** 写权限决策日志：view/self 的放行不记（高频），其余放行与所有拒绝都记。 */
  private decide(
    req: Request,
    session: { user: string; role: string } | undefined,
    perm: string,
    ok: boolean,
    reason: string,
  ): void {
    // view/self 放行是高频读路径，machine 放行是内部服务高频调用 —— 都不记；
    // 但所有拒绝（含 machine 闸门失败）都必须记，便于发现越权与配置错误。
    if (ok && (perm === 'view' || perm === 'self' || perm === 'machine')) return;
    const user = session?.user || (this.machineOk(req) ? 'machine' : 'anonymous');
    const ip = String(req.headers['x-forwarded-for'] || req.ip || '-').split(',')[0].trim();
    this.auth.auditDecision(
      perm,
      ok,
      reason,
      user,
      ip,
      session?.role || '-',
      req.method || 'GET',
      normalizeRequestPath(req.url || '/'),
    );
  }

  private token(req: Request): string | undefined {
    return extractToken(req);
  }

  /** 请求是否携带有效的机器令牌（仅 Bearer / ?token=，不含会话）。 */
  private machineTokenMatches(req: Request): boolean {
    const expected = this.config.get<string>('AUTH_TOKEN');
    if (!expected) return true; // 未配置机器令牌时不设限（与 machineOk 同口径）
    const auth = req.headers['authorization'] as string | undefined;
    const bearer = auth?.replace(/^Bearer\s+/i, '');
    const q = (req.query as Record<string, unknown>)['token'];
    return bearer === expected || (typeof q === 'string' && q === expected);
  }

  private machineOk(req: Request): boolean {
    const expected = this.config.get<string>('AUTH_TOKEN');
    if (!expected) return true;
    const auth = req.headers['authorization'] as string | undefined;
    const bearer = auth?.replace(/^Bearer\s+/i, '');
    const q = (req.query as Record<string, unknown>)['token'];
    const provided = bearer || (typeof q === 'string' ? q : undefined);
    if (provided === expected) return true;
    // RBAC 重构后浏览器同源调用只带会话令牌（X-Token），不再注入机器令牌。
    // 会话是更强的单用户凭证，已通过鉴权即视为通过机器闸门（外部无会话调用仍需机器令牌）。
    if (this.auth.getSession(this.token(req))) return true;
    return false;
  }

  /** 解析「谁在操作」，结果挂到 req.actor 供全局 OperationLogInterceptor 使用。 */
  private resolveActor(req: Request): string {
    const token = extractToken(req);
    const s = token ? this.auth.getSession(token) : undefined;
    if (s?.user) return s.user;
    if (this.machineOk(req)) return 'machine';
    return 'anonymous';
  }
}
