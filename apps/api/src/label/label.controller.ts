import { Controller, Post, Body, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { LabelService } from './label.service';
import { SaveLabelDto } from './dto/save-label.dto';

@Controller('labels')
export class LabelController {
  constructor(private readonly labelService: LabelService) {}

  @Post()
  @UsePipes(ZodValidationPipe)
  async saveLabel(@Body() dto: SaveLabelDto) {
    return await this.labelService.queueLabel(dto);
  }
}
