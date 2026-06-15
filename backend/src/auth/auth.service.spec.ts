import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityService } from '../activity/activity.service';
import { LoginThrottlerService } from '@/common/guards';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { SocialPromotionsService } from '../social-promotions/social-promotions.service';
import { TurnstileService } from './turnstile.service';
import { TwoFactorService } from './two-factor.service';

jest.mock('bcrypt');
jest.mock('otplib', () => ({
  generateSecret: jest.fn(() => 'SECRET123'),
  generateURI: jest.fn(
    () => 'otpauth://totp/LUK:test@example.com?secret=SECRET123',
  ),
  verifySync: jest.fn(({ token }: { token: string }) => ({
    valid: token === '123456',
    delta: token === '123456' ? 0 : null,
  })),
}));

describe('AuthService', () => {
  let service: AuthService;
  let _prisma: jest.Mocked<PrismaService>;
  let _jwtService: jest.Mocked<JwtService>;
  let _loginThrottler: jest.Mocked<LoginThrottlerService>;
  let _notificationsService: jest.Mocked<NotificationsService>;
  let _turnstileService: jest.Mocked<TurnstileService>;
  let _twoFactorService: jest.Mocked<TwoFactorService>;

  const mockPrismaService = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    emailVerificationCode: {
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    passwordResetToken: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    refreshToken: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
  };

  const mockNotificationsService = {
    sendEmailVerificationCode: jest.fn().mockResolvedValue(true),
    sendWelcomeEmail: jest.fn().mockResolvedValue(true),
    sendTwoFactorEnabledNotification: jest.fn().mockResolvedValue(true),
    sendTwoFactorDisabledNotification: jest.fn().mockResolvedValue(true),
    sendTwoFactorRecoveryCodeUsedNotification: jest
      .fn()
      .mockResolvedValue(true),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
    sendPasswordResetConfirmationEmail: jest.fn().mockResolvedValue(true),
    create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
  };

  const mockActivityService = {
    logUserRegistered: jest.fn().mockResolvedValue({ id: 'activity-1' }),
    logUserLoggedIn: jest.fn().mockResolvedValue({ id: 'activity-2' }),
    logPasswordChanged: jest.fn().mockResolvedValue({ id: 'activity-2b' }),
    logTwoFactorEnabled: jest.fn().mockResolvedValue({ id: 'activity-3' }),
    logTwoFactorDisabled: jest.fn().mockResolvedValue({ id: 'activity-4' }),
    logTwoFactorRecoveryCodeUsed: jest
      .fn()
      .mockResolvedValue({ id: 'activity-5' }),
    logTwoFactorCodeRejected: jest.fn().mockResolvedValue({ id: 'activity-6' }),
    logTwoFactorRecoveryCodeRejected: jest
      .fn()
      .mockResolvedValue({ id: 'activity-7' }),
    logAuthCaptchaRejected: jest.fn().mockResolvedValue({ id: 'activity-8' }),
  };

  const mockLoginThrottler = {
    isBlocked: jest
      .fn()
      .mockReturnValue({ blocked: false, remainingMs: 0, retryAfter: null }),
    recordFailedAttempt: jest
      .fn()
      .mockReturnValue({ remainingAttempts: 4, blocked: false }),
    clearAttempts: jest.fn(),
  };

  const mockSocialPromotionsService = {
    recordRegistrationAttribution: jest.fn().mockResolvedValue(undefined),
  };

  const mockTurnstileService = {
    assertHuman: jest.fn().mockResolvedValue(undefined),
  };

  const mockTwoFactorService = {
    createSetup: jest.fn(),
    validateSetupToken: jest.fn(),
    createChallengeToken: jest.fn(),
    validateChallengeToken: jest.fn(),
    encryptSecret: jest.fn(),
    decryptSecret: jest.fn(),
    verifyTotp: jest.fn(),
    generateRecoveryCodes: jest.fn(),
    hashRecoveryCodes: jest.fn(),
    consumeRecoveryCode: jest.fn(),
  };

  // Test user factory
  const createTestUser = (overrides = {}) => ({
    id: 'user-123',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    nombre: 'Test',
    apellido: 'User',
    fechaNacimiento: new Date('1990-01-01'),
    role: UserRole.USER,
    emailVerified: false,
    twoFactorEnabled: false,
    twoFactorEnabledAt: null,
    twoFactorSecretEncrypted: null,
    twoFactorRecoveryCodeHashes: null,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const hashRefreshToken = (value: string) =>
    crypto.createHash('sha256').update(value, 'utf8').digest('hex');

  const hashPasswordResetToken = (value: string) =>
    crypto.createHash('sha256').update(value, 'utf8').digest('hex');

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock bcrypt
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    mockLoginThrottler.isBlocked.mockReturnValue({
      blocked: false,
      remainingMs: 0,
      retryAfter: null,
    });
    mockLoginThrottler.recordFailedAttempt.mockReturnValue({
      remainingAttempts: 4,
      blocked: false,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: ActivityService, useValue: mockActivityService },
        { provide: LoginThrottlerService, useValue: mockLoginThrottler },
        {
          provide: SocialPromotionsService,
          useValue: mockSocialPromotionsService,
        },
        { provide: TurnstileService, useValue: mockTurnstileService },
        { provide: TwoFactorService, useValue: mockTwoFactorService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    _prisma = module.get(PrismaService);
    _jwtService = module.get(JwtService);
    _loginThrottler = module.get(LoginThrottlerService);
    _notificationsService = module.get(NotificationsService);
    _turnstileService = module.get(TurnstileService);
    _twoFactorService = module.get(TwoFactorService);
  });

  describe('register', () => {
    const validInput = {
      email: 'new@example.com',
      password: 'Password123!',
      nombre: 'New',
      apellido: 'User',
      fechaNacimiento: '1990-01-01',
      acceptTerms: true,
      captchaToken: 'captcha-token',
    };

    it('should register a new user successfully', async () => {
      const newUser = createTestUser({ email: validInput.email });
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(newUser);
      mockPrismaService.emailVerificationCode.create.mockResolvedValue({
        id: 'code-1',
        code: '123456',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      const result = await service.register(validInput);

      expect(result.user).toBeDefined();
      expect(result.requiresVerification).toBe(true);
      expect(result.message).toContain('Verificá tu email');
      expect(_turnstileService.assertHuman).toHaveBeenCalledWith(
        'captcha-token',
        undefined,
        'register',
      );
      expect(mockPrismaService.user.create).toHaveBeenCalled();
      expect(
        mockNotificationsService.sendEmailVerificationCode,
      ).toHaveBeenCalled();
    });

    it('should reject registration when captcha validation fails', async () => {
      mockTurnstileService.assertHuman.mockRejectedValueOnce(
        new UnauthorizedException(
          'No pudimos validar que sos humano. Intentá nuevamente.',
        ),
      );

      await expect(service.register(validInput)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPrismaService.user.findUnique).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if email already exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(createTestUser());

      await expect(service.register(validInput)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.register(validInput)).rejects.toThrow(
        'Email already registered',
      );
    });

    it('should throw ConflictException if terms not accepted', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      const inputWithoutTerms = { ...validInput, acceptTerms: false };

      await expect(service.register(inputWithoutTerms)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.register(inputWithoutTerms)).rejects.toThrow(
        'términos y condiciones',
      );
    });

    it('should throw ConflictException if user is under 18', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      const today = new Date();
      const underageDate = new Date(
        today.getFullYear() - 17,
        today.getMonth(),
        today.getDate(),
      );
      const inputUnderage = {
        ...validInput,
        fechaNacimiento: underageDate.toISOString(),
      };

      await expect(service.register(inputUnderage)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.register(inputUnderage)).rejects.toThrow(
        'mayor de 18 años',
      );
    });

    it('should hash the password before storing', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(createTestUser());
      mockPrismaService.emailVerificationCode.create.mockResolvedValue({
        id: 'code-1',
        code: '123456',
        expiresAt: new Date(),
      });

      await service.register(validInput);

      expect(bcrypt.hash).toHaveBeenCalledWith(validInput.password, 10);
      expect(mockPrismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passwordHash: 'hashed-password',
          }),
        }),
      );
    });

    it('should ignore optional promotion token in registration input flow', async () => {
      const inputWithPromotion = { ...validInput, promotionToken: 'promo-123' };
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(createTestUser());
      mockPrismaService.emailVerificationCode.create.mockResolvedValue({
        id: 'code-1',
        code: '123456',
        expiresAt: new Date(),
      });

      const result = await service.register(inputWithPromotion);

      expect(result.requiresVerification).toBe(true);
    });
  });

  describe('verifyEmail', () => {
    const userId = 'user-123';
    const code = '123456';

    it('should verify email successfully with valid code', async () => {
      const user = createTestUser({ emailVerified: false });
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPrismaService.emailVerificationCode.findFirst.mockResolvedValue({
        id: 'code-1',
        userId,
        code,
        isUsed: false,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      mockPrismaService.$transaction.mockResolvedValue([{}, {}]);
      mockPrismaService.refreshToken.create.mockResolvedValue({
        token: 'refresh-token',
      });

      const result = await service.verifyEmail(userId, code);

      expect(result.token).toBe('mock-jwt-token');
      expect(result.refreshToken).toBeDefined();
      expect(result.user.emailVerified).toBe(true);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.verifyEmail(userId, code)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.verifyEmail(userId, code)).rejects.toThrow(
        'Usuario no encontrado',
      );
    });

    it('should throw ConflictException if email already verified', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        createTestUser({ emailVerified: true }),
      );

      await expect(service.verifyEmail(userId, code)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.verifyEmail(userId, code)).rejects.toThrow(
        'Email ya verificado',
      );
    });

    it('should throw UnauthorizedException for invalid code', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(createTestUser());
      mockPrismaService.emailVerificationCode.findFirst.mockResolvedValue(null);
      mockPrismaService.emailVerificationCode.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaService.emailVerificationCode.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ attempts: 1, maxAttempts: 3 });

      await expect(service.verifyEmail(userId, 'wrong-code')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.verifyEmail(userId, 'wrong-code')).rejects.toThrow(
        'Código inválido o expirado',
      );
    });

    it('should throw UnauthorizedException when max attempts exceeded', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(createTestUser());
      // First call returns null (code not found), second call returns code with max attempts
      mockPrismaService.emailVerificationCode.findFirst
        .mockResolvedValueOnce(null) // First call: looking for valid code
        .mockResolvedValueOnce({ id: 'code-1', attempts: 3, maxAttempts: 3 }); // Second call: checking attempts
      mockPrismaService.emailVerificationCode.updateMany.mockResolvedValue({
        count: 1,
      });

      await expect(service.verifyEmail(userId, 'wrong-code')).rejects.toThrow(
        UnauthorizedException,
      );
      // Clear the mock for the second assertion call
      mockPrismaService.emailVerificationCode.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'code-1', attempts: 3, maxAttempts: 3 });
      await expect(service.verifyEmail(userId, 'wrong-code')).rejects.toThrow(
        'Demasiados intentos',
      );
    });

    it('should record promotion attribution when a promotion token is provided', async () => {
      const user = createTestUser();
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPrismaService.emailVerificationCode.findFirst.mockResolvedValue({
        id: 'code-1',
        userId,
        code,
        isUsed: false,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      mockPrismaService.$transaction.mockResolvedValue([{}, {}]);
      mockPrismaService.refreshToken.create.mockResolvedValue({
        token: 'refresh-token',
      });

      await service.verifyEmail(userId, code, 'promo-123');

      expect(
        mockSocialPromotionsService.recordRegistrationAttribution,
      ).toHaveBeenCalledWith(userId, 'promo-123');
    });
  });

  describe('resendVerificationCode', () => {
    const userId = 'user-123';

    it('should resend verification code successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(createTestUser());
      mockPrismaService.emailVerificationCode.count.mockResolvedValue(0);
      mockPrismaService.emailVerificationCode.updateMany.mockResolvedValue({
        count: 0,
      });
      mockPrismaService.emailVerificationCode.create.mockResolvedValue({
        id: 'code-2',
        code: '654321',
        expiresAt: new Date(),
      });

      const result = await service.resendVerificationCode(userId);

      expect(result).toBe(true);
      expect(
        mockNotificationsService.sendEmailVerificationCode,
      ).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.resendVerificationCode(userId)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw ConflictException if email already verified', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        createTestUser({ emailVerified: true }),
      );

      await expect(service.resendVerificationCode(userId)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.resendVerificationCode(userId)).rejects.toThrow(
        'Email ya verificado',
      );
    });

    it('should throw ConflictException if rate limit exceeded (3 codes/hour)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(createTestUser());
      mockPrismaService.emailVerificationCode.count.mockResolvedValue(3);

      await expect(service.resendVerificationCode(userId)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.resendVerificationCode(userId)).rejects.toThrow(
        'Demasiados intentos',
      );
    });

    it('should invalidate old codes before creating new one', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(createTestUser());
      mockPrismaService.emailVerificationCode.count.mockResolvedValue(1);
      mockPrismaService.emailVerificationCode.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaService.emailVerificationCode.create.mockResolvedValue({
        id: 'code-2',
        code: '654321',
        expiresAt: new Date(),
      });

      await service.resendVerificationCode(userId);

      expect(
        mockPrismaService.emailVerificationCode.updateMany,
      ).toHaveBeenCalledWith({
        where: { userId, isUsed: false },
        data: { isUsed: true },
      });
    });
  });

  describe('requestPasswordReset', () => {
    it('should create a password reset token and send the reset email for eligible users', async () => {
      const eligibleUser = createTestUser({
        email: 'test@example.com',
        emailVerified: true,
        passwordHash: 'hashed-password',
      });
      const rawResetToken = '0123456789abcdef0123456789abcdef';
      const randomBytesSpy = jest
        .spyOn(crypto, 'randomBytes')
        .mockImplementation((() => Buffer.from(rawResetToken, 'hex')) as never);

      mockPrismaService.user.findFirst.mockResolvedValue(eligibleUser);
      mockPrismaService.passwordResetToken.count.mockResolvedValue(0);
      mockPrismaService.passwordResetToken.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaService.passwordResetToken.create.mockResolvedValue({
        id: 'reset-1',
      });

      const result = await service.requestPasswordReset(
        {
          email: ' TEST@example.com ',
          captchaToken: 'captcha-token',
        },
        '192.168.1.10',
      );

      expect(result).toBe(true);
      expect(_turnstileService.assertHuman).toHaveBeenCalledWith(
        'captcha-token',
        '192.168.1.10',
        'password_reset',
      );
      expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith({
        where: {
          email: {
            equals: 'test@example.com',
            mode: 'insensitive',
          },
        },
      });
      expect(
        mockPrismaService.passwordResetToken.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          userId: eligibleUser.id,
          usedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        data: {
          usedAt: expect.any(Date),
        },
      });
      expect(mockPrismaService.passwordResetToken.create).toHaveBeenCalledWith({
        data: {
          userId: eligibleUser.id,
          tokenHash: hashPasswordResetToken(rawResetToken),
          expiresAt: expect.any(Date),
        },
      });
      expect(
        mockNotificationsService.sendPasswordResetEmail,
      ).toHaveBeenCalledWith('test@example.com', {
        userName: 'Test',
        resetToken: rawResetToken,
        expiresInMinutes: 30,
      });
      randomBytesSpy.mockRestore();
    });

    it('should return true without creating tokens for unknown emails', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      const result = await service.requestPasswordReset({
        email: 'missing@example.com',
      });

      expect(result).toBe(true);
      expect(
        mockPrismaService.passwordResetToken.create,
      ).not.toHaveBeenCalled();
      expect(
        mockNotificationsService.sendPasswordResetEmail,
      ).not.toHaveBeenCalled();
    });

    it('should return true without sending email for Google-only accounts', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(
        createTestUser({
          googleId: 'google-123',
          passwordHash: null,
        }),
      );

      const result = await service.requestPasswordReset({
        email: 'google@example.com',
      });

      expect(result).toBe(true);
      expect(
        mockPrismaService.passwordResetToken.create,
      ).not.toHaveBeenCalled();
      expect(
        mockNotificationsService.sendPasswordResetEmail,
      ).not.toHaveBeenCalled();
    });

    it('should return true and skip a new email when the hourly rate limit is exceeded', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(createTestUser());
      mockPrismaService.passwordResetToken.count.mockResolvedValue(3);

      const result = await service.requestPasswordReset({
        email: 'test@example.com',
      });

      expect(result).toBe(true);
      expect(
        mockPrismaService.passwordResetToken.create,
      ).not.toHaveBeenCalled();
      expect(
        mockNotificationsService.sendPasswordResetEmail,
      ).not.toHaveBeenCalled();
    });

    it('should reject password reset requests when captcha validation fails', async () => {
      mockTurnstileService.assertHuman.mockRejectedValueOnce(
        new UnauthorizedException(
          'No pudimos validar que sos humano. Intentá nuevamente.',
        ),
      );

      await expect(
        service.requestPasswordReset(
          { email: 'test@example.com', captchaToken: 'captcha-token' },
          '127.0.0.1',
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockPrismaService.user.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('isPasswordResetTokenValid', () => {
    it('should return true for active reset tokens', async () => {
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue({
        id: 'reset-1',
      });

      await expect(
        service.isPasswordResetTokenValid('reset-token'),
      ).resolves.toBe(true);
      expect(
        mockPrismaService.passwordResetToken.findFirst,
      ).toHaveBeenCalledWith({
        where: {
          tokenHash: hashPasswordResetToken('reset-token'),
          usedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        select: { id: true },
      });
    });

    it('should return false for blank or expired reset tokens', async () => {
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue(null);

      await expect(service.isPasswordResetTokenValid('')).resolves.toBe(false);
      await expect(
        service.isPasswordResetTokenValid('expired-token'),
      ).resolves.toBe(false);
    });
  });

  describe('resetPassword', () => {
    it('should update the password, consume the token, revoke sessions, and send confirmation', async () => {
      const resetTokenValue = 'reset-token-value';
      const resetTokenRecord = {
        id: 'reset-1',
        userId: 'user-123',
        tokenHash: hashPasswordResetToken(resetTokenValue),
        usedAt: null,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        user: createTestUser({
          emailVerified: false,
          passwordHash: 'hashed-password',
        }),
      };
      const revokeAllSpy = jest
        .spyOn(service, 'revokeAllUserRefreshTokens')
        .mockResolvedValue(undefined);

      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue(
        resetTokenRecord,
      );
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-new-password');
      mockPrismaService.user.update.mockResolvedValue({
        ...resetTokenRecord.user,
        passwordHash: 'hashed-new-password',
      });
      mockPrismaService.passwordResetToken.update.mockResolvedValue({
        ...resetTokenRecord,
        usedAt: new Date(),
      });

      const result = await service.resetPassword({
        token: resetTokenValue,
        newPassword: 'NewPassword123',
      });

      expect(result).toBe(true);
      expect(bcrypt.hash).toHaveBeenCalledWith('NewPassword123', 10);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { passwordHash: 'hashed-new-password' },
      });
      expect(mockPrismaService.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'reset-1' },
        data: { usedAt: expect.any(Date) },
      });
      expect(revokeAllSpy).toHaveBeenCalledWith('user-123');
      expect(mockActivityService.logPasswordChanged).toHaveBeenCalledWith(
        'user-123',
        'reset',
      );
      expect(
        mockNotificationsService.sendPasswordResetConfirmationEmail,
      ).toHaveBeenCalledWith('test@example.com', { userName: 'Test' });
    });

    it('should reject invalid, expired, or previously used reset tokens', async () => {
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue(null);

      await expect(
        service.resetPassword({
          token: 'invalid-token',
          newPassword: 'NewPassword123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject weak new passwords', async () => {
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue({
        id: 'reset-1',
        userId: 'user-123',
        tokenHash: hashPasswordResetToken('reset-token-value'),
        usedAt: null,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        user: createTestUser({
          emailVerified: true,
          passwordHash: 'hashed-password',
        }),
      });

      await expect(
        service.resetPassword({
          token: 'reset-token-value',
          newPassword: 'weakpass',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const loginInput = {
      email: 'test@example.com',
      password: 'Password123!',
      captchaToken: 'captcha-token',
    };

    it('should login successfully with valid credentials', async () => {
      const user = createTestUser({
        passwordHash: 'hashed-password',
        emailVerified: true,
      });
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPrismaService.refreshToken.create.mockResolvedValue({
        token: 'refresh-token',
      });

      const result = await service.login(loginInput);

      expect(result.token).toBe('mock-jwt-token');
      expect(result.refreshToken).toBeDefined();
      expect(result.user.id).toBe(user.id);
      expect(result.requiresVerification).toBe(false);
      expect(result.requiresTwoFactor).toBe(false);
      expect(_turnstileService.assertHuman).toHaveBeenCalledWith(
        'captcha-token',
        undefined,
        'login',
      );
    });

    it('should require email verification for valid credentials on unverified users', async () => {
      const user = createTestUser({ passwordHash: 'hashed-password' });
      mockPrismaService.user.findUnique.mockResolvedValue(user);

      const result = await service.login(loginInput, '192.168.1.1');

      expect(result).toEqual(
        expect.objectContaining({
          user,
          requiresVerification: true,
          requiresTwoFactor: false,
          message: expect.stringContaining('todavía no está verificado'),
        }),
      );
      expect(result.token).toBeUndefined();
      expect(result.refreshToken).toBeUndefined();
      expect(mockLoginThrottler.clearAttempts).toHaveBeenCalledWith(
        '192.168.1.1',
      );
      expect(mockLoginThrottler.recordFailedAttempt).not.toHaveBeenCalled();
      expect(mockPrismaService.refreshToken.create).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginInput)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginInput)).rejects.toThrow(
        'Invalid credentials',
      );
    });

    it('should throw UnauthorizedException for deleted user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        createTestUser({ isDeleted: true }),
      );

      await expect(service.login(loginInput)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginInput)).rejects.toThrow(
        'Account has been deleted',
      );
    });

    it('should throw UnauthorizedException for banned user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        createTestUser({ role: UserRole.BANNED }),
      );

      await expect(service.login(loginInput)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginInput)).rejects.toThrow(
        'Account has been banned',
      );
    });

    it('should throw UnauthorizedException for OAuth user without password', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        createTestUser({ passwordHash: null }),
      );

      await expect(service.login(loginInput)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginInput)).rejects.toThrow(
        'Please login with Google',
      );
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(createTestUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginInput)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginInput)).rejects.toThrow(
        'Invalid credentials',
      );
      expect(mockActivityService.logAuthCaptchaRejected).not.toHaveBeenCalled();
      expect(
        mockActivityService.logTwoFactorCodeRejected,
      ).not.toHaveBeenCalled();
      expect(
        mockActivityService.logTwoFactorRecoveryCodeRejected,
      ).not.toHaveBeenCalled();
    });

    it('should record failed attempt and block IP after max attempts', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockLoginThrottler.recordFailedAttempt.mockReturnValue({
        remainingAttempts: null,
        blocked: true,
      });

      await expect(service.login(loginInput, '192.168.1.1')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginInput, '192.168.1.1')).rejects.toThrow(
        'IP ha sido bloqueada',
      );
    });

    it('should reject login when captcha validation fails', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(createTestUser());
      mockTurnstileService.assertHuman.mockRejectedValueOnce(
        new UnauthorizedException(
          'No pudimos validar que sos humano. Intentá nuevamente.',
        ),
      );

      await expect(service.login(loginInput, '192.168.1.1')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: loginInput.email },
        select: { id: true },
      });
      expect(mockActivityService.logAuthCaptchaRejected).toHaveBeenCalledWith(
        'user-123',
        'login',
        '192.168.1.1',
      );
    });

    it('should not persist captcha rejection when the login email is unknown', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockTurnstileService.assertHuman.mockRejectedValueOnce(
        new UnauthorizedException(
          'No pudimos validar que sos humano. Intentá nuevamente.',
        ),
      );

      await expect(service.login(loginInput, '192.168.1.1')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockActivityService.logAuthCaptchaRejected).not.toHaveBeenCalled();
    });

    it('should clear failed attempts on successful login', async () => {
      const user = createTestUser({ emailVerified: true });
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPrismaService.refreshToken.create.mockResolvedValue({
        token: 'refresh-token',
      });

      await service.login(loginInput, '192.168.1.1');

      expect(mockLoginThrottler.clearAttempts).toHaveBeenCalledWith(
        '192.168.1.1',
      );
    });

    it('should log login activity', async () => {
      const user = createTestUser({ emailVerified: true });
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPrismaService.refreshToken.create.mockResolvedValue({
        token: 'refresh-token',
      });

      await service.login(loginInput, '192.168.1.1');

      expect(mockActivityService.logUserLoggedIn).toHaveBeenCalledWith(
        user.id,
        'email',
        '192.168.1.1',
      );
      expect(
        mockNotificationsService.sendTwoFactorRecoveryCodeUsedNotification,
      ).not.toHaveBeenCalled();
    });

    it('should not fail login when activity logging fails', async () => {
      const user = createTestUser({ emailVerified: true });
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPrismaService.refreshToken.create.mockResolvedValue({
        token: 'refresh-token',
      });
      mockActivityService.logUserLoggedIn.mockRejectedValueOnce(
        new Error('activity failed'),
      );

      const result = await service.login(loginInput, '192.168.1.1');

      expect(result.token).toBe('mock-jwt-token');
    });

    it('should require two-factor login when the user has 2FA enabled', async () => {
      const user = createTestUser({
        emailVerified: true,
        twoFactorEnabled: true,
      });
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockTwoFactorService.createChallengeToken.mockReturnValue(
        'challenge-token',
      );

      const result = await service.login(loginInput, '192.168.1.1');

      expect(result).toEqual(
        expect.objectContaining({
          user,
          requiresVerification: false,
          requiresTwoFactor: true,
          twoFactorChallengeToken: 'challenge-token',
        }),
      );
      expect(mockPrismaService.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  describe('beginTwoFactorSetup', () => {
    it('should create a 2FA setup payload for password users', async () => {
      const user = createTestUser({
        emailVerified: true,
        passwordHash: 'hashed-password',
      });
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockTwoFactorService.createSetup.mockResolvedValue({
        setupToken: 'setup-token',
        manualEntryKey: 'ABC123',
        otpauthUrl: 'otpauth://totp/LUK:test@example.com',
        qrCodeDataUrl: 'data:image/png;base64,qr',
      });

      const result = await service.beginTwoFactorSetup(user.id, 'Password123!');

      expect(result.setupToken).toBe('setup-token');
      expect(mockTwoFactorService.createSetup).toHaveBeenCalledWith(user);
    });

    it('should reject Google-only users without password', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        createTestUser({ passwordHash: null, emailVerified: true }),
      );

      await expect(
        service.beginTwoFactorSetup('user-123', 'irrelevant'),
      ).rejects.toThrow('Tu cuenta usa Google');
    });
  });

  describe('enableTwoFactor', () => {
    it('should enable two-factor and return recovery codes', async () => {
      const user = createTestUser({ emailVerified: true });
      const updatedUser = createTestUser({
        emailVerified: true,
        twoFactorEnabled: true,
        twoFactorEnabledAt: new Date(),
      });
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockTwoFactorService.validateSetupToken.mockReturnValue({
        userId: user.id,
        email: user.email,
        secret: 'SECRET123',
      });
      mockTwoFactorService.verifyTotp.mockReturnValue(true);
      mockTwoFactorService.generateRecoveryCodes.mockReturnValue([
        'ABCD-1234',
        'EFGH-5678',
      ]);
      mockTwoFactorService.hashRecoveryCodes.mockReturnValue([
        'hash-1',
        'hash-2',
      ]);
      mockTwoFactorService.encryptSecret.mockReturnValue('encrypted-secret');
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.enableTwoFactor(
        user.id,
        'setup-token',
        '123456',
      );

      expect(result.recoveryCodes).toEqual(['ABCD-1234', 'EFGH-5678']);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            twoFactorEnabled: true,
            twoFactorSecretEncrypted: 'encrypted-secret',
          }),
        }),
      );
      expect(mockActivityService.logTwoFactorEnabled).toHaveBeenCalledWith(
        user.id,
      );
      expect(
        mockNotificationsService.sendTwoFactorEnabledNotification,
      ).toHaveBeenCalledWith(user.email, {
        userName: user.nombre,
      });
      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        user.id,
        'SECURITY',
        '2FA activado',
        expect.stringContaining('autenticación en dos pasos ya está activa'),
        '/dashboard/settings',
      );
    });

    it('should reject invalid TOTP codes during activation', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        createTestUser({ emailVerified: true }),
      );
      mockTwoFactorService.validateSetupToken.mockReturnValue({
        userId: 'user-123',
        email: 'test@example.com',
        secret: 'SECRET123',
      });
      mockTwoFactorService.verifyTotp.mockReturnValue(false);

      await expect(
        service.enableTwoFactor('user-123', 'setup-token', '123456'),
      ).rejects.toThrow('código de autenticación es inválido');
    });

    it('should keep 2FA activation successful when security notifications fail', async () => {
      const user = createTestUser({ emailVerified: true });
      const updatedUser = createTestUser({
        emailVerified: true,
        twoFactorEnabled: true,
        twoFactorEnabledAt: new Date(),
      });
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockTwoFactorService.validateSetupToken.mockReturnValue({
        userId: user.id,
        email: user.email,
        secret: 'SECRET123',
      });
      mockTwoFactorService.verifyTotp.mockReturnValue(true);
      mockTwoFactorService.generateRecoveryCodes.mockReturnValue(['ABCD-1234']);
      mockTwoFactorService.hashRecoveryCodes.mockReturnValue(['hash-1']);
      mockTwoFactorService.encryptSecret.mockReturnValue('encrypted-secret');
      mockPrismaService.user.update.mockResolvedValue(updatedUser);
      mockNotificationsService.sendTwoFactorEnabledNotification.mockRejectedValueOnce(
        new Error('email failed'),
      );

      await expect(
        service.enableTwoFactor(user.id, 'setup-token', '123456'),
      ).resolves.toEqual({
        user: updatedUser,
        recoveryCodes: ['ABCD-1234'],
      });
    });
  });

  describe('completeTwoFactorLogin', () => {
    it('should complete login with a valid TOTP code', async () => {
      const user = createTestUser({
        emailVerified: true,
        twoFactorEnabled: true,
        twoFactorSecretEncrypted: 'encrypted-secret',
      });
      mockTwoFactorService.validateChallengeToken.mockReturnValue({
        userId: user.id,
      });
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockTwoFactorService.decryptSecret.mockReturnValue('SECRET123');
      mockTwoFactorService.verifyTotp.mockReturnValue(true);
      mockPrismaService.refreshToken.create.mockResolvedValue({
        token: 'refresh-token',
      });

      const result = await service.completeTwoFactorLogin(
        'challenge-token',
        '123456',
        undefined,
        '192.168.1.1',
      );

      expect(result.token).toBe('mock-jwt-token');
      expect(mockLoginThrottler.clearAttempts).toHaveBeenCalledWith(
        '192.168.1.1',
      );
      expect(mockActivityService.logUserLoggedIn).toHaveBeenCalledWith(
        user.id,
        'email',
        '192.168.1.1',
      );
    });

    it('should consume a recovery code only once', async () => {
      const user = createTestUser({
        emailVerified: true,
        twoFactorEnabled: true,
        twoFactorSecretEncrypted: 'encrypted-secret',
        twoFactorRecoveryCodeHashes: ['hash-1', 'hash-2'],
      });
      mockTwoFactorService.validateChallengeToken.mockReturnValue({
        userId: user.id,
      });
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockTwoFactorService.decryptSecret.mockReturnValue('SECRET123');
      mockTwoFactorService.consumeRecoveryCode.mockReturnValue({
        matched: true,
        remainingHashes: ['hash-2'],
      });
      mockPrismaService.user.update.mockResolvedValue(user);
      mockPrismaService.refreshToken.create.mockResolvedValue({
        token: 'refresh-token',
      });

      await service.completeTwoFactorLogin(
        'challenge-token',
        undefined,
        'ABCD-1234',
        '192.168.1.1',
      );

      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            twoFactorRecoveryCodeHashes: ['hash-2'],
          }),
        }),
      );
      expect(
        mockActivityService.logTwoFactorRecoveryCodeUsed,
      ).toHaveBeenCalledWith(user.id, 1, '192.168.1.1');
      expect(
        mockNotificationsService.sendTwoFactorRecoveryCodeUsedNotification,
      ).toHaveBeenCalledWith(user.email, {
        userName: user.nombre,
        remainingRecoveryCodesCount: 1,
      });
      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        user.id,
        'SECURITY',
        'Usaste un código de recuperación',
        expect.stringContaining('Te queda 1 código de recuperación.'),
        '/dashboard/settings',
      );
    });

    it('should persist rejected TOTP attempts during 2FA login', async () => {
      const user = createTestUser({
        emailVerified: true,
        twoFactorEnabled: true,
        twoFactorSecretEncrypted: 'encrypted-secret',
      });
      mockTwoFactorService.validateChallengeToken.mockReturnValue({
        userId: user.id,
      });
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockTwoFactorService.decryptSecret.mockReturnValue('SECRET123');
      mockTwoFactorService.verifyTotp.mockReturnValue(false);

      await expect(
        service.completeTwoFactorLogin(
          'challenge-token',
          '999999',
          undefined,
          '192.168.1.1',
        ),
      ).rejects.toThrow('El código de autenticación es inválido.');

      expect(mockActivityService.logTwoFactorCodeRejected).toHaveBeenCalledWith(
        user.id,
        'login',
        '192.168.1.1',
      );
    });

    it('should persist rejected recovery codes during 2FA login', async () => {
      const user = createTestUser({
        emailVerified: true,
        twoFactorEnabled: true,
        twoFactorSecretEncrypted: 'encrypted-secret',
        twoFactorRecoveryCodeHashes: ['hash-1', 'hash-2'],
      });
      mockTwoFactorService.validateChallengeToken.mockReturnValue({
        userId: user.id,
      });
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockTwoFactorService.decryptSecret.mockReturnValue('SECRET123');
      mockTwoFactorService.consumeRecoveryCode.mockReturnValue({
        matched: false,
        remainingHashes: ['hash-1', 'hash-2'],
      });

      await expect(
        service.completeTwoFactorLogin(
          'challenge-token',
          undefined,
          'WRONG-0000',
          '192.168.1.1',
        ),
      ).rejects.toThrow('El código de recuperación es inválido.');

      expect(
        mockActivityService.logTwoFactorRecoveryCodeRejected,
      ).toHaveBeenCalledWith(user.id, 'login', '192.168.1.1');
    });
  });

  describe('disableTwoFactor', () => {
    it('should disable two-factor with current password and TOTP code', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        createTestUser({
          emailVerified: true,
          twoFactorEnabled: true,
          twoFactorSecretEncrypted: 'encrypted-secret',
        }),
      );
      mockTwoFactorService.decryptSecret.mockReturnValue('SECRET123');
      mockTwoFactorService.verifyTotp.mockReturnValue(true);
      mockPrismaService.user.update.mockResolvedValue(createTestUser());

      await expect(
        service.disableTwoFactor('user-123', 'Password123!', '123456'),
      ).resolves.toBe(true);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            twoFactorEnabled: false,
            twoFactorSecretEncrypted: null,
          }),
        }),
      );
      expect(mockActivityService.logTwoFactorDisabled).toHaveBeenCalledWith(
        'user-123',
        'totp',
      );
      expect(
        mockNotificationsService.sendTwoFactorDisabledNotification,
      ).toHaveBeenCalledWith('test@example.com', {
        userName: 'Test',
      });
      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        'user-123',
        'SECURITY',
        '2FA desactivado',
        expect.stringContaining('autenticación en dos pasos fue desactivada'),
        '/dashboard/settings',
      );
    });

    it('should persist rejected TOTP attempts during 2FA disable', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        createTestUser({
          emailVerified: true,
          twoFactorEnabled: true,
          twoFactorSecretEncrypted: 'encrypted-secret',
        }),
      );
      mockTwoFactorService.decryptSecret.mockReturnValue('SECRET123');
      mockTwoFactorService.verifyTotp.mockReturnValue(false);

      await expect(
        service.disableTwoFactor('user-123', 'Password123!', '999999'),
      ).rejects.toThrow('El código de autenticación es inválido.');

      expect(mockActivityService.logTwoFactorCodeRejected).toHaveBeenCalledWith(
        'user-123',
        'disable',
      );
    });

    it('should persist rejected recovery codes during 2FA disable', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        createTestUser({
          emailVerified: true,
          twoFactorEnabled: true,
          twoFactorSecretEncrypted: 'encrypted-secret',
          twoFactorRecoveryCodeHashes: ['hash-1'],
        }),
      );
      mockTwoFactorService.decryptSecret.mockReturnValue('SECRET123');
      mockTwoFactorService.consumeRecoveryCode.mockReturnValue({
        matched: false,
        remainingHashes: ['hash-1'],
      });

      await expect(
        service.disableTwoFactor(
          'user-123',
          'Password123!',
          undefined,
          'WRONG-0000',
        ),
      ).rejects.toThrow('El código de recuperación es inválido.');

      expect(
        mockActivityService.logTwoFactorRecoveryCodeRejected,
      ).toHaveBeenCalledWith('user-123', 'disable');
    });

    it('should keep 2FA disable successful when security notifications fail', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        createTestUser({
          emailVerified: true,
          twoFactorEnabled: true,
          twoFactorSecretEncrypted: 'encrypted-secret',
        }),
      );
      mockTwoFactorService.decryptSecret.mockReturnValue('SECRET123');
      mockTwoFactorService.verifyTotp.mockReturnValue(true);
      mockPrismaService.user.update.mockResolvedValue(createTestUser());
      mockNotificationsService.sendTwoFactorDisabledNotification.mockRejectedValueOnce(
        new Error('email failed'),
      );

      await expect(
        service.disableTwoFactor('user-123', 'Password123!', '123456'),
      ).resolves.toBe(true);
    });
  });

  describe('validateUser', () => {
    it('should return user for valid active user', async () => {
      const user = createTestUser();
      mockPrismaService.user.findUnique.mockResolvedValue(user);

      const result = await service.validateUser(user.id);

      expect(result).toEqual(user);
    });

    it('should return null for non-existent user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser('non-existent');

      expect(result).toBeNull();
    });

    it('should return null for deleted user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        createTestUser({ isDeleted: true }),
      );

      const result = await service.validateUser('user-123');

      expect(result).toBeNull();
    });

    it('should return null for banned user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        createTestUser({ role: UserRole.BANNED }),
      );

      const result = await service.validateUser('user-123');

      expect(result).toBeNull();
    });
  });

  describe('generateTokenForUser', () => {
    it('should generate access and refresh tokens', async () => {
      const user = createTestUser({ emailVerified: true });
      mockPrismaService.refreshToken.create.mockResolvedValue({
        token: 'refresh-token',
      });

      const result = await service.generateTokenForUser(user);

      expect(result.token).toBe('mock-jwt-token');
      expect(result.refreshToken).toBeDefined();
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: user.id,
          email: user.email,
          role: user.role,
        }),
        expect.any(Object),
      );
      expect(mockActivityService.logUserLoggedIn).toHaveBeenCalledWith(
        user.id,
        'email',
        undefined,
      );
      expect(mockPrismaService.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: user.id,
          token: null,
          tokenHash: hashRefreshToken(result.refreshToken),
          expiresAt: expect.any(Date),
        }),
      });
    });

    it('should reject unverified users when generating tokens directly', async () => {
      const user = createTestUser({ emailVerified: false });

      await expect(service.generateTokenForUser(user)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.generateTokenForUser(user)).rejects.toThrow(
        'Email not verified',
      );
    });
  });

  describe('refreshAccessToken', () => {
    const refreshTokenValue = 'valid-refresh-token';
    const refreshTokenHash = hashRefreshToken(refreshTokenValue);

    it('should refresh token successfully with valid refresh token', async () => {
      const user = createTestUser({ emailVerified: true });
      mockPrismaService.refreshToken.findFirst.mockResolvedValue({
        id: 'token-1',
        token: null,
        tokenHash: refreshTokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: null,
        user,
      });
      mockPrismaService.refreshToken.update.mockResolvedValue({});
      mockPrismaService.refreshToken.create.mockResolvedValue({
        token: 'new-refresh-token',
      });

      const result = await service.refreshAccessToken(refreshTokenValue);

      expect(result.token).toBe('mock-jwt-token');
      expect(result.refreshToken).toBeDefined();
      expect(mockPrismaService.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'token-1' },
        data: {
          revokedAt: expect.any(Date),
          tokenHash: refreshTokenHash,
          token: null,
        },
      });
    });

    it('should throw UnauthorizedException for invalid refresh token', async () => {
      mockPrismaService.refreshToken.findFirst.mockResolvedValue(null);

      await expect(service.refreshAccessToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.refreshAccessToken('invalid-token')).rejects.toThrow(
        'Invalid refresh token',
      );
    });

    it('should throw UnauthorizedException for revoked token and revoke all user tokens (token theft detection)', async () => {
      const user = createTestUser();
      mockPrismaService.refreshToken.findFirst.mockResolvedValue({
        id: 'token-1',
        token: null,
        tokenHash: refreshTokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: new Date(), // Already revoked
        user,
      });
      mockPrismaService.refreshToken.findMany.mockResolvedValue([
        {
          id: 'token-2',
          token: 'legacy-refresh-token',
          tokenHash: null,
        },
      ]);
      mockPrismaService.refreshToken.update.mockResolvedValue({});
      mockPrismaService.$transaction.mockResolvedValue([{}]);

      await expect(
        service.refreshAccessToken(refreshTokenValue),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.refreshAccessToken(refreshTokenValue),
      ).rejects.toThrow('has been revoked');

      expect(mockPrismaService.refreshToken.findMany).toHaveBeenCalledWith({
        where: { userId: user.id, revokedAt: null },
        select: { id: true, token: true, tokenHash: true },
      });
      expect(mockPrismaService.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'token-2' },
        data: {
          revokedAt: expect.any(Date),
          token: null,
          tokenHash: hashRefreshToken('legacy-refresh-token'),
        },
      });
    });

    it('should throw UnauthorizedException for expired token', async () => {
      const user = createTestUser();
      mockPrismaService.refreshToken.findFirst.mockResolvedValue({
        id: 'token-1',
        token: null,
        tokenHash: refreshTokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() - 1000), // Expired
        revokedAt: null,
        user,
      });

      await expect(
        service.refreshAccessToken(refreshTokenValue),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.refreshAccessToken(refreshTokenValue),
      ).rejects.toThrow('has expired');
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      mockPrismaService.refreshToken.findFirst.mockResolvedValue({
        id: 'token-1',
        token: null,
        tokenHash: refreshTokenHash,
        userId: 'user-123',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: null,
        user: createTestUser({ isDeleted: true, emailVerified: true }),
      });

      await expect(
        service.refreshAccessToken(refreshTokenValue),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.refreshAccessToken(refreshTokenValue),
      ).rejects.toThrow('not active');
    });

    it('should implement token rotation (revoke old token)', async () => {
      const user = createTestUser({ emailVerified: true });
      mockPrismaService.refreshToken.findFirst.mockResolvedValue({
        id: 'token-1',
        token: null,
        tokenHash: refreshTokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: null,
        user,
      });
      mockPrismaService.refreshToken.update.mockResolvedValue({});
      mockPrismaService.refreshToken.create.mockResolvedValue({
        token: 'new-refresh-token',
      });

      await service.refreshAccessToken(refreshTokenValue);

      // Should revoke the old token
      expect(mockPrismaService.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'token-1' },
        data: {
          revokedAt: expect.any(Date),
          tokenHash: refreshTokenHash,
          token: null,
        },
      });
    });

    it('should reject refresh for unverified users', async () => {
      const user = createTestUser({ emailVerified: false });
      mockPrismaService.refreshToken.findFirst.mockResolvedValue({
        id: 'token-1',
        token: null,
        tokenHash: refreshTokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: null,
        user,
      });

      await expect(
        service.refreshAccessToken(refreshTokenValue),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.refreshAccessToken(refreshTokenValue),
      ).rejects.toThrow('Email not verified');
    });

    it('should accept legacy plaintext refresh tokens and migrate them on rotation', async () => {
      const user = createTestUser({ emailVerified: true });
      mockPrismaService.refreshToken.findFirst.mockResolvedValue({
        id: 'token-legacy',
        token: refreshTokenValue,
        tokenHash: null,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: null,
        user,
      });
      mockPrismaService.refreshToken.update.mockResolvedValue({});

      const result = await service.refreshAccessToken(refreshTokenValue);

      expect(result.refreshToken).toBeDefined();
      expect(mockPrismaService.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'token-legacy' },
        data: {
          revokedAt: expect.any(Date),
          tokenHash: refreshTokenHash,
          token: null,
        },
      });
    });
  });

  describe('revokeRefreshToken', () => {
    it('should revoke a specific refresh token', async () => {
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.revokeRefreshToken('token-to-revoke');

      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          revokedAt: null,
          OR: [
            { tokenHash: hashRefreshToken('token-to-revoke') },
            { token: 'token-to-revoke' },
          ],
        },
        data: {
          revokedAt: expect.any(Date),
          tokenHash: hashRefreshToken('token-to-revoke'),
          token: null,
        },
      });
    });
  });

  describe('revokeAllUserRefreshTokens', () => {
    it('should revoke all refresh tokens for a user and scrub legacy plaintext values', async () => {
      mockPrismaService.refreshToken.findMany.mockResolvedValue([
        {
          id: 'token-1',
          token: null,
          tokenHash: hashRefreshToken('already-hashed'),
        },
        {
          id: 'token-2',
          token: 'legacy-refresh-token',
          tokenHash: null,
        },
      ]);
      mockPrismaService.refreshToken.update.mockResolvedValue({});
      mockPrismaService.$transaction.mockResolvedValue([{}, {}]);

      await service.revokeAllUserRefreshTokens('user-123');

      expect(mockPrismaService.refreshToken.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123', revokedAt: null },
        select: { id: true, token: true, tokenHash: true },
      });
      expect(mockPrismaService.refreshToken.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'token-1' },
        data: {
          revokedAt: expect.any(Date),
          token: null,
          tokenHash: hashRefreshToken('already-hashed'),
        },
      });
      expect(mockPrismaService.refreshToken.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'token-2' },
        data: {
          revokedAt: expect.any(Date),
          token: null,
          tokenHash: hashRefreshToken('legacy-refresh-token'),
        },
      });
    });
  });

  describe('cleanupExpiredRefreshTokens', () => {
    it('should delete expired and revoked tokens', async () => {
      mockPrismaService.refreshToken.deleteMany.mockResolvedValue({
        count: 10,
      });

      const count = await service.cleanupExpiredRefreshTokens();

      expect(count).toBe(10);
      expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { expiresAt: { lt: expect.any(Date) } },
            { revokedAt: { not: null } },
          ],
        },
      });
    });
  });
});
