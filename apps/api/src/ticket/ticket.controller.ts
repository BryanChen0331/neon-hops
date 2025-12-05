import { Controller, Post, Body, Query, UsePipes } from '@nestjs/common';
import { TicketService } from './ticket.service';
import { ZodValidationPipe } from 'nestjs-zod';
import { PurchaseTicketDto } from './dto/purchase-ticket.dto';

@Controller('tickets')
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  @Post('purchase')
  @UsePipes(ZodValidationPipe)
  async purchase(@Body() body: PurchaseTicketDto) {
    return await this.ticketService.purchaseTicket(body.userId, body.poolId, body.designId);
  }

  @Post('init-stock')
  async initStock(@Query('poolId') poolId: string, @Query('count') count: string) {
    await this.ticketService.initializeStock(poolId, parseInt(count, 10));
    return { message: 'Stock initialized', poolId, count };
  }
}
