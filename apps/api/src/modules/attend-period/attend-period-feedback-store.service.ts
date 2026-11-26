import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PgService } from '../pg/pg.service';

/**
 * 排班出勤「时段未达标反馈表」持久层（PostgreSQL only）。
 *
 * 数据粒度：日期 × 站点 × 骑手 × 时段。一行 = 一条需要人工反馈的未达标记录。
 * 本阶段只负责建表（后端启动自动执行 DDL），不提供写入/查询端点，前端页面不变。
 *
 * 不冗余完成单量/有效在线时长：数值以实时考勤明细为准，本表只保留定位键、
 * 系统初判 fail_type 与人工反馈信息。时间戳沿用项目惯例，存北京时间字符串。
 */
export const FEEDBACK_FAIL_TYPES = ['ORDER_SHORT', 'ONLINE_SHORT', 'BOTH_SHORT'] as const;
export const FEEDBACK_STATUSES = ['PENDING', 'FEEDBACKED', 'CLOSED'] as const;

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
                  CHECK (feedback_status IN ('PENDING', 'FEEDBACKED', 'CLOSED')),
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
    this.logger.log('时段未达标反馈 PG 表已就绪');
  }

  get ready(): boolean {
    return this.pg.isEnabled;
  }
}
