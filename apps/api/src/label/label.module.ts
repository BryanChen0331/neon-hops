import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { LabelController } from './label.controller';
import { LabelService } from './label.service';
import { LabelQueueRepository } from './repositories/label-queue.repository';
import { LabelDataRepository } from './repositories/label-data.repository';
import { LabelValidator } from './validators/label.validator';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { LABEL_DATA_REPO, LABEL_QUEUE_REPO, LABEL_VALIDATOR } from './label.constants';

@Module({
  imports: [PrismaModule, RedisModule, ScheduleModule.forRoot()],
  controllers: [LabelController],
  providers: [
    LabelService,
    {
      provide: LABEL_QUEUE_REPO,
      useClass: LabelQueueRepository,
    },
    {
      provide: LABEL_DATA_REPO,
      useClass: LabelDataRepository,
    },
    {
      provide: LABEL_VALIDATOR,
      useClass: LabelValidator,
    },
  ],
  exports: [LabelService],
})
export class LabelModule {}
