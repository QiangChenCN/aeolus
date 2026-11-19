import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { SOURCE_CATALOG } from './sources/source-catalog';

/**
 * 取数基座目录（只读）。
 *
 * 数据来自 source-catalog.ts 的静态元数据：清单对所有登录用户开放（体验层由
 * meta.perm=view 收敛）；详情含服务文件、落盘路径、任务 id 等内部信息，按
 * admin:aeolus 收敛。所有端点显式声明 @RequirePerm —— AccessGuard 启动自检
 * 要求每个路由都有方法级权限声明，缺一个会直接拒绝启动。
 */
@Controller('api/settings')
export class SourceRegistryController {
  @RequirePerm('view')
  @Get('sources')
  list() {
    const items = SOURCE_CATALOG.map((s) => ({
      id: s.id,
      name: s.name,
      tags: s.tags || [],
      desc: s.desc,
      service: s.service,
      trigger: s.trigger,
      endpoints: s.endpoints,
      dependsOn: s.dependsOn,
      linked: s.linked,
      rawKinds: s.rawKinds || [],
    }));
    return { ok: true, total: items.length, items };
  }

  @RequirePerm('admin:aeolus')
  @Get('sources/:id')
  detail(@Param('id') id: string) {
    const item = SOURCE_CATALOG.find((s) => s.id === id);
    if (!item) throw new NotFoundException(`取数基座不存在：${id}`);
    return { ok: true, item };
  }
}
