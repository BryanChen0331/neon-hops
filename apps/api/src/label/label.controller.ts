import { Controller, Post, Get, Body, UsePipes, UseGuards, Req } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { LabelService } from './label.service';
import { SaveLabelDto } from './dto/save-label.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';

interface RequestWithUser {
  user: {
    userId: string;
    email: string;
  };
}

@Controller('labels')
export class LabelController {
  constructor(private readonly labelService: LabelService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @UsePipes(ZodValidationPipe)
  async saveLabel(@Req() req: RequestWithUser, @Body() dto: SaveLabelDto) {
    return await this.labelService.queueLabel(req.user.userId, dto);
  }

  @Get('queue-stats')
  @UseGuards(JwtAuthGuard)
  async getQueueStats() {
    return await this.labelService.getQueueMetrics();
  }
}
