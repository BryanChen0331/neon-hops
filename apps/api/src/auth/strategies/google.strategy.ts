import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(
    configService: ConfigService,
    private authService: AuthService
  ) {
    const clientID = configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = configService.get<string>('GOOGLE_CLIENT_SECRET');
    const callbackURL = configService.get<string>('GOOGLE_CALLBACK_URL');

    if (!clientID || !clientSecret || !callbackURL) {
      throw new Error('Google OAuth credentials are not properly configured');
    }

    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback
  ): Promise<void> {
    const { name, emails, photos, id } = profile;

    const email = emails?.[0]?.value;
    const picture = photos?.[0]?.value;
    const firstName = name?.givenName;
    const lastName = name?.familyName;

    if (!id || !email) {
      this.logger.error(
        `Invalid Google profile. Missing ID or Email. ` +
          `ID: ${id ?? 'UNKNOWN'}, Email: ${email ?? 'UNKNOWN'}`
      );
      return done(new UnauthorizedException('Invalid Google profile'), undefined);
    }

    const googleUser = {
      email,
      firstName: firstName || '',
      lastName: lastName || '',
      picture: picture || '',
      googleId: id,
    };

    try {
      const user = await this.authService.validateGoogleUser(googleUser);
      done(null, user);
    } catch (error) {
      this.logger.error('Failed to validate Google user in strategy', error);
      done(error, undefined);
    }
  }
}
