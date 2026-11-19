import type { Request } from 'express';
import type { AuthService } from '../modules/auth/auth.service';
import type { DataPermService } from '../modules/auth/data-perm.service';
import { extractToken } from './token.util';

/**
 * 请求级鉴权小工具：staff / riders 两个花名册控制器此前各复制一份
 * allowedIds / actor 私有方法，口径必须一致，收敛到这里。
 */

/** 操作者（审计用）：会话用户名；系统/机器令牌场景记 'system'。 */
export function requestActor(auth: AuthService, req: Request): string {
  const s = auth.getSession(extractToken(req));
  return s ? String(s.user || 'unknown') : 'system';
}

/**
 * 本次请求可见的站点 id 集合。
 *  · null = 不受限（管理员/机器令牌），列表不过滤、写操作不校验站点；
 *  · Set  = 仅可见这些站点（team_id 为空 = 总部/不限站点，始终可见）。
 * 与 ProxyController 的 x-scope='*' 同口径。
 */
export function requestAllowedTeamIds(
  auth: AuthService,
  dataPerm: DataPermService,
  req: Request,
): Set<string> | null {
  const s = auth.getSession(extractToken(req));
  if (!s) return null;
  const ids = dataPerm.resolveAllowed(s.user, s.role, 'team');
  return ids === null ? null : new Set([...ids].map(String));
}
