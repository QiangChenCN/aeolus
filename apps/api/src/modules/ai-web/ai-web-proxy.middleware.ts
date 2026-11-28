import { Request, Response, NextFunction } from 'express';
import * as http from 'http';
import { AuthService } from '../auth/auth.service';
import { extractToken } from '../../common/token.util';
import { AiWebProxyService } from './ai-web-proxy.service';

/**
 * /ai/ → 官方 DSH WebUI 的同域反向代理（Express 中间件，挂在所有 Nest 路由之前）。
 *
 * 与 iframe 无关：浏览器地址栏是 Aeolus 域名 + /ai/，页面由 DSH 官方前端提供。
 *
 * 关键处理：
 * - 会话闸门：无 Aeolus 会话 → 302 /login；无 task:run 权限 → 403。
 * - 免登桥接：首次访问把 DSH 启动 token 追加到 query，由 DSH 自己换签名 cookie。
 * - 前缀剥离：外部 /ai/api/... → 上游 /api/...（DSH 只认 origin-root 路由）。
 * - Host 改写：Host: 127.0.0.1:3080，让 DSH 的 cookie authority 固定为 loopback，
 *   浏览器侧 cookie 由代理把 Path=/ 改成 /ai/，不会污染 Aeolus 根路径。
 * - 响应头：Set-Cookie 改写 Path；Location 里的根路径加回 /ai 前缀；禁缓存。
 */
export function createAiWebProxyMiddleware(
  auth: AuthService,
  proxy: AiWebProxyService,
) {
  return function aiWebProxy(req: Request, res: Response, next: NextFunction): void {
    // 只接管 /ai-official 与 /ai-official/...；/ai 是 Vue iframe 页，不能吞。
    const p = req.path;
    if (p !== '/ai-official' && !p.startsWith('/ai-official/')) return next();

    if (!proxy.isReady) {
      res.status(503).type('text/plain').send('AI WebUI 尚未就绪（DSH 启动失败或 token 未生成）');
      return;
    }

    const session = auth.getSession(extractToken(req));
    if (!session) {
      res.redirect(302, `/login?redirect=${encodeURIComponent(req.originalUrl)}`);
      return;
    }
    if (!auth.hasPerm(session.role, 'task:run')) {
      res.status(403).type('text/plain').send('无权访问 AI 助手（需要 task:run 权限）');
      return;
    }

    const upstream = new URL(req.originalUrl, proxy.upstreamUrl);
    // 剥离挂载前缀：/ai-official → /；/ai-official/foo → /foo
    let target = upstream.pathname.replace(/^\/ai-official\/?/, '');
    if (!target.startsWith('/')) target = '/' + target;

    // 首次访问（或 DSH cookie 缺失）自动带上启动 token 换票。
    // 用 query 中显式标记避免重复注入造成循环：DSH 换票成功后 303 → ./，cookie 已带。
    const hasDshCookie = /(^|;\s*)dsh-auth-/.test(req.headers.cookie || '');
    if (!hasDshCookie && !upstream.searchParams.has('token')) {
      upstream.searchParams.set('token', proxy.launchToken);
    }

    const pathWithQuery = target + (upstream.search || '');
    const headers: http.OutgoingHttpHeaders = { ...req.headers };
    headers.host = `127.0.0.1:${new URL(proxy.upstreamUrl).port}`;
    // DSH 的浏览器信任栅栏按 authority 判定；Host 改写后 origin 也同步，避免 403。
    if (headers.origin) {
      headers.origin = proxy.upstreamUrl;
    }
    delete headers['accept-encoding']; // 禁用上游压缩，避免二次压缩与流式冲突

    const upstreamReq = http.request(
      {
        hostname: '127.0.0.1',
        port: Number(new URL(proxy.upstreamUrl).port),
        method: req.method,
        path: pathWithQuery,
        headers,
      },
      (upstreamRes) => {
        const status = upstreamRes.statusCode || 502;
        res.status(status);

        for (const [name, value] of Object.entries(upstreamRes.headers)) {
          if (value == null) continue;
          if (name.toLowerCase() === 'set-cookie') {
            const list = Array.isArray(value) ? value : [value];
            res.setHeader(
              'Set-Cookie',
              list.map((c) => rewriteCookiePath(c, '/ai-official/')),
            );
            continue;
          }
          if (name.toLowerCase() === 'location' && typeof value === 'string') {
            res.setHeader('Location', rewriteLocation(value));
            continue;
          }
          if (['content-length', 'transfer-encoding', 'connection'].includes(name.toLowerCase())) continue;
          res.setHeader(name, value);
        }
        res.setHeader('Cache-Control', 'no-store');
        upstreamRes.pipe(res);
      },
    );

    upstreamReq.on('error', (e) => {
      if (!res.headersSent) {
        res.status(502).type('text/plain').send(`AI WebUI 上游不可用：${e.message}`);
      } else {
        res.end();
      }
    });

    // bodyParser 已消费 body 并放在 req.body；上游写请求（POST /api/...）需要重新序列化。
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const body = req.body;
      const raw = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
      if (raw) {
        headers['content-length'] = Buffer.byteLength(raw);
        if (!headers['content-type']) headers['content-type'] = 'application/json';
      }
      upstreamReq.end(raw);
    } else {
      upstreamReq.end();
    }
  };
}

function rewriteCookiePath(cookie: string, mount: string): string {
  // 只改 Path=/（含 "Path=/;" 或结尾 "Path=/"），不动其它属性。
  return cookie.replace(/Path=\/(;|$)/i, `Path=${mount}$1`);
}

function rewriteLocation(loc: string): string {
  // DSH 换票后返回 `./`；相对地址交给浏览器按当前 /ai-official/ 解析即可，无需改写。
  // 绝对根路径（如 /api/...）加回挂载前缀。
  if (loc.startsWith('/') && !loc.startsWith('//')) return '/ai-official' + loc;
  return loc;
}
