import { Body, Controller, Post } from '@nestjs/common';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { PhotoRectifyRequest, PhotoRectifyResponse, PhotoRectifyService } from './photo-rectify.service';

/**
 * 证件照透视矫正（离线/批处理备选通道）。
 * 前端主流程仍在浏览器本地完成，原图不会上传；此端点只在需要服务端批量处理时显式调用。
 * 入参为 base64 PNG / data URL，不接收原图文件之外的内容；成功时只返回成品 PNG。
 */
@Controller('api/photo-rectify')
export class PhotoRectifyController {
  constructor(private readonly service: PhotoRectifyService) {}

  @RequirePerm('view')
  @Post()
  rectify(@Body() body: PhotoRectifyRequest): PhotoRectifyResponse {
    return this.service.rectify(body);
  }

  @RequirePerm('view')
  @Post('batch')
  rectifyBatch(@Body() body: { images: PhotoRectifyRequest[] }): { results: PhotoRectifyResponse[] } {
    const images = Array.isArray(body?.images) ? body.images.slice(0, 50) : [];
    return { results: images.map((item) => this.service.rectify(item)) };
  }
}
