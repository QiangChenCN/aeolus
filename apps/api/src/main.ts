import './instrumentation'; // 必须最先执行：在 NestFactory 之前注册 OTel 插桩（默认关闭，见 instrumentation.ts）
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { existsSync } from 'fs';
import * as path from 'path';
import compression from 'compression';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { normalizeRequestPath } from './common/guards/access.guard';
import { loadAppConfig } from './config/configuration';
import { injectMachineToken, resolveIndexHtml } from './common/serve-html.util';
import { dirs } from './config/paths';
import { AEOLUS_MONOREPO_NAME } from '@aeolus/shared';

// 跨应用共享包（workspace 依赖）冒烟：确认 @aeolus/shared 在 api 侧可被解析与打包
console.log(`[shared] monorepo name = ${AEOLUS_MONOREPO_NAME}`);

/**
 * 请求体上限。
 *
 * Express 默认只有 **100kb**，会把「写原始层」这类大 payload 直接挡掉
 * （实时考勤快照 ≈340KB、违规明细整日数据、排班展平行都在百 KB 级）。
 *
 * 更麻烦的是**症状极具误导性**：body-parser 的 `PayloadTooLargeError`（413）在 Nest 里
 * 最终表现为默认的「未匹配路由」处理，客户端收到的是
 * `404 {"message":"Cannot POST /api/...","code":404}` —— 看起来像「路由没注册」，
 * 实际是「body 超限」。排查时极易走错方向（本次迁移中就踩了一次）。
 * 故显式抬高上限，并把这段原因留在这里。
 */
const BODY_LIMIT = '16mb';

/**
 * 登录端点限流（内存滑动窗口）：无第三方依赖，按 IP + 用户名双维度限制。
 * 只覆盖「无会话建会话」的入口，防止在线爆破；正常业务接口不受影响。
 */
interface AttemptBucket { count: number; resetAt: number }
const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX_PER_IP = 20;
const LOGIN_MAX_PER_USER = 10;
const loginBuckets = new Map<string, AttemptBucket>();

function consumeLoginAttempt(key: string, max: number): boolean {
  const now = Date.now();
  const bucket = loginBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    loginBuckets.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  if (bucket.count >= max) return false;
  bucket.count++;
  return true;
}

const loginBucketSweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, b] of loginBuckets) if (b.resetAt <= now) loginBuckets.delete(key);
}, 5 * 60 * 1000);
loginBucketSweeper.unref?.();

async function bootstrap(): Promise<void> {
  // bodyParser: false —— 必须自己注册：框架默认那对解析器（100kb）会先于下面注册，
  // 大 body 仍然会被它先拒掉，`useBodyParser` 加在默认之后是无效的（顺序即生效顺序）。
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // trust proxy 只信任回环（Nginx 与后端同机），让 req.secure 能识别 X-Forwarded-Proto，
  // 从而给会话 Cookie 正确加上 Secure 标志；不信任外部伪造的转发头。
  // 注意：strict/case-sensitive routing 必须在 express() 创建前设置才生效，Nest 初始化后
  // 再 app.set 已晚（router 已 lazy 创建），因此路径变体改由下面的早期中间件直接拒绝。
  const expressApp = app.getHttpAdapter().getInstance() as express.Express;
  expressApp.set('trust proxy', 'loopback');

  // 响应压缩：前端 bundle / API JSON 经 gzip 传输，显著降低首屏与刷新的传输体积。
  // 跳过 SSE（text/event-stream）实时日志流，避免缓冲破坏逐块推送。
  app.use(
    compression({
      filter: (req, res) => {
        const ct = String(res.getHeader('Content-Type') || '');
        if (ct.includes('text/event-stream')) return false;
        return compression.filter(req, res);
      },
    }),
  );
  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

  // 拒绝 API 路径变体（尾斜杠 / 大小写 / 重复斜杠 / 百分号编码）：
  // Express 路由容忍这些变体，而 Guard 的权限表按规范化路径查表 —— 若放任，二者口径
  // 不一致会让 `/api/admin/user/`、`/API/ADMIN/USER` 以 view 权限命中管理员接口。
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const raw = (req.url || '/').split('?')[0];
    if (raw.startsWith('/api') && raw !== normalizeRequestPath(raw)) {
      res.status(404).json({ code: 404, message: 'Not Found', path: raw });
      return;
    }
    next();
  });

  // 登录限流：放在 Nest 路由之前，命中阈值直接 429，不进入 AuthService（避免 scrypt 开销）。
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.method !== 'POST') return next();
    const p = (req.path || '').toLowerCase().replace(/\/+$/, '');
    if (p !== '/api/auth/signin' && p !== '/api/auth/dingtalk/jsapi') return next();
    const ip = (req.get('x-real-ip') || req.ip || req.socket?.remoteAddress || '-') as string;
    const body = req.body as Record<string, unknown> | undefined;
    const user = String((body && body['username']) || '').slice(0, 128);
    if (!consumeLoginAttempt('ip:' + ip, LOGIN_MAX_PER_IP) ||
        (user && !consumeLoginAttempt('user:' + user.toLowerCase(), LOGIN_MAX_PER_USER))) {
      res.status(429).json({ ok: false, error: '尝试次数过多，请稍后再试' });
      return;
    }
    next();
  });

  const config = loadAppConfig();

  // 移动端软跳转：手机访问站点根路径时 302 到 /m/，让移动用户无需手动记路径前缀。
  // 用 302 而非 301：301 会被浏览器/CDN 强缓存，用户换设备后会被锁死在错误版本。
  // 只处理根路径（不含 /index.html 与深链），深链保持原样以便用户手动分享的链接正常工作。
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const method = (req.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') return next();
    // 只处理根路径；深链保持原样，避免用户分享的链接被改写
    if (req.path !== '/') return next();
    // 根路径按 UA + 视图偏好区分，通知代理/CDN 分开缓存
    res.setHeader('Vary', 'User-Agent, Cookie');
    // 用户主动要求留在桌面端（显式切换入口写入的 cookie），覆盖 UA 误判
    const mode = String(req.headers.cookie || '')
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('wb_view='));
    if (mode === 'wb_view=desktop') return next();
    const ua = String(req.headers['user-agent'] || '');
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    if (!isMobile) return next();
    return res.redirect(302, '/m/');
  });

  // 静态资源托管（替代 @nestjs/serve-static 挂在 `/` 的整站拦截）：
  // serve-static 默认 fallthrough:false，会把 `/api` 的 POST（找不到同名文件）误判成 404，
  // 导致「标准达成刷新」等所有写接口在网关层即 404，永远不出结果。
  // 这里手动挂载 express.static，但凡命中 `/api`（含任意子路径）一律 next() 交给 Nest 路由，
  // 其余路径（前端构建产物）按文件服务，找不到则 fallthrough 到 ServeController（入口页 token 注入）。
  const distDir = dirs.appsWebDist();
  if (existsSync(distDir)) {
    app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      // /api 一律交给 Nest 路由（含 POST 写接口）；入口页 / 与 /index.html 交给
      // ServeController 做 __SERVER_API_TOKEN__ 注入（闭合浏览器→/api 的机器令牌环路）。
      if (
        req.path.startsWith('/api') ||
        req.path === '/' ||
        req.path === '/index.html'
      ) {
        return next();
      }
      return express.static(distDir, {
        fallthrough: true,
        // 带内容 hash 的资源（Vite 产物 assets/ 下）可永久缓存，刷新不再重复下载；
        // 入口页 index.html 不缓存，保证发版即时生效。
        setHeaders: (res, filePath) => {
          const isHashed =
            filePath.includes(path.sep + 'assets' + path.sep) ||
            /-[A-Za-z0-9_]+\.(js|css|woff2?|ttf|png|jpe?g|svg|gif|ico)$/.test(filePath);
          res.setHeader(
            'Cache-Control',
            isHashed ? 'public, max-age=31536000, immutable' : 'no-cache',
          );
        },
      })(req, res, next);
    });
  }

  // SPA 深链接回退（History 模式必需）：前端去掉 hash 后，/tasks、/bot/global 这类前端路由
  // 会直接打到服务器。静态中间件找不到同名文件 → 必须回退到 index.html，否则「刷新页面」或
  // 「直接打开链接」会 404。
  //
  // 为什么做在 Express 中间件层，而不是给 ServeController 加 @Get('*') 通配路由：
  // 通配路由属于 Nest 路由，会被全局 AccessGuard 拦截 —— 冷启动访问深链接时浏览器还没有会话
  // （也没有机器令牌），机器令牌闸门会把它挡成 401，浏览器收到的是 401 JSON 而不是登录页。
  // 动态 API 响应禁缓存：否则浏览器会缓存 grade-global 等 GET 响应（响应还带 ETag），
  // 配置/数据已变仍展示陈旧结果——曾因缓存了一份 configured:false 导致标准达成看板误报「未配置」。
  // 仅对 /api 生效；静态资源（Vite 产物带内容哈希）仍可正常缓存。
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // 做在 Express 层与静态资源同级，在 Nest 路由之前短路返回，不经过守卫。
  if (existsSync(distDir)) {
    // 必须继续交给 Nest 处理的非页面路径（加了通配回退后不能被吞掉）
    const NON_SPA_PATHS = new Set(['/', '/index.html', '/health', '/tokens.css', '/favicon.ico']);
    app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      const m = (req.method || 'GET').toUpperCase();
      if (m !== 'GET' && m !== 'HEAD') return next();
      const p = req.path;
      if (p.startsWith('/api') || NON_SPA_PATHS.has(p)) return next();
      // 只认浏览器导航；XHR/fetch 误命中时不要返回 HTML 页面
      if (!(req.headers.accept || '').includes('text/html')) return next();
      // 带扩展名的按静态资源处理：找不到就让它 404，而不是回退成页面
      if (/\.[A-Za-z0-9]+$/.test(p)) return next();
      const html = resolveIndexHtml(config.projectRoot);
      if (html == null) return next();
      res.type('text/html').send(injectMachineToken(html, config.authToken));
    });
  }

  // 入参校验：白名单 + 自动转换；非法字段直接 400
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // 统一异常结构
  app.useGlobalFilters(new HttpExceptionFilter());

  // SSE / 跨源 iframe：EventSource 无法带自定义头，token 走 ?token= 查询参数
  app.enableCors({ origin: true, credentials: true });

  await app.listen(config.port);
}

void bootstrap();
