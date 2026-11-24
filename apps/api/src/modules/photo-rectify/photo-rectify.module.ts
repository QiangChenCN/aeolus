import { Module } from '@nestjs/common';
import { PhotoRectifyController } from './photo-rectify.controller';
import { PhotoRectifyService } from './photo-rectify.service';

@Module({
  controllers: [PhotoRectifyController],
  providers: [PhotoRectifyService],
})
export class PhotoRectifyModule {}
