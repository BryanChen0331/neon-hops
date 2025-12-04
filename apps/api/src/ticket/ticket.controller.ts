import { Controller, Post, Body, Query } from '@nestjs/common';
import { TicketService } from './ticket.service';

@Controller('tickets')
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  @Post('purchase')
  async purchase(
    @Body('userId') userId: string,
    @Body('poolId') poolId: string,
    @Body('designId') designId: string
  ) {
    return await this.ticketService.purchaseTicket(userId, poolId, designId);
  }

  @Post('init-stock')
  async initStock(@Query('poolId') poolId: string, @Query('count') count: string) {
    await this.ticketService.initializeStock(poolId, parseInt(count, 10));
    return { message: 'Stock initialized', poolId, count };
  }
}
