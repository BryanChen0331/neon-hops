import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const PurchaseTicketSchema = z.object({
  userId: z.uuid({ error: 'Invalid User ID format' }),
  poolId: z.uuid({ error: 'Invalid Pool ID format' }),
  designId: z.uuid({ error: 'Invalid Design ID format' }),
});

export class PurchaseTicketDto extends createZodDto(PurchaseTicketSchema) {}
