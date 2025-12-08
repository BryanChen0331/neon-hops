import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const SaveLabelSchema = z.object({
  imageUrl: z.url().describe('Image URL from CDN/S3'),
});

export class SaveLabelDto extends createZodDto(SaveLabelSchema) {}
