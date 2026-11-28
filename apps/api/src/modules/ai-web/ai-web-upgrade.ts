import * as http from 'http';
import { Duplex } from 'stream';
import { AuthService } from '../auth/auth.service';
import { extractToken } from '../../common/token.util';
import { AiWebProxyService } from './ai-web-proxy.service';

/**
 * WebSocket upgrade 代理：浏览器 /ai/api/remote.mux → DSH 127.0.0.1:3080/api/remote.mux。
 *
 * Express 中间件不处理 upgrade，必须挂在 http.Server 的 'upgrade' 事件上。
 * 会话闸门与 HTTP 代理一致（会话 + task:run），Host/Origin 改写为 loopback。
 */
export function handleAiWebUpgrade(
  req: http.IncomingMessage,
  socket: Duplex,
  head: Buffer,
  auth: AuthService,
  proxy: AiWebProxyService,
): boolean {
  const url = req.url || '/';
  if (url !== '/ai-official' && !url.startsWith('/ai-official/')) return false;

  const deny = (status: number, text: string) => {
    socket.write(
      `HTTP/1.1 ${status} ${status === 401 ? 'Unauthorized' : 'Forbidden'}\r\n` +
      'Content-Type: text/plain; charset=utf-8\r\n' +
      `Content-Length: ${Buffer.byteLength(text)}\r\nConnection: close\r\n\r\n${text}`,
    );
    socket.destroy();
  };

  if (!proxy.isReady) {
    deny(503, 'AI WebUI 尚未就绪');
    return true;
  }
  // upgrade 请求没有 express.Request 的 getter，这里用头部手工构造轻量对象给 extractToken。
  const fakeReq = {
    headers: req.headers,
    path: url.split('?')[0],
    query: Object.fromEntries(new URLSearchParams((url.split('?')[1] || ''))),
  } as Parameters<typeof extractToken>[0];
  const session = auth.getSession(extractToken(fakeReq));
  if (!session) { deny(401, '请先登录'); return true; }
  if (!auth.hasPerm(session.role, 'task:run')) { deny(403, '无权访问 AI 助手'); return true; }

  const target = new URL(url, proxy.upstreamUrl);
  let path = target.pathname.replace(/^\/ai-official\/?/, '');
  if (!path.startsWith('/')) path = '/' + path;
  const outPath = path + (target.search || '');

  const headers: http.OutgoingHttpHeaders = { ...req.headers };
  headers.host = `127.0.0.1:${new URL(proxy.upstreamUrl).port}`;
  if (headers.origin) headers.origin = proxy.upstreamUrl;

  const upstream = http.request({
    hostname: '127.0.0.1',
    port: Number(new URL(proxy.upstreamUrl).port),
    method: req.method,
    path: outPath,
    headers,
  });

  upstream.on('upgrade', (upstreamRes, upstreamSocket, upstreamHead) => {
    let raw =
      `HTTP/1.1 ${upstreamRes.statusCode} ${upstreamRes.statusMessage || ''}\r\n` +
      Object.entries(upstreamRes.headers)
        .filter(([k]) => !['connection', 'transfer-encoding'].includes(k.toLowerCase()))
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
        .join('\r\n') +
      '\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n';
    if (upstreamHead.length) raw += upstreamHead.toString('binary');
    socket.write(raw);
    if (head.length) upstreamSocket.write(head);
    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);
  });

  upstream.on('error', () => { socket.destroy(); });
  upstream.end();
  return true;
}
