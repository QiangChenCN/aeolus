import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { Body, Controller, Get, Post } from '@nestjs/common';
import { StationManagersService } from './station-managers.service';

/**
 * 站点负责人映射（人事管理 → 组织架构 → 负责人路由页签维护）。
 * 供实时在线播报等任务「按站点 @ 负责人」使用。
 * 权限：GET 限 view（只读用户可看配置），写入/解析限 config:write。
 */
@Controller('api/notify')
export class StationManagersController {
  constructor(private readonly svc: StationManagersService) {}

  /** 当前映射 + 一致性巡检（文件不存在时返回空配置，configured=false 提示前端）。 */
  @RequirePerm('view')
  @Get('station-managers')
  async get() {
    const base = this.svc.get();
    let consistency;
    try {
      consistency = await this.svc.consistency();
    } catch {
      /* 巡检失败不阻塞配置展示 */
    }
    return { ...base, consistency };
  }

  /** 保存映射（整体覆盖 stations；openDingTalkId 无需手动填，自动解析）。 */
  @RequirePerm('config:write')
  @Post('station-managers')
  save(@Body() b: Record<string, unknown>) {
    return this.svc.save(b || {});
  }

  /**
   * 一键解析：把配置里引用到的全部负责人姓名拿去通讯录搜索 openDingTalkId
   * （与发送目标群无关），结果落缓存。
   */
  @RequirePerm('config:write')
  @Post('station-managers/resolve')
  resolve(@Body() _b: Record<string, unknown>) {
    return this.svc.resolveAll();
  }
}
