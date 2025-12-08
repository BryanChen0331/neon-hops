import { Controller, Get, Req, UseGuards, Query, UnauthorizedException } from '@nestjs/common';
import { GoogleAuthGuard } from './guards/google.guard';
import { AuthService } from './auth.service';

interface RequestWithUser {
  user: {
    id: string;
    email: string;
    name: string | null;
    avatar: string | null;
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuth() {
    // Passport redirect
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  googleAuthRedirect(@Req() req: RequestWithUser, @Query('error') error?: string) {
    if (error) {
      throw new UnauthorizedException(`OAuth failed: ${error}`);
    }
    return this.authService.login(req.user);
  }
}
