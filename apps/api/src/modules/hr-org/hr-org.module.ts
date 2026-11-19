import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FetchModule } from '../../infra/fetch/fetch.module';
import { PgModule } from '../pg/pg.module';
import { OrgStructureController } from './org-structure.controller';

/**
 * 组织架构（人事管理子模块）：业务线 → 城市 → 站点归属配置。
 * 站点目录只读自风神（TeamsFetchService），归属配置读写 org_tree.json（DataPermService）。
 */
@Module({
  imports: [AuthModule, FetchModule, PgModule],
  controllers: [OrgStructureController],
})
export class HrOrgModule {}
