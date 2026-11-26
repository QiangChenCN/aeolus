import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { beijingNowStr } from '../../common/format.util';
import { PgService } from '../pg/pg.service';

/**
 * 排班出勤「时段未达标反馈表」持久层（PostgreSQL only）。
 *
 * 数据粒度：日期 × 站点 × 骑手 × 时段。一行 = 一条需要人工反馈的未达标记录。
 * 后端启动自动建表并收敛状态约束；读写接口见 AttendPeriodFeedbackController。
 *
 * 不冗余完成单量/有效在线时长：数值以实时考勤明细为准，本表只保留定位键、
 * 系统初判 fail_type 与人工反馈信息。时间戳沿用项目惯例，存北京时间字符串。
 */
export const FEEDBACK_FAIL_TYPES = ['ORDER_SHORT', 'ONLINE_SHORT', 'BOTH_SHORT'] as const;
export const FEEDBACK_STATUSES = ['PENDING', 'FEEDBACKED'] as const;

export interface AttendPeriodFeedbackRow {
  stat_date: string;
  team_id: string;
  team_name: string;
  rider_id: string;
  rider_name: string;
  time_code: string;
  feedback_status: string;
  /** 库里存登录用户名；接口下发时另带 feedback_user_name（真实姓名）供展示。 */
  feedback_user: string | null;
  feedback_user_name?: string;
  feedback_time: string | null;
  remark: string | null;
}

const PG_DDL = `
CREATE TABLE IF NOT EXISTS attend_period_feedback (
  id              SERIAL PRIMARY KEY,
  stat_date       TEXT NOT NULL,
  team_id         TEXT NOT NULL,
  team_name       TEXT NOT NULL,
  rider_id        TEXT NOT NULL,
  rider_name      TEXT NOT NULL,
  time_code       TEXT NOT NULL,
  time_name       TEXT NOT NULL,
  start_time      TEXT NOT NULL,
  end_time        TEXT NOT NULL,
  fail_type       TEXT NOT NULL DEFAULT 'BOTH_SHORT'
                  CONSTRAINT attend_period_feedback_fail_type_chk
                  CHECK (fail_type IN ('ORDER_SHORT', 'ONLINE_SHORT', 'BOTH_SHORT')),
  feedback_status TEXT NOT NULL DEFAULT 'PENDING'
                  CONSTRAINT attend_period_feedback_status_chk
                  CHECK (feedback_status IN ('PENDING', 'FEEDBACKED')),
  feedback_user   TEXT,
  feedback_time   TEXT,
  remark          TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  CONSTRAINT attend_period_feedback_uniq
    UNIQUE (stat_date, team_id, rider_id, time_code));
CREATE INDEX IF NOT EXISTS idx_attend_period_feedback_date_team
  ON attend_period_feedback(stat_date, team_id);
CREATE INDEX IF NOT EXISTS idx_attend_period_feedback_status
  ON attend_period_feedback(feedback_status);
`;

// 老库上的 CHECK 约束含 CLOSED，CREATE TABLE IF NOT EXISTS 不会更新；启动时幂等收敛。
const PG_STATUS_MIGRATION = `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attend_period_feedback_status_chk'
      AND conrelid = 'attend_period_feedback'::regclass
  ) THEN
    UPDATE attend_period_feedback
       SET feedback_status = 'FEEDBACKED'
     WHERE feedback_status = 'CLOSED';
    ALTER TABLE attend_period_feedback DROP CONSTRAINT attend_period_feedback_status_chk;
  END IF;
  ALTER TABLE attend_period_feedback ADD CONSTRAINT attend_period_feedback_status_chk
    CHECK (feedback_status IN ('PENDING', 'FEEDBACKED'));
END $$;
`;

export interface AttendPeriodFeedbackInput {
  statDate: string;
  teamId: string;
  teamName: string;
  riderId: string;
  riderName: string;
  timeCode: string;
  timeName: string;
  startTime: string;
  endTime: string;
  failType: string;
  remark: string;
  feedbackUser: string;
}

@Injectable()
export class AttendPeriodFeedbackStoreService implements OnModuleInit {
  private readonly logger = new Logger(AttendPeriodFeedbackStoreService.name);

  constructor(private readonly pg: PgService) {}

  async onModuleInit(): Promise<void> {
    if (!this.pg.isEnabled) {
      this.logger.warn('DATABASE_URL 未配置，时段未达标反馈表不可用');
      return;
    }
    await this.pg.query(PG_DDL);
    await this.pg.query(PG_STATUS_MIGRATION);
    this.logger.log('时段未达标反馈 PG 表已就绪（状态仅 PENDING/FEEDBACKED）');
  }

  get ready(): boolean {
    return this.pg.isEnabled;
  }

  /**
   * 按日期取整日反馈（时段看板一次拉全，再按站点+骑手+时段在前端对齐）。
   * allowedTeamIds 为 null 表示数据权限不受限；空数组表示无任何可见站点，直接返回空。
   */
  async listByDate(
    statDate: string,
    allowedTeamIds: string[] | null = null,
  ): Promise<AttendPeriodFeedbackRow[]> {
    if (!this.pg.isEnabled) return [];
    if (allowedTeamIds !== null && allowedTeamIds.length === 0) return [];

    const params: unknown[] = [statDate];
    let sql = `SELECT stat_date, team_id, team_name, rider_id, rider_name, time_code,
                      feedback_status, feedback_user, feedback_time, remark
               FROM attend_period_feedback WHERE stat_date = $1`;
    if (allowedTeamIds !== null) {
      params.push(allowedTeamIds);
      sql += ` AND team_id = ANY($${params.length}::text[])`;
    }
    sql += ' ORDER BY team_name, rider_id, time_code';
    return this.pg.query<AttendPeriodFeedbackRow>(sql, params);
  }

  /** 按业务唯一键 UPSERT 反馈；已存在则覆盖内容并置为 FEEDBACKED。 */
  async upsert(input: AttendPeriodFeedbackInput): Promise<AttendPeriodFeedbackRow> {
    if (!this.pg.isEnabled) throw new Error('PgService 未启用，无法保存时段反馈');
    const now = beijingNowStr();
    const rows = await this.pg.query<AttendPeriodFeedbackRow>(
      `INSERT INTO attend_period_feedback (
         stat_date, team_id, team_name, rider_id, rider_name, time_code,
         time_name, start_time, end_time, fail_type, feedback_status,
         feedback_user, feedback_time, remark, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'FEEDBACKED',$12,$13,$11,$13,$13)
       ON CONFLICT (stat_date, team_id, rider_id, time_code) DO UPDATE SET
         team_name=excluded.team_name, rider_name=excluded.rider_name,
         time_name=excluded.time_name, start_time=excluded.start_time,
         end_time=excluded.end_time, fail_type=excluded.fail_type,
         feedback_status='FEEDBACKED', feedback_user=excluded.feedback_user,
         feedback_time=excluded.feedback_time, remark=excluded.remark,
         updated_at=excluded.updated_at
       RETURNING stat_date, team_id, team_name, rider_id, rider_name, time_code,
                 feedback_status, feedback_user, feedback_time, remark`,
      [
        input.statDate, input.teamId, input.teamName, input.riderId, input.riderName,
        input.timeCode, input.timeName, input.startTime, input.endTime, input.failType,
        input.remark, input.feedbackUser, now,
      ],
    );
    return rows[0];
  }
}
