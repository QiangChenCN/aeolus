import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { dirs, ROOT } from '../../config/paths';

/**
 * 官方 DSH WebUI 的同域反向代理宿主。
 *
 * 职责：
 * 1. 托管 `dsh web` 子进程（用 Python venv 自带 dsh，不依赖系统 Node 版本），
 *    从 stdout 捕获「进程启动 token」，供 Aeolus 会话桥接时自动换票。
 * 2. 维护代理所需状态：上游地址、token、就绪状态。HTTP/WS 转发由 main.ts 的
 *    Express 中间件与 upgrade 处理器完成（见 ai-web-proxy.middleware.ts）。
 *
 * 安全：
 * - DSH 只监听 loopback，不对外暴露；浏览器只能经 Aeolus 8787 代理访问。
 * - 启动 token 写入 runtime/.dsh-web-token（0600），仅后端可读。
 * - 代理把 Host 改写为 127.0.0.1:3080，让 DSH 的 cookie 签名 authority 固定为
 *   loopback，与外部域名解耦；cookie 的 Path 由代理改写为 /ai/。
 */
@Injectable()
export class AiWebProxyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiWebProxyService.name);
  private child: ChildProcess | null = null;
  private token = '';
  private ready = false;
  private stopped = false;
  private readonly port = 3080;
  private readonly upstream = `http://127.0.0.1:${this.port}`;
  private readonly home = path.join(dirs.runtime(), 'dsh-web-home');
  private readonly workspace = path.join(dirs.runtime(), 'dsh-web-workspace');
  private readonly tokenFile = path.join(dirs.runtime(), '.dsh-web-token');
  private readonly dshBin: string;

  constructor(private readonly config: ConfigService) {
    const venvBin = path.join(ROOT, 'services', 'compute', '.venv', 'bin', 'dsh');
    this.dshBin = this.config.get<string>('DSH_WEB_BIN') || venvBin;
  }

  get upstreamUrl(): string { return this.upstream; }
  get launchToken(): string { return this.token; }
  get isReady(): boolean { return this.ready && !!this.token; }

  onModuleInit(): void {
    if (this.config.get<string>('AI_WEB_ENABLED', 'true') === 'false') {
      this.logger.log('AI WebUI 代理已禁用（AI_WEB_ENABLED=false）');
      return;
    }
    fs.mkdirSync(this.home, { recursive: true });
    fs.mkdirSync(this.workspace, { recursive: true });
    this.spawn();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.child && !this.child.killed) {
      try { this.child.kill('SIGTERM'); } catch { /* ignore */ }
      this.child = null;
    }
  }

  private spawn(): void {
    if (!fs.existsSync(this.dshBin)) {
      this.logger.warn(`DSH 可执行文件不存在：${this.dshBin}（请先 uv sync）`);
      return;
    }
    const venvBin = path.dirname(this.dshBin);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      // 插件管理器会 spawn `dsh` 子进程；venv/bin 不在 PATH 时会报 spawn dsh ENOENT。
      PATH: `${venvBin}${path.delimiter}${process.env.PATH || ''}`,
      DSH_HOME: this.home,
      // WebUI 内可再配模型；这里预填 API Key 让页面开箱可用（密钥只进子进程环境）。
      DEEPSEEK_API_KEY:
        process.env.DEEPSEEK_API_KEY ||
        this.readSavedApiKey() ||
        '',
    };
    this.logger.log(`启动 DSH WebUI：${this.dshBin} web --port ${this.port}（home=${this.home}）`);
    const child = spawn(this.dshBin, ['web', '--no-open', '--host', '127.0.0.1', '--port', String(this.port)], {
      cwd: this.workspace,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;

    const scan = (chunk: Buffer | string) => {
      const text = String(chunk);
      // 官方输出：`dsh web: http://127.0.0.1:3080/?token=XXXX`
      const m = text.match(/dsh web:\s*http:\/\/127\.0\.0\.1:\d+\/\?token=([A-Za-z0-9_-]+)/);
      if (m && m[1] && !this.token) {
        this.token = m[1];
        try {
          fs.writeFileSync(this.tokenFile, this.token, { encoding: 'utf-8', mode: 0o600 });
          fs.chmodSync(this.tokenFile, 0o600);
        } catch (e) {
          this.logger.warn(`启动 token 落盘失败：${(e as Error).message}`);
        }
        this.ready = true;
        this.logger.log('DSH WebUI 已就绪，启动 token 已捕获');
      }
    };
    child.stdout?.on('data', scan);
    child.stderr?.on('data', (b: Buffer) => {
      const s = String(b).trim();
      if (s) this.logger.warn(`[dsh] ${s.slice(0, 500)}`);
    });
    child.on('error', (e) => {
      this.ready = false;
      this.logger.error(`DSH WebUI 启动失败：${e.message}`);
    });
    child.on('exit', (code, signal) => {
      this.ready = false;
      if (this.stopped) return;
      this.logger.warn(`DSH WebUI 退出（code=${code}, signal=${signal}），5 秒后重启`);
      setTimeout(() => { if (!this.stopped) this.spawn(); }, 5000).unref();
    });
  }

  private readSavedApiKey(): string {
    try {
      const f = path.join(dirs.runtime(), '.ai_settings.json');
      const s = JSON.parse(fs.readFileSync(f, 'utf-8'));
      return typeof s.apiKey === 'string' ? s.apiKey : '';
    } catch {
      return '';
    }
  }
}
