import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthResponseDto } from './dto/auth-response.dto';
import { UserRepository } from './repository/user.repository';

interface GoogleUser {
  email: string;
  firstName: string;
  lastName: string;
  picture: string;
  googleId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly jwtService: JwtService
  ) {}

  async validateGoogleUser(details: GoogleUser) {
    const name = `${details.firstName} ${details.lastName}`.trim() || 'Unknown';

    return await this.userRepo.upsertGoogleUser({
      email: details.email,
      name,
      googleId: details.googleId,
      avatar: details.picture,
    });
  }

  async login(user: {
    id: string;
    email: string;
    name: string | null;
    avatar: string | null;
  }): Promise<AuthResponseDto> {
    const payload = {
      email: user.email,
      sub: user.id,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      },
    };
  }
}
