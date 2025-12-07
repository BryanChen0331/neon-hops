import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { LabelController } from './label.controller';
import { LabelService } from './label.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [LabelController],
  providers: [LabelService],
})
export class LabelModule {}
