import { Test, TestingModule } from '@nestjs/testing';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { Response } from 'express';
import {
  UserRole,
  SellerPaymentAccountStatus,
  KycStatus,
} from '@prisma/client';
import { LoginThrottlerGuard } from '@/common/guards';

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

describe('AuthResolver', () => {
  let resolver: AuthResolver;

  let authService: any;

  let _usersService: any;

  const mockAuthService = {
    register: jest.fn(),
    verifyEmail: jest.fn(),
    resendVerificationCode: jest.fn(),
    requestPasswordReset: jest.fn(),
    isPasswordResetTokenValid: jest.fn(),
    resetPassword: jest.fn(),
    login: jest.fn(),
    beginTwoFactorSetup: jest.fn(),
    enableTwoFactor: jest.fn(),
    completeTwoFactorLogin: jest.fn(),
    disableTwoFactor: jest.fn(),
  };

  const mockUsersService = {
    getUserWithDecryptedPII: jest.fn(),
  };

  const mockResponse = () =>
    ({
      cookie: jest.fn(),
    }) as unknown as Response;

  const createTestUser = (overrides = {}) => ({
    id: 'user-1',
    email: 'test@example.com',
    nombre: 'Test',
    apellido: 'User',
    role: UserRole.USER,
    emailVerified: true,
    twoFactorEnabled: false,
    twoFactorEnabledAt: null,
    sellerPaymentAccountStatus: SellerPaymentAccountStatus.NOT_CONNECTED,
    kycStatus: KycStatus.NOT_SUBMITTED,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthResolver,
        { provide: AuthService, useValue: mockAuthService },
        { provide: UsersService, useValue: mockUsersService },
      ],
    })
      .overrideGuard(LoginThrottlerGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    resolver = module.get<AuthResolver>(AuthResolver);
    authService = module.get(AuthService);
    _usersService = module.get(UsersService);
  });

  describe('register', () => {
    it('should call auth service and return registration result', async () => {
      const input = {
        email: 'new@example.com',
        password: 'password123',
        nombre: 'New',
        apellido: 'User',
        fechaNacimiento: '1990-01-01',
        acceptTerms: true,
        captchaToken: 'captcha-token',
      };

      const expected = {
        user: createTestUser({
          email: 'new@example.com',
          emailVerified: false,
        }),
        requiresVerification: true,
        message: 'Verification code sent to email',
      };

      authService.register.mockResolvedValue(expected);

      const result = await resolver.register(input);

      expect(result).toEqual(expected);
      expect(authService.register).toHaveBeenCalledWith(input);
    });

    it('should not set cookies during registration', async () => {
      const input = {
        email: 'new@example.com',
        password: 'password123',
        nombre: 'New',
        apellido: 'User',
        fechaNacimiento: '1990-01-01',
        acceptTerms: true,
        captchaToken: 'captcha-token',
      };

      authService.register.mockResolvedValue({
        user: createTestUser(),
        requiresVerification: true,
      });

      // Registration doesn't receive context/response
      await resolver.register(input);

      // Verify no cookies are set (user must verify email first)
      expect(authService.register).toHaveBeenCalledTimes(1);
    });
  });

  describe('verifyEmail', () => {
    it('should verify email and set auth cookies', async () => {
      const userId = 'user-1';
      const code = '123456';
      const res = mockResponse();
      const context = { req: {}, res };

      const authPayload = {
        user: createTestUser(),
        token: 'access-token',
        refreshToken: 'refresh-token',
      };

      authService.verifyEmail.mockResolvedValue(authPayload);

      const result = await resolver.verifyEmail(userId, code, context);

      expect(result).toEqual({
        user: authPayload.user,
        token: authPayload.token,
      });
      expect(result).not.toHaveProperty('refreshToken');
      expect(authService.verifyEmail).toHaveBeenCalledWith(
        userId,
        code,
        undefined,
      );
      // In test environment (no SECURE_COOKIES and not production+CI), cookies use lax/insecure
      expect(res.cookie).toHaveBeenCalledWith(
        'auth_token',
        'access-token',
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          path: '/',
        }),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh-token',
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          path: '/auth',
        }),
      );
    });

    it('should pass promotion token when provided', async () => {
      const userId = 'user-1';
      const code = '123456';
      const promotionToken = 'promo-123';
      const res = mockResponse();
      const context = { req: {}, res };

      authService.verifyEmail.mockResolvedValue({
        user: createTestUser(),
        token: 'token',
        refreshToken: 'refresh',
      });

      await resolver.verifyEmail(userId, code, context, promotionToken);

      expect(authService.verifyEmail).toHaveBeenCalledWith(
        userId,
        code,
        promotionToken,
      );
    });
  });

  describe('resendVerificationCode', () => {
    it('should call auth service to resend code', async () => {
      authService.resendVerificationCode.mockResolvedValue(true);

      const result = await resolver.resendVerificationCode('user-1');

      expect(result).toBe(true);
      expect(authService.resendVerificationCode).toHaveBeenCalledWith('user-1');
    });

    it('should return false when resend fails', async () => {
      authService.resendVerificationCode.mockResolvedValue(false);

      const result = await resolver.resendVerificationCode('user-1');

      expect(result).toBe(false);
    });
  });

  describe('password reset flow', () => {
    it('should request a password reset using the caller IP and not set cookies', async () => {
      const input = {
        email: 'test@example.com',
        captchaToken: 'captcha-token',
      };
      const res = mockResponse();
      const context = {
        req: { ip: '192.168.1.99', headers: {} },
        res,
      };

      authService.requestPasswordReset.mockResolvedValue(true);

      const result = await resolver.requestPasswordReset(input, context);

      expect(result).toBe(true);
      expect(authService.requestPasswordReset).toHaveBeenCalledWith(
        input,
        '192.168.1.99',
      );
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it('should return the validity state for a reset token', async () => {
      authService.isPasswordResetTokenValid.mockResolvedValue(true);

      const result = await resolver.isPasswordResetTokenValid('reset-token');

      expect(result).toBe(true);
      expect(authService.isPasswordResetTokenValid).toHaveBeenCalledWith(
        'reset-token',
      );
    });

    it('should reset the password without setting auth cookies', async () => {
      const input = {
        token: 'reset-token',
        newPassword: 'NewPassword123',
      };

      authService.resetPassword.mockResolvedValue(true);

      const result = await resolver.resetPassword(input);

      expect(result).toBe(true);
      expect(authService.resetPassword).toHaveBeenCalledWith(input);
    });
  });

  describe('login', () => {
    it('should login user and set auth cookies', async () => {
      const input = {
        email: 'test@example.com',
        password: 'password123',
        captchaToken: 'captcha-token',
      };
      const res = mockResponse();
      const context = {
        req: { ip: '192.168.1.1', headers: {} },
        res,
      };

      const authPayload = {
        user: createTestUser(),
        token: 'access-token',
        refreshToken: 'refresh-token',
        requiresVerification: false,
        requiresTwoFactor: false,
      };

      authService.login.mockResolvedValue(authPayload);

      const result = await resolver.login(input, context);

      expect(result).toEqual({
        user: authPayload.user,
        token: authPayload.token,
        requiresVerification: false,
        requiresTwoFactor: false,
      });
      expect(result).not.toHaveProperty('refreshToken');
      expect(authService.login).toHaveBeenCalledWith(input, '192.168.1.1');
      expect(res.cookie).toHaveBeenCalledTimes(2);
    });

    it('should not set cookies when login requires email verification', async () => {
      const input = { email: 'test@example.com', password: 'password123' };
      const res = mockResponse();
      const context = {
        req: { ip: '192.168.1.1', headers: {} },
        res,
      };

      const loginPayload = {
        user: createTestUser({ emailVerified: false }),
        requiresVerification: true,
        requiresTwoFactor: false,
        message: 'Tu email todavía no está verificado.',
      };

      authService.login.mockResolvedValue(loginPayload);

      const result = await resolver.login(input, context);

      expect(result).toEqual(loginPayload);
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it('should extract IP from x-forwarded-for header', async () => {
      const input = { email: 'test@example.com', password: 'password123' };
      const res = mockResponse();
      const context = {
        req: {
          ip: '127.0.0.1',
          headers: { 'x-forwarded-for': '203.0.113.1, 198.51.100.1' },
        },
        res,
      };

      authService.login.mockResolvedValue({
        user: createTestUser(),
        token: 'token',
        refreshToken: 'refresh',
        requiresVerification: false,
        requiresTwoFactor: false,
      });

      await resolver.login(input, context);

      expect(authService.login).toHaveBeenCalledWith(input, '203.0.113.1');
    });

    it('should extract IP from x-real-ip header when x-forwarded-for missing', async () => {
      const input = { email: 'test@example.com', password: 'password123' };
      const res = mockResponse();
      const context = {
        req: {
          ip: '127.0.0.1',
          headers: { 'x-real-ip': '203.0.113.5' },
        },
        res,
      };

      authService.login.mockResolvedValue({
        user: createTestUser(),
        token: 'token',
        refreshToken: 'refresh',
        requiresVerification: false,
        requiresTwoFactor: false,
      });

      await resolver.login(input, context);

      expect(authService.login).toHaveBeenCalledWith(input, '203.0.113.5');
    });

    it('should fallback to req.ip when no proxy headers present', async () => {
      const input = { email: 'test@example.com', password: 'password123' };
      const res = mockResponse();
      const context = {
        req: {
          ip: '192.168.1.100',
          headers: {},
        },
        res,
      };

      authService.login.mockResolvedValue({
        user: createTestUser(),
        token: 'token',
        refreshToken: 'refresh',
        requiresVerification: false,
        requiresTwoFactor: false,
      });

      await resolver.login(input, context);

      expect(authService.login).toHaveBeenCalledWith(input, '192.168.1.100');
    });

    it('should use "unknown" when IP cannot be determined', async () => {
      const input = { email: 'test@example.com', password: 'password123' };
      const res = mockResponse();
      const context = {
        req: {
          headers: {},
        },
        res,
      };

      authService.login.mockResolvedValue({
        user: createTestUser(),
        token: 'token',
        refreshToken: 'refresh',
        requiresVerification: false,
        requiresTwoFactor: false,
      });

      await resolver.login(input, context);

      expect(authService.login).toHaveBeenCalledWith(input, 'unknown');
    });
  });

  describe('two-factor mutations', () => {
    it('should start two-factor setup for the current user', async () => {
      const user = createTestUser();
      const expected = {
        setupToken: 'setup-token',
        manualEntryKey: 'SECRET123',
        otpauthUrl: 'otpauth://totp/LUK:test@example.com',
        qrCodeDataUrl: 'data:image/png;base64,qr',
      };

      authService.beginTwoFactorSetup.mockResolvedValue(expected);

      const result = await resolver.beginTwoFactorSetup(user, 'Password123!');

      expect(result).toEqual(expected);
      expect(authService.beginTwoFactorSetup).toHaveBeenCalledWith(
        user.id,
        'Password123!',
      );
    });

    it('should enable two-factor for the current user', async () => {
      const user = createTestUser();
      const expected = {
        user: createTestUser({ twoFactorEnabled: true }),
        recoveryCodes: ['ABCD-1234'],
      };

      authService.enableTwoFactor.mockResolvedValue(expected);

      const result = await resolver.enableTwoFactor(
        user,
        'setup-token',
        '123456',
      );

      expect(result).toEqual(expected);
      expect(authService.enableTwoFactor).toHaveBeenCalledWith(
        user.id,
        'setup-token',
        '123456',
      );
    });

    it('should complete two-factor login and set auth cookies', async () => {
      const res = mockResponse();
      const context = {
        req: { ip: '192.168.1.1', headers: {} },
        res,
      };
      const expected = {
        user: createTestUser({ twoFactorEnabled: true }),
        token: 'access-token',
        refreshToken: 'refresh-token',
      };

      authService.completeTwoFactorLogin.mockResolvedValue(expected);

      const result = await resolver.completeTwoFactorLogin(
        'challenge-token',
        context,
        '123456',
      );

      expect(result).toEqual({
        user: expected.user,
        token: expected.token,
      });
      expect(result).not.toHaveProperty('refreshToken');
      expect(authService.completeTwoFactorLogin).toHaveBeenCalledWith(
        'challenge-token',
        '123456',
        undefined,
        '192.168.1.1',
      );
      expect(res.cookie).toHaveBeenCalledTimes(2);
    });

    it('should disable two-factor for the current user', async () => {
      const user = createTestUser({ twoFactorEnabled: true });
      authService.disableTwoFactor.mockResolvedValue(true);

      const result = await resolver.disableTwoFactor(
        user,
        'Password123!',
        '123456',
      );

      expect(result).toBe(true);
      expect(authService.disableTwoFactor).toHaveBeenCalledWith(
        user.id,
        'Password123!',
        '123456',
        undefined,
      );
    });
  });

  describe('me', () => {
    it('should return current user with decrypted PII', async () => {
      const user = createTestUser();
      const decryptedUser = {
        ...user,
        documentNumber: '12345678',
        street: 'Av. Corrientes',
      };

      mockUsersService.getUserWithDecryptedPII.mockResolvedValue(decryptedUser);

      const result = await resolver.me(user);

      expect(result).toEqual(decryptedUser);
      expect(mockUsersService.getUserWithDecryptedPII).toHaveBeenCalledWith(
        user.id,
      );
    });

    it('should return user with all properties decrypted', async () => {
      const user = createTestUser({
        id: 'custom-id',
        email: 'custom@example.com',
        nombre: 'Custom',
        apellido: 'Name',
        role: UserRole.ADMIN,
      });
      const decryptedUser = {
        ...user,
        documentNumber: '87654321',
        cuitCuil: '20-87654321-9',
      };

      mockUsersService.getUserWithDecryptedPII.mockResolvedValue(decryptedUser);

      const result = await resolver.me(user);

      expect(result.id).toBe('custom-id');
      expect(result.email).toBe('custom@example.com');
      expect(result.role).toBe(UserRole.ADMIN);
    });
  });
});
