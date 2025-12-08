import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { User } from '@prisma/client';

export interface CreateUserParams {
  email: string;
  name: string;
  googleId: string;
  avatar: string;
}

@Injectable()
export class UserRepository {
  private readonly logger = new Logger(UserRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async upsertGoogleUser(params: CreateUserParams): Promise<User> {
    try {
      return await this.prisma.user.upsert({
        where: { email: params.email },
        update: {
          googleId: params.googleId,
          avatar: params.avatar,
          name: params.name,
        },
        create: {
          email: params.email,
          name: params.name,
          googleId: params.googleId,
          avatar: params.avatar,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to upsert user: ${params.email}`, error);
      throw new InternalServerErrorException('Database operation failed');
    }
  }
}
