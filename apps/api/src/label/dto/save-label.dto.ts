import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const SaveLabelSchema = z.object({
  userId: z.uuid(),
  imageUrl: z.url(),
});

export class SaveLabelDto extends createZodDto(SaveLabelSchema) {}
