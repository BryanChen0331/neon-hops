import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ILabelDataRepository } from '../interfaces/label.interfaces';
import { LabelCreateData } from '../types/label.types';

@Injectable()
export class LabelDataRepository implements ILabelDataRepository {
  private readonly logger = new Logger(LabelDataRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async createMany(data: LabelCreateData[]): Promise<void> {
    if (data.length === 0) return;

    try {
      const result = await this.prisma.labelDesign.createMany({
        data,
        skipDuplicates: true,
      });

      this.logger.log(`✅ Successfully saved ${result.count}/${data.length} labels to DB`);
    } catch (error) {
      this.logger.error('Failed to create labels in database', error);
      throw new Error('Database operation failed');
    }
  }
}
