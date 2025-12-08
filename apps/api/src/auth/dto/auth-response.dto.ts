import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const AuthResponseSchema = z.object({
  accessToken: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string().nullable(),
    avatar: z.string().nullable(),
  }),
});

export class AuthResponseDto extends createZodDto(AuthResponseSchema) {}
