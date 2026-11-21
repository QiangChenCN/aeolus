import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * dws CLI 配置项元数据（来自 `dws config list`，共 32 项，分 8 类）。
 * dws 没有 `config set` 命令，本服务以 `~/.dws/dws.env` 持久化用户覆盖项，
 * 并在每次 spawn dws 时注入到进程 env，从而覆盖 dws 内置默认值。
 * `sensitive` 为 true 的项在前端用密码框且不回显明文。
 */
const DWS_CONFIG_META: {
  category: string;
  key: string;
  description: string;
  default: string;
  sensitive: boolean;
}[] = [
  { category: 'core', key: 'DWS_CONFIG_DIR', description: '覆盖默认配置目录 (~/.dws)', default: '~/.dws', sensitive: false },
  { category: 'core', key: 'DWS_LANG', description: '界面语言 (en/zh)，回退到 LANG', default: 'zh', sensitive: false },
  { category: 'auth', key: 'DWS_CLIENT_ID', description: 'OAuth AppKey (DingTalk 应用凭证)', default: '(内置)', sensitive: false },
  { category: 'auth', key: 'DWS_CLIENT_SECRET', description: 'OAuth AppSecret (DingTalk 应用凭证)', default: '(内置)', sensitive: true },
  { category: 'network', key: 'DWS_SKILL_API_HOST', description: '覆盖 Skill API 地址', default: 'https://mcp.dingtalk.com', sensitive: false },
  { category: 'network', key: 'DWS_TRUSTED_DOMAINS', description: '信任的 HTTPS 域名白名单 (逗号分隔，* 信任所有)', default: '*.dingtalk.com,*.dingtalk.io', sensitive: false },
  { category: 'network', key: 'DWS_UPGRADE_REPOSITORY', description: '覆盖升级使用的 GitHub 仓库 owner/repo (测试/灰度)', default: 'DingTalk-Real-AI/dingtalk-workspace-cli', sensitive: false },
  { category: 'network', key: 'DWS_UPGRADE_URL', description: '覆盖 GitHub API 地址 (镜像/测试)', default: 'https://api.github.com', sensitive: false },
  { category: 'security', key: 'DWS_ALLOW_HTTP_ENDPOINTS', description: '允许非 HTTPS 的 MCP 端点 (仅限 loopback)', default: '(禁用)', sensitive: false },
  { category: 'audit', key: 'DWS_AUDIT', description: '操作审计日志开关（默认启用，设 0/false/off 关闭）', default: '启用', sensitive: false },
  { category: 'audit', key: 'DWS_AUDIT_DEBUG', description: '打印审计子系统初始化/写入/转发失败诊断到 stderr（设 1/true/on 开启）', default: '(空)', sensitive: false },
  { category: 'audit', key: 'DWS_AUDIT_DIR', description: '审计日志目录（默认 <configDir>/audit）', default: '(空)', sensitive: false },
  { category: 'audit', key: 'DWS_AUDIT_FORWARD_REDACT', description: '远端转发脱敏级别：none / hashed / minimal', default: 'none', sensitive: false },
  { category: 'audit', key: 'DWS_AUDIT_FORWARD_TOKEN', description: '远端转发 Bearer Token', default: '(空)', sensitive: true },
  { category: 'audit', key: 'DWS_AUDIT_FORWARD_URL', description: '审计事件远端转发 URL（POST JSON）', default: '(空)', sensitive: false },
  { category: 'audit', key: 'DWS_AUDIT_RETENTION_DAYS', description: '审计日志留存天数', default: '90', sensitive: false },
  { category: 'runtime', key: 'DWS_RUNTIME_CONTENT_SCAN', description: '启用 MCP 响应内容安全扫描', default: '(空)', sensitive: false },
  { category: 'runtime', key: 'DWS_RUNTIME_CONTENT_SCAN_ENFORCE', description: '内容安全扫描发现问题时阻断响应', default: '(空)', sensitive: false },
  { category: 'runtime', key: 'DWS_RUNTIME_CONTENT_SCAN_REPORT', description: '在 JSON 输出中包含安全扫描报告', default: '(空)', sensitive: false },
  { category: 'debug', key: 'DWS_PERF_DEBUG', description: '启用性能计时输出到 stderr', default: '(空)', sensitive: false },
  { category: 'debug', key: 'DWS_PERF_REPORT', description: 'JSON 性能报告输出路径 (auto=~/.dws/perf/latest.json)', default: '(空)', sensitive: false },
  { category: 'external', key: 'DINGTALK_AGENT', description: '业务 Agent 名称；仅用于 x-dingtalk-agent 请求头，与 claw-type/host-owned PAT 判定无关', default: '(空)', sensitive: false },
  { category: 'external', key: 'DINGTALK_MESSAGE_ID', description: 'MCP 请求 x-dingtalk-message-id 头', default: '(空)', sensitive: false },
  { category: 'external', key: 'DINGTALK_SESSION_ID', description: 'MCP 请求 x-dingtalk-session-id 头', default: '(空)', sensitive: false },
  { category: 'external', key: 'DINGTALK_TRACE_ID', description: 'MCP 请求 x-dingtalk-trace-id 头', default: '(空)', sensitive: false },
  { category: 'external', key: 'DWS_AGENT_EXT', description: '调用 DWS 的 Agent 扩展上下文 JSON；仅作为 x-dws-agent-ext 透传到非插件 MCP 请求', default: '(空)', sensitive: false },
  { category: 'external', key: 'DWS_AGENT_HOST', description: '调用 DWS 的 Agent 运行形态标识；作为 x-dws-agent-host 发送供下游观测，本客户端不使用该值改变 PAT、鉴权或路由', default: '(空)', sensitive: false },
  { category: 'external', key: 'DWS_AGENT_PRODUCT', description: '调用方声明的 Agent 产品标识；作为 x-dws-agent-product 发送并用于 IM 小尾巴，本客户端不使用该值改变 HTTP claw-type/PAT', default: '未设置（请求头省略，IM 使用当前发行版默认值）', sensitive: false },
  { category: 'external', key: 'DWS_AGENT_VER', description: '调用 DWS 的 Agent 版本；仅作为 x-dws-agent-ver 透传到非插件 MCP 请求', default: '(空)', sensitive: false },
  { category: 'external', key: 'DWS_CHANNEL', description: '第三方渠道编码 (channelCode)，如 Qoderwork', default: '(空)', sensitive: false },
  { category: 'external', key: 'GH_TOKEN', description: 'GitHub API Token 备选 (GITHUB_TOKEN 为空时使用)', default: '(空)', sensitive: true },
  { category: 'external', key: 'GITHUB_TOKEN', description: 'GitHub API Token (提升 API 限额)', default: '(空)', sensitive: true },
];

/** dws 配置分类的中文标题。 */
export const DWS_CONFIG_CATEGORIES: Record<string, string> = {
  core: '核心',
  auth: '认证',
  network: '网络',
  security: '安全',
  audit: '审计',
  runtime: '运行时',
  debug: '调试',
  external: '外部透传',
};

/**
 * 钉钉能力服务 —— 基于官方 dws CLI（Apache-2.0，Go 实现）。
 *
 * 集成方式说明（重要）：dws **只提供 CLI，没有 SDK**。官方用法就是命令行 +
 * `--format json`（结构化输出）+ `--yes`（跳过确认）+ `--dry-run`（预览不执行）。
 * npm 包 dingtalk-workspace-cli 只是二进制安装器。因此"从 Node 起 CLI"是官方路径，
 * 不是绕路 —— 但**不复制 Python 那套**（Python 自己拼 `node dws.js` 路径、手工解 JSON、
 * 把原始 args 当接口传）。这里一律收敛成类型化方法。
 *
 * 凭证由 dws 自己持有并按需自动刷新（OAuth 设备流 / 自建应用），本服务不接触 token；
 * dws 自带进程内 + 跨进程双层锁，并发调用安全。
 */
export interface DwsOpts {
  profile?: string;
  timeout?: number;
  dryRun?: boolean;
  yes?: boolean;
  /** 显式 false 时给发送消息命令加 --ai-tag=false（去掉「通过AI发送」角标）。 */
  aiTag?: boolean;
}

/** 发消息相关设置（WebUI 维护，落盘 runtime）。 */
export interface DingSendSettings {
  aiTag: boolean;
}

/** dws 升级任务的详细进度（内存态，前端轮询）。 */
export interface UpgradeProgress {
  running: boolean;
  phase: 'idle' | 'checking' | 'backup' | 'download' | 'verify' | 'extract' | 'install' | 'done' | 'error';
  detail: string;
  /** 0-100；-1 表示拿不到总量、只能看阶段文案。 */
  percent: number;
  targetVersion: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

export interface DingGroup {
  openConversationId: string;
  title: string;
  score?: number;
}

@Injectable()
export class DingtalkService {
  private readonly logger = new Logger(DingtalkService.name);

  constructor(private readonly config: ConfigService) {
    const root = path.resolve(
      this.config.get<string>('PROJECT_ROOT') || path.resolve(process.cwd(), '..'),
    );
    this.sendSettingsFile = path.join(root, 'apps', 'api', 'runtime', 'dingtalk_send_settings.json');
  }

  // ---------------------------------------------------------- 命令解析
  /**
   * dws 可执行命令候选（按优先级）。官方推荐 `npm i -g dingtalk-workspace-cli`
   * 让 dws 进 PATH，故 PATH 优先；未安装时回退显式配置。
   */
  private candidates(): string[][] {
    const list: string[][] = [['dws']];
    const bin = (this.config.get<string>('DING_DWS_BIN') || '').trim();
    if (bin && fs.existsSync(bin)) list.push([bin]);
    const js = (this.config.get<string>('DING_DWS_JS') || '').trim();
    if (js && fs.existsSync(js)) list.push([process.execPath, js]);
    return list;
  }

  // dws 安装位置（nvm 下的 node bin）；spawn 时显式补进 PATH，避免 Nest 进程 PATH 不含 dws。
  private readonly dwsPath = '/home/chenqiang/.nvm/versions/node/v24.21.0/bin';

  /** 用户级 dws 配置覆盖（KEY=VALUE），spawn 时注入 env 覆盖 dws 内置默认。 */
  private readonly configEnvPath = path.join(os.homedir(), '.dws', 'dws.env');
  private configCache: Record<string, string> | null = null;

  /** 发消息设置（AI 角标开关）落盘路径，运行时产物，gitignored。 */
  private readonly sendSettingsFile: string;

  private loginChild?: ChildProcess;
  private loginInfo?: { userCode: string; verificationUri: string; expiresInSeconds: number };
  /** 升级任务进度（进程内状态，前端轮询；重复点击直接返回当前进度）。 */
  private upgradeProgress: UpgradeProgress = {
    running: false, phase: 'idle', detail: '', percent: 0,
    targetVersion: null, startedAt: null, finishedAt: null, error: null,
  };
  private upgradePoll?: ReturnType<typeof setInterval>;

  /**
   * 发起钉钉设备流登录（OAuth Device Flow，适合无头/远程环境）。
   * 捕获 dws 首段输出拿到 userCode + verificationUri 返回前端展示；dws 进程在后台持续
   * 轮询，用户授权完成后自动退出并保存凭证。重复调用（进行中）返回已有授权码。
   */
  async deviceLogin(): Promise<{
    userCode: string;
    verificationUri: string;
    expiresInSeconds: number;
  }> {
    if (this.loginChild && !this.loginChild.killed && this.loginInfo) {
      return { ...this.loginInfo };
    }
    const env = this.dwsEnv();
    const bin = this.candidates()[0];
    return new Promise((resolve, reject) => {
      const child = spawn(bin[0], ['auth', 'login', '--device'], { windowsHide: true, env });
      this.loginChild = child;
      let buf = '';
      let settled = false;
      const finish = (err?: Error, val?: unknown) => {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve(val as { userCode: string; verificationUri: string; expiresInSeconds: number });
      };
      const tryParse = () => {
        // 与 dws 输出语言无关：设备码恒为「XXXX-XXXX」格式，验证链接恒含 device/verify，
        // 过期秒数无论是中文「N 秒后过期」还是英文「expire in N」都能抓到。
        const code =
          buf.match(/([A-Z0-9]{4}-[A-Z0-9]{4})/i) ||
          buf.match(/user_code=([A-Za-z0-9-]+)/i);
        const url = buf.match(/(https?:\/\/\S*device\/verify\S*)/i);
        const exp =
          buf.match(/(\d+)\s*秒后过期/) || buf.match(/expir\w*\D*(\d+)/i);
        if (code && url) {
          const info = {
            userCode: code[1],
            verificationUri: url[1],
            expiresInSeconds: exp ? Number(exp[1]) : 900,
          };
          this.loginInfo = info;
          finish(undefined, info);
        }
      };
      child.stdout?.on('data', (d) => {
        buf += String(d);
        tryParse();
      });
      child.stderr?.on('data', (d) => {
        buf += String(d);
        tryParse();
      });
      child.on('error', (e: NodeJS.ErrnoException) => {
        finish(
          new Error(
            e.code === 'ENOENT' ? '未找到 dws，请先安装 dingtalk-workspace-cli' : e.message,
          ),
        );
      });
      child.on('close', () => {
        this.loginChild = undefined;
        this.loginInfo = undefined;
      });
      setTimeout(() => finish(new Error('dws 未在预期时间内输出设备授权码')), 15000);
    });
  }

  /** 查询钉钉登录状态（是否已授权）。 */
  async authStatus(): Promise<{ authenticated: boolean; profile?: Record<string, any> }> {
    const env = this.dwsEnv();
    const bin = this.candidates()[0];
    return new Promise((resolve) => {
      const child = spawn(bin[0], ['auth', 'status', '--format', 'json'], {
        windowsHide: true,
        env,
      });
      let out = '';
      let err = '';
      child.stdout?.on('data', (d) => (out += String(d)));
      child.stderr?.on('data', (d) => (err += String(d)));
      child.on('error', (e: NodeJS.ErrnoException) =>
        resolve({
          authenticated: false,
          profile: { error: e.code === 'ENOENT' ? 'dws 未安装' : e.message },
        }),
      );
      child.on('close', () => {
        try {
          const j = JSON.parse((out || '').trim() || '{}');
          resolve({ authenticated: !!j.authenticated, profile: j });
        } catch {
          resolve({ authenticated: false, profile: { raw: (out + err).slice(0, 200) } });
        }
      });
    });
  }

  /** 退出钉钉登录（清除本机登录态），供前端「退出登录」触发重新授权。 */
  async authLogout(): Promise<Record<string, any>> {
    const env = this.dwsEnv();
    const bin = this.candidates()[0];
    return new Promise((resolve) => {
      const child = spawn(bin[0], ['auth', 'logout', '-y', '--format', 'json'], {
        windowsHide: true,
        env,
      });
      let out = '';
      let err = '';
      child.stdout?.on('data', (d) => (out += String(d)));
      child.stderr?.on('data', (d) => (err += String(d)));
      child.on('error', (e: NodeJS.ErrnoException) =>
        resolve({ success: false, error: e.code === 'ENOENT' ? 'dws 未安装' : e.message }),
      );
      child.on('close', () => {
        try {
          const j = JSON.parse((out || '').trim() || '{}');
          resolve(j);
        } catch {
          resolve({ success: !err, raw: (out + err).slice(0, 200) });
        }
      });
    });
  }

  private spawnOnce(
    cmd: string[],
    args: string[],
  ): Promise<{ code: number; stdout: string; stderr: string; enoent: boolean }> {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let enoent = false;
      let child;
      try {
        const env = this.dwsEnv();
        child = spawn(cmd[0], cmd.slice(1).concat(args), { windowsHide: true, env });
      } catch (e) {
        resolve({ code: -1, stdout, stderr: String(e), enoent: true });
        return;
      }
      child.stdout?.on('data', (d) => (stdout += String(d)));
      child.stderr?.on('data', (d) => (stderr += String(d)));
      child.on('error', (e: NodeJS.ErrnoException) => {
        enoent = e?.code === 'ENOENT';
        resolve({ code: -1, stdout, stderr: String(e?.message || e), enoent });
      });
      child.on('close', (code) =>
        resolve({ code: code ?? -1, stdout, stderr, enoent }),
      );
    });
  }

  /** 执行 dws 并解析 JSON 输出。 */
  private async run(args: string[], opts: DwsOpts = {}): Promise<Record<string, any>> {
    const full = args.slice();
    const profile = opts.profile ?? this.config.get<string>('DING_PROFILE');
    if (profile) full.push('--profile', String(profile));
    const timeout = opts.timeout ?? Number(this.config.get<string>('DING_TIMEOUT') || 0);
    if (timeout > 0) full.push('--timeout', String(timeout));
    if (opts.yes) full.push('--yes');
    if (opts.dryRun) full.push('--dry-run');
    if (opts.aiTag === false) full.push('--ai-tag=false');
    full.push('--format', 'json');

    const cands = this.candidates();
    let lastErr = '';
    for (const cmd of cands) {
      const r = await this.spawnOnce(cmd, full);
      if (r.enoent) {
        lastErr = r.stderr;
        continue;
      }
      if (r.code !== 0) {
        throw new Error(this.humanize(r.stdout, r.stderr, r.code));
      }
      const out = (r.stdout || '').trim();
      try {
        return JSON.parse(out);
      } catch {
        throw new Error('dws 返回非 JSON: ' + out.slice(0, 600));
      }
    }
    throw new Error(
      `未找到可执行的 dws（已尝试 ${cands.length} 个候选）。` +
        `官方安装：npm install -g dingtalk-workspace-cli；或配置 DING_DWS_BIN。${lastErr}`,
    );
  }

  /** 把 dws 的晦涩报错翻成人话（沿用既有排障经验）。 */
  private humanize(stdout: string, stderr: string, code: number): string {
    const all = `${stdout || ''}${stderr || ''}`;
    if (all.includes('can not find file by url')) {
      return (
        '在线表打不开：地址填错，或该表已被删除 / 当前账号无访问权限。' +
        '修法：打开钉钉在线表，复制浏览器地址栏整条链接填到任务配置的「文档地址」'
      );
    }
    return `dws 退出码 ${code}: ${(stdout || '').slice(0, 300)} | ${(stderr || '').slice(0, 300)}`;
  }

  // ---------------------------------------------------------- 群
  /** 兼容 +chat-search（result.groups）与 +chat-list-all（顶层 groups）。 */
  private resultBlock(payload: Record<string, any>): Record<string, any> {
    if (payload?.result && typeof payload.result === 'object') return payload.result;
    if (payload && typeof payload === 'object') return payload;
    return {};
  }

  /**
   * 分页拉全：chat-list-all / chat-search 都是游标分页，只取首页会漏群
   * （实测首页 25 个、全量 46 个），漏群会导致按群名解析失败或发错群。
   */
  private async pageAllGroups(args: string[]): Promise<Record<string, any>[]> {
    const out: Record<string, any>[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 50; guard++) {
      const a = args.slice();
      if (cursor) a.push('--cursor', cursor);
      const blk = this.resultBlock(await this.run(a));
      for (const g of (blk.groups as Record<string, any>[]) || []) {
        if (!g.title) g.title = g.name || '';
        out.push(g);
      }
      // nextCursor 可能是数字（如 1764770547970），只认字符串会漏掉后续页
      const next = blk.nextCursor ?? blk.cursor;
      cursor = next ? String(next) : null;
      if (!blk.hasMore || !cursor) break;
    }
    return out;
  }

  private toGroups(rows: Record<string, any>[]): DingGroup[] {
    return rows
      .filter((g) => g.openConversationId)
      .map((g) => ({
        openConversationId: String(g.openConversationId),
        title: String(g.title || ''),
      }));
  }

  async listGroups(): Promise<DingGroup[]> {
    return this.toGroups(await this.pageAllGroups(['chat', '+chat-list-all']));
  }

  async searchGroups(query: string, limit = 20): Promise<DingGroup[]> {
    return this.toGroups(
      await this.pageAllGroups(['chat', '+chat-search', '--query', query, '--limit', String(limit)]),
    );
  }

  async getGroupByNumber(num: number | string): Promise<DingGroup | null> {
    const p = await this.run(['chat', '+chat-get-by-id', '--group-id', String(num)]);
    const info = (p?.result || {}).groupInfo || {};
    if (!info || !info.openConversationId) return null;
    return {
      openConversationId: String(info.openConversationId),
      title: String(info.title || ''),
    };
  }

  /**
   * 列出群成员（仅真人），返回 [{name, openDingTalkId}]。
   * 「按姓名自动解析 openDingTalkId」的备用来源（通讯录搜索不可用时的兜底）。
   */
  async listMembers(group: string): Promise<{ name: string; openDingTalkId: string }[]> {
    if (!group) throw new Error('缺少 group（群名或 openConversationId）');
    const p = await this.run([
      'chat', '+chat-members-list', '--group', group, '--member-types', 'user',
    ]);
    const rows = (p?.users as Record<string, any>[]) || [];
    return rows
      .filter((u) => u.openDingtalkId)
      .map((u) => ({
        name: String(u.memberEmpName || u.memberNick || u.name || u.nick || '').trim(),
        openDingTalkId: String(u.openDingtalkId),
      }))
      .filter((u) => u.name);
  }

  /**
   * 按姓名在通讯录搜索用户，返回候选 [{name, openDingTalkId, userId}]。
   * 主解析来源：`contact +search-user` 直接返回 openDingTalkId，不依赖群/好友关系，
   * 企业通讯录范围内即可查（实测与内置 ID 完全一致）。userId 供同名歧义时与
   * 手机号反查结果（+by-mobile 的 orgUserId）比对定位唯一候选人。
   */
  async searchUserByName(name: string): Promise<{ name: string; openDingTalkId?: string; userId?: string }[]> {
    if (!name) return [];
    const p = await this.run(['contact', '+search-user', '--query', name]);
    const rows = (p?.data?.users as Record<string, any>[]) || (p?.users as Record<string, any>[]) || [];
    return rows
      .map((u) => ({
        name: String(u.name || '').trim(),
        openDingTalkId: u.openDingTalkId ? String(u.openDingTalkId) : undefined,
        userId: u.userId ? String(u.userId) : undefined,
      }))
      .filter((u) => u.name);
  }

  /** 手机号 → userId（`contact +by-mobile` 的 orgUserId），用于同名歧义时唯一定位。 */
  async searchUserIdByMobile(mobile: string): Promise<string | undefined> {
    if (!mobile) return undefined;
    const p = await this.run(['contact', '+by-mobile', '--mobile', mobile]);
    const prof = (p?.data?.profile as Record<string, any>) || {};
    if (prof.orgUserId) return String(prof.orgUserId);
    if (prof.userId) return String(prof.userId);
    return undefined;
  }

  /** 隐藏群号（chat-list-all 会漏的群），数据放在 common/groups.json。 */
  private knownGroupNumbers(): number[] {
    const root = this.config.get<string>('PROJECT_ROOT') || path.resolve(process.cwd(), '..');
    const f = path.join(root, 'common', 'groups.json');
    try {
      if (!fs.existsSync(f)) return [];
      const cfg = JSON.parse(fs.readFileSync(f, 'utf-8'));
      return (cfg?.known_group_numbers || []).map((n: any) => Number(n));
    } catch {
      return [];
    }
  }

  /** 纯字符匹配度 0~100（与既有 find_group 口径一致：不归一化、不去 emoji/空白）。 */
  private scoreMatch(q: string, t: string): number {
    if (!q || !t) return 0;
    if (q === t) return 100;
    // 查询词是群名的子串 → 满分（如「站点」⊆「站点日常管理通知群」）
    if (t.includes(q)) return 100;
    // 群名是查询词的子串 → 按长度比例给分，明显低于精确相等（如「测试」⊆「机器人测试」）
    if (q.includes(t)) return Math.floor((100 * t.length) / q.length);
    const qs = new Set(q);
    const ts = new Set(t);
    let inter = 0;
    qs.forEach((c) => ts.has(c) && inter++);
    if (!inter) return 0;
    const union = new Set([...qs, ...ts]).size;
    return Math.floor((100 * inter) / union);
  }

  /**
   * 按群名解析 openConversationId（不写死任何 ID）。
   * 候选池 = 全量群列表 ∪ 搜索结果 ∪ 已知群号；按匹配度打分，避免发错群。
   */
  async resolveGroup(name: string, opts: { exact?: boolean } = {}): Promise<DingGroup> {
    const q = (name || '').trim();
    if (!q) throw new Error('群名不能为空');

    const pool = new Map<string, DingGroup>();
    for (const g of await this.listGroups()) pool.set(g.openConversationId, g);
    try {
      for (const g of await this.searchGroups(q)) {
        if (!pool.has(g.openConversationId)) pool.set(g.openConversationId, g);
      }
    } catch {
      /* 搜索失败不致命：已有全量列表 */
    }
    for (const n of this.knownGroupNumbers()) {
      try {
        const g = await this.getGroupByNumber(n);
        if (g && !pool.has(g.openConversationId)) pool.set(g.openConversationId, g);
      } catch {
        /* 单个群号解析失败不影响整体 */
      }
    }

    const scored: { s: number; g: DingGroup }[] = [];
    for (const g of pool.values()) {
      if (!g.title) continue;
      const s = this.scoreMatch(q, g.title);
      if (s >= 60) scored.push({ s, g });
    }
    if (!scored.length) {
      throw new Error(`未找到与「${q}」匹配的群（共 ${pool.size} 个候选）`);
    }
    scored.sort((a, b) => b.s - a.s);
    const best = scored[0];
    const second = scored[1]?.s ?? 0;
    // 唯一满分，或明显领先第二名才自动返回；否则拒绝，避免发错群
    if (best.s === 100 && (scored.filter((x) => x.s === 100).length === 1 || second < 100)) {
      return { ...best.g, score: best.s };
    }
    if (best.s >= 70 && best.s - second >= 20) return { ...best.g, score: best.s };
    const cand = scored.slice(0, 5).map((x) => `${x.g.title}(${x.s})`).join('、');
    throw new Error(`群名「${q}」匹配不明确，请指定更准确的群名。候选：${cand}`);
  }

  // ---------------------------------------------------------- 消息
  /**
   * 发群消息（以当前授权用户身份）。
   * dws 的 @ 规则：正文必须带 <@openDingTalkId> 占位符，只传 ids 不生效。
   */
  /**
   * 把 group 参数归一为 openConversationId：以 'cid' 开头视为已是 id 直接复用，
   * 否则按群名解析（resolveGroup 自带歧义校验，避免发错群）。这样调用方（含 Python job）
   * 只需传群名，钉钉协议细节全收敛在 Nest。
   */
  async resolveTarget(group: string): Promise<string> {
    const g = (group || '').trim();
    if (!g) throw new Error('缺少 group（openConversationId 或群名）');
    if (g.startsWith('cid')) return g;
    return (await this.resolveGroup(g)).openConversationId;
  }

  /** 公开给 groups 模块复用的纯字符匹配度（与旧 Python find_group 口径一致）。 */
  score(q: string, t: string): number {
    return this.scoreMatch(q, t);
  }

  /** 公开给 groups 模块：chat-list-all 漏掉的隐藏群号。 */
  knownNumbers(): number[] {
    return this.knownGroupNumbers();
  }

  /** 按关键词搜群并打分（候选池 = 全量 ∪ 搜索结果 ∪ 已知群号）。 */
  async searchScored(
    query: string,
    limit = 20,
  ): Promise<{ openConversationId: string; title: string; score: number }[]> {
    const q = (query || '').trim();
    if (!q) return [];
    const pool = new Map<string, DingGroup>();
    for (const g of await this.listGroups()) pool.set(g.openConversationId, g);
    try {
      for (const g of await this.searchGroups(q)) {
        if (!pool.has(g.openConversationId)) pool.set(g.openConversationId, g);
      }
    } catch {
      /* 搜索失败不致命 */
    }
    for (const n of this.knownNumbers()) {
      try {
        const g = await this.getGroupByNumber(n);
        if (g && !pool.has(g.openConversationId)) pool.set(g.openConversationId, g);
      } catch {
        /* 单个群号解析失败不影响整体 */
      }
    }
    const scored: { openConversationId: string; title: string; score: number }[] = [];
    for (const g of pool.values()) {
      if (!g.title) continue;
      const s = this.score(q, g.title);
      if (s >= 30) scored.push({ openConversationId: g.openConversationId, title: g.title, score: s });
    }
    scored.sort(
      (a, b) =>
        b.score - a.score || a.title.length - b.title.length || a.title.localeCompare(b.title),
    );
    return scored.slice(0, limit);
  }

  async sendMessage(p: {
    group: string;
    text: string;
    atOpenDingTalkIds?: string[];
    dryRun?: boolean;
  }): Promise<Record<string, any>> {
    if (!p.text) throw new Error('缺少 text');
    const group = await this.resolveTarget(p.group);
    const args = ['chat', 'message', 'send', '--group', group, '--text', p.text];
    const ids = (p.atOpenDingTalkIds || []).filter(Boolean);
    if (ids.length) args.push('--at-open-dingtalk-ids', ids.join(','));
    return this.run(args, { yes: true, dryRun: p.dryRun, aiTag: this.aiTagEnabled() });
  }

  /** 发文件消息（图片会以附件形式发送，不渲染成内联图）。 */
  async sendFile(p: { group: string; file: string; dryRun?: boolean }): Promise<Record<string, any>> {
    if (!p.file) throw new Error('缺少 file 路径');
    if (!fs.existsSync(p.file)) throw new Error('文件不存在: ' + p.file);
    const group = await this.resolveTarget(p.group);
    return this.run(
      ['chat', 'message', 'send', '--group', group, '--msg-type', 'file', '--file', p.file],
      { yes: true, dryRun: p.dryRun, aiTag: this.aiTagEnabled() },
    );
  }

  /**
   * 私发单聊（以当前 dws 账号身份，与群发一致）。text 为 Markdown，
   * 公网图片需写成 ![标题](url) 才内联展示。
   */
  async sendDm(p: {
    openDingTalkId: string;
    text: string;
    title?: string;
    dryRun?: boolean;
  }): Promise<Record<string, any>> {
    if (!p.openDingTalkId) throw new Error('缺少 openDingTalkId');
    if (!p.text) throw new Error('缺少 text');
    const args = ['chat', 'message', 'send', '--open-dingtalk-id', p.openDingTalkId, '--content', p.text];
    if (p.title) args.push('--title', p.title);
    return this.run(args, { yes: true, dryRun: p.dryRun, aiTag: this.aiTagEnabled() });
  }

  // ---------------------------------------------------------- dws CLI 配置（WebUI 设置）
  /** 合并 dws.env 覆盖项后的 env（注入到每次 spawn，使设置生效）。 */
  private dwsEnv(): NodeJS.ProcessEnv {
    return { ...process.env, ...this.loadConfigEnv(), PATH: `${this.dwsPath}:${process.env.PATH || ''}` };
  }

  /** 读取 ~/.dws/dws.env（KEY=VALUE 行，`#` 注释）。带内存缓存。 */
  private loadConfigEnv(): Record<string, string> {
    if (this.configCache) return this.configCache;
    const map: Record<string, string> = {};
    try {
      if (fs.existsSync(this.configEnvPath)) {
        for (const raw of fs.readFileSync(this.configEnvPath, 'utf-8').split('\n')) {
          const line = raw.trim();
          if (!line || line.startsWith('#')) continue;
          const i = line.indexOf('=');
          if (i <= 0) continue;
          map[line.slice(0, i).trim()] = line.slice(i + 1).trim();
        }
      }
    } catch (e) {
      this.logger.warn('读取 dws.env 失败: ' + (e as Error).message);
    }
    this.configCache = map;
    return map;
  }
  private invalidateConfigCache() {
    this.configCache = null;
  }

  /** 返回全部 dws 配置项的元数据 + 当前生效值（env 覆盖优先于内置默认）。 */
  async getDingConfig(): Promise<{ items: Record<string, any>[] }> {
    const envMap = this.loadConfigEnv();
    const items = DWS_CONFIG_META.map((m) => ({
      ...m,
      value: envMap[m.key] ?? process.env[m.key] ?? null,
    }));
    return { items };
  }

  /** 读取 dws CLI 版本（供前端展示与开发者配置解锁入口）。 */
  async getDwsVersion(): Promise<{ version: string; edition?: string }> {
    const j = await this.run(['version']);
    return {
      version: String(j?.version || ''),
      edition: j?.edition ? String(j.edition) : undefined,
    };
  }

  /** 检查 dws CLI 是否有新版本（只查询，不下载/修改）。 */
  async checkDwsUpdate(): Promise<Record<string, any>> {
    return this.run(['upgrade', '--check'], { timeout: 60 });
  }

  /** 当前升级任务进度快照。 */
  getUpgradeProgress(): UpgradeProgress {
    return { ...this.upgradeProgress };
  }

  /** 启动异步升级，立即返回进度快照；重复调用不会并发启动第二个升级。 */
  startUpgrade(): UpgradeProgress {
    if (this.upgradeProgress.running) return this.getUpgradeProgress();
    this.upgradeProgress = {
      running: true, phase: 'checking', detail: '检查更新', percent: 0,
      targetVersion: null, startedAt: new Date().toISOString(), finishedAt: null, error: null,
    };
    void this.runUpgradeJob();
    return this.getUpgradeProgress();
  }

  /** 后台执行升级，持续更新阶段与下载百分比。 */
  private async runUpgradeJob(): Promise<void> {
    let sizes: Record<string, number> = {};
    try {
      const check = await this.checkDwsUpdate();
      this.upgradeProgress.targetVersion = String(check?.latest_version || '');
      sizes = await this.fetchUpgradeAssetSizes();
    } catch (e) {
      this.logger.warn('升级前检查失败，继续升级（下载百分比可能不可用）: ' + (e as Error).message);
    }

    const args = ['upgrade', '-y', '--timeout', '300', '--format', 'json'];
    const cmd = this.candidates()[0];
    let out = '';
    let err = '';
    let code = -1;
    try {
      const child = spawn(cmd[0], cmd.slice(1).concat(args), {
        windowsHide: true,
        env: this.dwsEnv(),
      });
      const onData = (d: Buffer | string) => {
        const s = String(d);
        out += s;
        this.consumeUpgradeOutput(out);
      };
      child.stdout?.on('data', onData);
      child.stderr?.on('data', onData);
      this.upgradePoll = setInterval(() => this.updateDownloadProgress(sizes), 1000);
      code = await new Promise<number>((resolve) => {
        child.on('error', () => resolve(-1));
        child.on('close', (c) => resolve(c ?? -1));
      });
    } catch (e) {
      err = (e as Error).message;
    } finally {
      if (this.upgradePoll) {
        clearInterval(this.upgradePoll);
        this.upgradePoll = undefined;
      }
    }

    if (code === 0) {
      this.upgradeProgress.phase = 'done';
      this.upgradeProgress.detail = '升级完成';
      this.upgradeProgress.percent = 100;
    } else {
      this.upgradeProgress.phase = 'error';
      this.upgradeProgress.detail = '升级失败';
      this.upgradeProgress.error = this.humanize(out, err, code);
    }
    this.upgradeProgress.running = false;
    this.upgradeProgress.finishedAt = new Date().toISOString();
  }

  /** 从 dws 输出识别当前阶段（基于累积文本，避免分块截断）。 */
  private consumeUpgradeOutput(all: string): void {
    const p = this.upgradeProgress;
    if (all.includes('替换二进制') || all.includes('安装技能包')) {
      p.phase = 'install'; p.detail = '安装中'; p.percent = 99;
    } else if (all.includes('解压并验证')) {
      p.phase = 'extract'; p.detail = '解压并验证'; p.percent = 97;
    } else if (all.includes('校验 SHA256')) {
      p.phase = 'verify'; p.detail = '校验 SHA256'; p.percent = 95;
    } else if (all.includes('下载 dws-linux-amd64.tar.gz') || all.includes('下载 dws-skills.zip')) {
      p.phase = 'download'; p.percent = Math.max(p.percent, 5);
    } else if (all.includes('备份当前版本')) {
      p.phase = 'backup'; p.detail = '备份当前版本'; p.percent = Math.max(p.percent, 2);
    } else if (all.includes('检查更新')) {
      p.phase = 'checking'; p.detail = '检查更新'; p.percent = Math.max(p.percent, 1);
    }
  }

  /** 按缓存目录里已下载字节数 / GitHub 发布资源总大小计算百分比。 */
  private updateDownloadProgress(sizes: Record<string, number>): void {
    const p = this.upgradeProgress;
    if (!p.running || (p.phase !== 'download' && p.phase !== 'checking' && p.phase !== 'backup')) return;
    const root = path.join(os.homedir(), '.dws', 'cache', 'downloads');
    try {
      const dirs = fs.readdirSync(root, { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name.startsWith('upgrade-'))
        .map((e) => {
          const full = path.join(root, e.name);
          return { full, mtime: fs.statSync(full).mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);
      const dir = dirs[0]?.full;
      if (!dir) return;
      const names = ['dws-linux-amd64.tar.gz', 'dws-skills.zip'];
      let downloaded = 0;
      for (const name of names) {
        const f = path.join(dir, name);
        if (fs.existsSync(f)) downloaded += fs.statSync(f).size;
      }
      const total = names.reduce((s, n) => s + (sizes[n] || 0), 0);
      const mb = (n: number) => (n / 1048576).toFixed(1);
      p.phase = 'download';
      if (total > 0) {
        const pct = Math.min(94, Math.max(5, Math.floor((downloaded / total) * 100)));
        p.percent = pct;
        p.detail = `下载中 ${pct}% (${mb(downloaded)}/${mb(total)} MB)`;
      } else {
        p.percent = -1;
        p.detail = `下载中 ${mb(downloaded)} MB`;
      }
    } catch {
      /* 缓存目录暂未创建时忽略 */
    }
  }

  /** 从 GitHub Release API 取升级资源大小，用于算下载百分比；失败则只显示阶段。 */
  private async fetchUpgradeAssetSizes(): Promise<Record<string, number>> {
    try {
      const r = await fetch(
        'https://api.github.com/repos/DingTalk-Real-AI/dingtalk-workspace-cli/releases/latest',
        {
          signal: AbortSignal.timeout(15000),
          headers: { 'User-Agent': 'aeolusdata-dws-upgrade', Accept: 'application/vnd.github+json' },
        },
      );
      if (!r.ok) return {};
      const j: any = await r.json();
      const out: Record<string, number> = {};
      for (const a of j?.assets || []) {
        if (a?.name === 'dws-linux-amd64.tar.gz' || a?.name === 'dws-skills.zip') {
          out[a.name] = Number(a.size) || 0;
        }
      }
      return out;
    } catch {
      return {};
    }
  }

  /** 保存 dws 配置覆盖：patch 中空字符串表示删除（恢复 dws 内置默认）。 */
  async saveDingConfig(patch: Record<string, string>): Promise<{ ok: boolean }> {
    const map = { ...this.loadConfigEnv() };
    for (const [k, v] of Object.entries(patch || {})) {
      if (v === '' || v == null) delete map[k];
      else map[k] = String(v);
    }
    const lines = Object.entries(map).map(([k, v]) => `${k}=${v}`);
    try {
      const dir = path.dirname(this.configEnvPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.configEnvPath, lines.join('\n') + '\n', { mode: 0o600 });
      this.invalidateConfigCache();
    } catch (e) {
      throw new Error('写入 dws 配置失败: ' + (e as Error).message);
    }
    return { ok: true };
  }

  /** 读取发消息设置；未落盘过时沿用 dws 默认：带 AI 角标。 */
  async getSendSettings(): Promise<DingSendSettings> {
    try {
      if (fs.existsSync(this.sendSettingsFile)) {
        const raw = JSON.parse(fs.readFileSync(this.sendSettingsFile, 'utf-8')) as Partial<DingSendSettings>;
        return { aiTag: typeof raw?.aiTag === 'boolean' ? raw.aiTag : true };
      }
    } catch (e) {
      this.logger.warn('读取发消息设置失败，沿用默认值: ' + (e as Error).message);
    }
    return { aiTag: true };
  }

  /** 保存发消息设置；只改显式传入的布尔项，立即生效（每次发消息都重读文件）。 */
  async saveSendSettings(patch: { aiTag?: boolean }): Promise<{ ok: boolean; settings: DingSendSettings }> {
    const current = await this.getSendSettings();
    if (typeof patch?.aiTag === 'boolean') current.aiTag = patch.aiTag;
    try {
      const dir = path.dirname(this.sendSettingsFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmp = `${this.sendSettingsFile}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(current, null, 2) + '\n', { mode: 0o600 });
      fs.renameSync(tmp, this.sendSettingsFile);
    } catch (e) {
      throw new Error('写入发消息设置失败: ' + (e as Error).message);
    }
    return { ok: true, settings: current };
  }

  /** 发消息时读取当前 AI 角标开关。 */
  private aiTagEnabled(): boolean {
    // 同步读取，保证保存后下一次发送立即生效，不依赖缓存或重启。
    try {
      if (fs.existsSync(this.sendSettingsFile)) {
        const raw = JSON.parse(fs.readFileSync(this.sendSettingsFile, 'utf-8')) as Partial<DingSendSettings>;
        return typeof raw?.aiTag === 'boolean' ? raw.aiTag : true;
      }
    } catch (e) {
      this.logger.warn('读取 AI 角标设置失败，沿用默认值: ' + (e as Error).message);
    }
    return true;
  }

  // ---------------------------------------------------------- 在线表格
  /** 读取区域，返回二维行（与既有 read_range 口径一致）。 */
  async sheetReadRange(p: {
    node: string;
    sheetId: string;
    range: string;
  }): Promise<string[][]> {
    const j = await this.run([
      'sheet', 'csv-get', '--node', p.node, '--sheet-id', p.sheetId, '--range', p.range,
    ]);
    if (!j.success) throw new Error('读取在线表失败: ' + (j.message || ''));
    const rows: string[][] = [];
    for (const raw of String(j.csv || '').split('\n')) {
      let line = raw.trim();
      if (!line) continue;
      if (line.startsWith('[row=')) line = line.slice(line.indexOf(']') + 1);
      if (line.startsWith(',')) line = line.slice(1);
      rows.push(this.splitCsvLine(line));
    }
    return rows;
  }

  async sheetUpdateRange(p: {
    node: string;
    sheetId: string;
    range: string;
    values: string[][];
    dryRun?: boolean;
  }): Promise<Record<string, any>> {
    if (!Array.isArray(p.values)) throw new Error('values 必须是二维数组');
    // range update 不接受原始字符串：每格必须是 {"type":"text","text":"..."}。
    // 统一按 text 写入，长数字（运单号/骑手ID）才不会被自动转成数值丢精度或变科学计数法。
    const cells = p.values.map((row) =>
      (row || []).map((v) => ({ type: 'text', text: v == null ? '' : String(v) })),
    );
    return this.run(
      [
        'sheet', 'range', 'update', '--node', p.node, '--sheet-id', p.sheetId,
        '--range', p.range, '--values', JSON.stringify(cells),
      ],
      { yes: true, dryRun: p.dryRun },
    );
  }

  /** 极简 CSV 行切分（处理引号包裹）。 */
  private splitCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') {
        inQ = !inQ;
        continue;
      }
      if (ch === ',' && !inQ) {
        out.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out;
  }
}
