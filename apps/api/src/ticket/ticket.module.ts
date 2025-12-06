import { Module } from '@nestjs/common';
import { TicketService } from './ticket.service';
import { TicketController } from './ticket.controller';
import { TicketRepository } from './repository/ticket.repository';
import { TicketRedisRepository } from './repository/ticket.redis.repository';

@Module({
  controllers: [TicketController],
  providers: [TicketService, TicketRepository, TicketRedisRepository],
})
export class TicketModule {}
