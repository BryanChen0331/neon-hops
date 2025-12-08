import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UserRepository } from './repository/user.repository';
import { JwtService } from '@nestjs/jwt';
import { InternalServerErrorException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { User, UserStatus } from '@prisma/client';

const createMockUser = (overrides?: Partial<User>): User => ({
  id: 'uuid-123',
  email: 'test@example.com',
  name: 'John Doe',
  googleId: '123456',
  avatar: 'http://img.com/pic.jpg',
  status: UserStatus.ACTIVE,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('AuthService', () => {
  let service: AuthService;
  let userRepoMock: DeepMockProxy<UserRepository>;
  let jwtServiceMock: DeepMockProxy<JwtService>;

  beforeEach(async () => {
    userRepoMock = mockDeep<UserRepository>();
    jwtServiceMock = mockDeep<JwtService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserRepository, useValue: userRepoMock },
        { provide: JwtService, useValue: jwtServiceMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('validateGoogleUser', () => {
    const googleProfile = {
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      picture: 'http://img.com/pic.jpg',
      googleId: '123456',
    };

    it('should call repo.upsertGoogleUser with correct params', async () => {
      const expectedUser = createMockUser();
      userRepoMock.upsertGoogleUser.mockResolvedValue(expectedUser);

      const result = await service.validateGoogleUser(googleProfile);

      expect(result).toEqual(expectedUser);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(userRepoMock.upsertGoogleUser).toHaveBeenCalledWith({
        email: googleProfile.email,
        name: 'John Doe',
        googleId: googleProfile.googleId,
        avatar: googleProfile.picture,
      });
    });

    it('should handle empty firstName and lastName', async () => {
      const emptyNameProfile = { ...googleProfile, firstName: '', lastName: '' };
      const expectedUser = createMockUser({ name: 'Unknown' });
      userRepoMock.upsertGoogleUser.mockResolvedValue(expectedUser);

      await service.validateGoogleUser(emptyNameProfile);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(userRepoMock.upsertGoogleUser).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Unknown' })
      );
    });

    it('should trim whitespace and fallback to Unknown', async () => {
      const whitespaceProfile = { ...googleProfile, firstName: '   ', lastName: '   ' };
      const expectedUser = createMockUser({ name: 'Unknown' });
      userRepoMock.upsertGoogleUser.mockResolvedValue(expectedUser);

      await service.validateGoogleUser(whitespaceProfile);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(userRepoMock.upsertGoogleUser).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Unknown' })
      );
    });

    it('should handle partial names correctly', async () => {
      const partialNameProfile = { ...googleProfile, firstName: 'John', lastName: '' };
      const expectedUser = createMockUser({ name: 'John' });
      userRepoMock.upsertGoogleUser.mockResolvedValue(expectedUser);

      await service.validateGoogleUser(partialNameProfile);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(userRepoMock.upsertGoogleUser).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'John' })
      );
    });

    it('should propagate InternalServerErrorException from repository', async () => {
      const repositoryError = new InternalServerErrorException('Database operation failed');
      userRepoMock.upsertGoogleUser.mockRejectedValue(repositoryError);

      await expect(service.validateGoogleUser(googleProfile)).rejects.toThrow(
        InternalServerErrorException
      );
    });

    it('should propagate generic errors from repository', async () => {
      const genericError = new Error('Network timeout');
      userRepoMock.upsertGoogleUser.mockRejectedValue(genericError);

      await expect(service.validateGoogleUser(googleProfile)).rejects.toThrow('Network timeout');
    });
  });

  describe('login', () => {
    it('should return access token and user info', async () => {
      const user = {
        id: 'uuid-123',
        email: 'test@example.com',
        name: 'John Doe',
        avatar: 'avatar.jpg',
      };
      const mockToken = 'mock-jwt-token';
      jwtServiceMock.signAsync.mockResolvedValue(mockToken);

      const result = await service.login(user);

      expect(result).toEqual({ accessToken: mockToken, user: user });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(jwtServiceMock.signAsync).toHaveBeenCalledWith({
        email: user.email,
        sub: user.id,
      });
    });

    it('should handle user with null name and avatar', async () => {
      const user = {
        id: 'uuid-123',
        email: 'test@example.com',
        name: null,
        avatar: null,
      };
      const mockToken = 'mock-jwt-token';
      jwtServiceMock.signAsync.mockResolvedValue(mockToken);

      const result = await service.login(user);

      expect(result.user.name).toBeNull();
      expect(result.user.avatar).toBeNull();
    });

    it('should sign JWT with ONLY email and sub fields', async () => {
      const user = {
        id: 'uuid-123',
        email: 'test@example.com',
        name: 'John Doe',
        avatar: 'avatar.jpg',
      };
      const mockToken = 'mock-jwt-token';
      jwtServiceMock.signAsync.mockResolvedValue(mockToken);

      await service.login(user);

      const callArgs = jwtServiceMock.signAsync.mock.calls[0][0];
      expect(Object.keys(callArgs).sort()).toEqual(['email', 'sub'].sort());
      expect(callArgs).toEqual({
        email: user.email,
        sub: user.id,
      });
    });
  });
});
