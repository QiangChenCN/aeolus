import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { isYmd, str } from '../../common/format.util';
import { extractToken } from '../../common/token.util';
import { AuthService } from '../auth/auth.service';
import { DataPermService } from '../auth/data-perm.service';
import {
  AttendPeriodFeedbackRow,
  FEEDBACK_FAIL_TYPES,
  AttendPeriodFeedbackStoreService,
} from './attend-period-feedback-store.service';

/**
 * 时段看板「未达标原因反馈」读写入口。
 *
 * 独立前缀 `attend-period-feedback`，避开 ProxyController 的 `attend-period/{*path}`
 * 通配代理（该前缀的 GET 全部转发 Python，见 proxy.controller.ts）。
 * 数据权限与 Python 侧 x-scope 同口径：无会话（系统/iframe 持机器令牌）不受限，
 * 有会话按 resolveAllowed(user, role, 'team') 过滤。
 */
@Controller('api')
export class AttendPeriodFeedbackController {
  constructor(
    private readonly store: AttendPeriodFeedbackStoreService,
    private readonly auth: AuthService,
    private readonly dataPerm: DataPermService,
  ) {}

  @RequirePerm('view')
  @Get('attend-period-feedback')
  async list(@Query('date') date: string, @Req() req: Request) {
    const statDate = str(date);
    if (!isYmd(statDate)) {
      throw new BadRequestException('date 需为 YYYY-MM-DD');
    }
    const rows = await this.store.listByDate(statDate, this.allowedTeamIds(req));
    return { ok: true, rows: this.withDisplayNames(rows) };
  }

  @RequirePerm('feedback:write')
  @Post('attend-period-feedback')
  async save(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const statDate = str(body?.date);
    const teamId = str(body?.teamId);
    const riderId = str(body?.riderId);
    const timeCode = str(body?.timeCode);
    const remark = str(body?.remark);
    if (!isYmd(statDate)) throw new BadRequestException('date 需为 YYYY-MM-DD');
    if (!teamId || !riderId || !timeCode) {
      throw new BadRequestException('站点、骑手、时段不能为空');
    }
    if (!remark) throw new BadRequestException('反馈内容不能为空');
    if (remark.length > 500) throw new BadRequestException('反馈内容最多 500 字');

    const allowed = this.allowedTeamIds(req);
    if (allowed !== null && !allowed.includes(teamId)) {
      throw new ForbiddenException('无权填写该站点的反馈');
    }
    const session = this.auth.getSession(extractToken(req));
    const failType = FEEDBACK_FAIL_TYPES.find((t) => t === body?.failType) ?? 'BOTH_SHORT';
    const row = await this.store.upsert({
      statDate,
      teamId,
      teamName: str(body?.teamName),
      riderId,
      riderName: str(body?.riderName),
      timeCode,
      timeName: str(body?.timeName),
      startTime: str(body?.startTime),
      endTime: str(body?.endTime),
      failType,
      remark,
      feedbackUser: session?.user || 'system',
    });
    return { ok: true, row: this.withDisplayNames([row])[0] };
  }

  /** 库里存用户名，展示用其真实姓名；查不到账号（已删除等）时回退用户名。 */
  private withDisplayNames(rows: AttendPeriodFeedbackRow[]): AttendPeriodFeedbackRow[] {
    return rows.map((row) => {
      const username = row.feedback_user || '';
      const name = username ? this.auth.getUser(username)?.name : '';
      return { ...row, feedback_user_name: name?.trim() || username };
    });
  }

  private allowedTeamIds(req: Request): string[] | null {
    const session = this.auth.getSession(extractToken(req));
    if (!session) return null;
    const ids = this.dataPerm.resolveAllowed(session.user, session.role, 'team');
    return ids === null ? null : [...ids].map(String);
  }
}
