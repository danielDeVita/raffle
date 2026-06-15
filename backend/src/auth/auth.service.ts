import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  RegisterInput,
  LoginInput,
  RequestPasswordResetInput,
  ResetPasswordInput,
} from './dto/auth.input';
import { Prisma, User as PrismaUser, UserRole } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityService } from '../activity/activity.service';
import { LoginThrottlerService } from '@/common/guards';
import { SocialPromotionsService } from '../social-promotions/social-promotions.service';
import { LoginPayload } from './dto/auth-payload';
import { TurnstileService } from './turnstile.service';
import { TwoFactorService } from './two-factor.service';
import { getPasswordValidationMessage } from '../common/constants/password.constants';

// Token expiration times
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRY_DAYS = 7; // 7 days
const VERIFICATION_CODE_EXPIRY_MINUTES = 15;
const PASSWORD_RESET_TOKEN_EXPIRY_MINUTES = 30;
const PASSWORD_RESET_REQUEST_LIMIT_PER_HOUR = 3;
type RefreshTokenWithUser = Prisma.RefreshTokenGetPayload<{
  include: { user: true };
}>;
type RefreshTokenForRevokeAll = Prisma.RefreshTokenGetPayload<{
  select: { id: true; token: true; tokenHash: true };
}>;
type PasswordResetTokenWithUser = Prisma.PasswordResetTokenGetPayload<{
  include: { user: true };
}>;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private notifications: NotificationsService,
    private activityService: ActivityService,
    private loginThrottler: LoginThrottlerService,
    private socialPromotionsService: SocialPromotionsService,
    private turnstileService: TurnstileService,
    private twoFactorService: TwoFactorService,
  ) {}

  async register(input: RegisterInput) {
    await this.turnstileService.assertHuman(
      input.captchaToken,
      undefined,
      'register',
    );

    const existingUser = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Validate terms acceptance
    if (!input.acceptTerms) {
      throw new ConflictException('Debe aceptar los términos y condiciones');
    }

    // Validate age (must be 18+)
    const birthDate = new Date(input.fechaNacimiento);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }

    if (age < 18) {
      throw new ConflictException('Debe ser mayor de 18 años para registrarse');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        nombre: input.nombre,
        apellido: input.apellido,
        fechaNacimiento: birthDate,
        termsAcceptedAt: new Date(),
        termsVersion: '2026-01',
        role: UserRole.USER,
        emailVerified: false,
        reputation: {
          create: {
            // Default values are set in schema (level: NUEVO, sales: 0)
          },
        },
      },
    });

    // Generate and send verification code
    const verificationCode = this.generateVerificationCode();
    await this.createEmailVerificationCode(user.id, verificationCode);

    // Send verification email (non-blocking)
    this.notifications
      .sendEmailVerificationCode(user.email, {
        userName: user.nombre,
        code: verificationCode,
        expiresInMinutes: VERIFICATION_CODE_EXPIRY_MINUTES,
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(`Failed to send verification email: ${message}`);
      });

    // Log activity
    this.activityService
      .logUserRegistered(user.id, 'email')
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(`Failed to log registration: ${message}`);
      });

    // Return user without tokens - needs verification first
    return {
      user,
      requiresVerification: true,
      message: 'Verificá tu email con el código que te enviamos',
    };
  }

  async verifyEmail(userId: string, code: string, promotionToken?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    if (user.emailVerified) {
      throw new ConflictException('Email ya verificado');
    }

    // Find valid verification code
    const verificationCode = await this.prisma.emailVerificationCode.findFirst({
      where: {
        userId,
        code,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!verificationCode) {
      // Increment attempts on any code for this user
      await this.prisma.emailVerificationCode.updateMany({
        where: { userId, isUsed: false },
        data: { attempts: { increment: 1 } },
      });

      // Check if max attempts exceeded
      const latestCode = await this.prisma.emailVerificationCode.findFirst({
        where: { userId, isUsed: false },
        orderBy: { createdAt: 'desc' },
      });

      if (latestCode && latestCode.attempts >= latestCode.maxAttempts) {
        throw new UnauthorizedException(
          'Demasiados intentos. Solicitá un nuevo código.',
        );
      }

      throw new UnauthorizedException('Código inválido o expirado');
    }

    // Mark code as used and verify email
    await this.prisma.$transaction([
      this.prisma.emailVerificationCode.update({
        where: { id: verificationCode.id },
        data: { isUsed: true, usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { emailVerified: true, emailVerifiedAt: new Date() },
      }),
    ]);

    // Send welcome notifications
    this.sendWelcomeNotifications(user).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Failed to send welcome notifications: ${message}`);
    });

    this.socialPromotionsService
      .recordRegistrationAttribution(userId, promotionToken)
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(
          `Failed to record promotion registration attribution: ${message}`,
        );
      });

    // Generate tokens
    const accessToken = this.generateAccessToken(
      user.id,
      user.email,
      user.role,
    );
    const refreshToken = await this.createRefreshToken(user.id);

    return {
      token: accessToken,
      refreshToken,
      user: { ...user, emailVerified: true },
    };
  }

  async resendVerificationCode(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    if (user.emailVerified) {
      throw new ConflictException('Email ya verificado');
    }

    // Check rate limit - max 3 codes per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCodes = await this.prisma.emailVerificationCode.count({
      where: {
        userId,
        createdAt: { gt: oneHourAgo },
      },
    });

    if (recentCodes >= 3) {
      throw new ConflictException(
        'Demasiados intentos. Esperá una hora antes de solicitar otro código.',
      );
    }

    // Invalidate old codes
    await this.prisma.emailVerificationCode.updateMany({
      where: { userId, isUsed: false },
      data: { isUsed: true },
    });

    // Generate new code
    const verificationCode = this.generateVerificationCode();
    await this.createEmailVerificationCode(userId, verificationCode);

    // Send email
    await this.notifications.sendEmailVerificationCode(user.email, {
      userName: user.nombre,
      code: verificationCode,
      expiresInMinutes: VERIFICATION_CODE_EXPIRY_MINUTES,
    });

    return true;
  }

  async requestPasswordReset(
    input: RequestPasswordResetInput,
    ip?: string,
  ): Promise<boolean> {
    await this.turnstileService.assertHuman(
      input.captchaToken,
      ip,
      'password_reset',
    );

    const normalizedEmail = this.normalizeEmail(input.email);
    const user = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: 'insensitive',
        },
      },
    });

    if (!this.isPasswordResetEligibleUser(user)) {
      return true;
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentResetRequests = await this.prisma.passwordResetToken.count({
      where: {
        userId: user.id,
        createdAt: { gt: oneHourAgo },
      },
    });

    if (recentResetRequests >= PASSWORD_RESET_REQUEST_LIMIT_PER_HOUR) {
      return true;
    }

    await this.prisma.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        usedAt: new Date(),
      },
    });

    const resetToken = await this.createPasswordResetToken(user.id);
    const userName = this.getUserDisplayName(user);

    this.runAuthSideEffect(
      this.notifications.sendPasswordResetEmail(user.email, {
        userName,
        resetToken,
        expiresInMinutes: PASSWORD_RESET_TOKEN_EXPIRY_MINUTES,
      }),
      'Failed to send password reset email',
    );

    return true;
  }

  async isPasswordResetTokenValid(token: string): Promise<boolean> {
    if (!token.trim()) {
      return false;
    }

    const passwordResetToken = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash: this.hashPasswordResetToken(token),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });

    return Boolean(passwordResetToken);
  }

  async resetPassword(input: ResetPasswordInput): Promise<boolean> {
    const passwordResetToken = await this.findActivePasswordResetToken(
      input.token,
    );

    if (!passwordResetToken) {
      throw new UnauthorizedException(
        'El enlace no es válido o expiró. Pedí uno nuevo.',
      );
    }

    if (!this.isPasswordResetEligibleUser(passwordResetToken.user)) {
      throw new UnauthorizedException(
        'El enlace no es válido o expiró. Pedí uno nuevo.',
      );
    }

    this.assertPasswordStrength(input.newPassword);

    const passwordHash = await bcrypt.hash(input.newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: passwordResetToken.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: passwordResetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    await this.revokeAllUserRefreshTokens(passwordResetToken.userId);

    this.logAuthActivity(
      this.activityService.logPasswordChanged(
        passwordResetToken.userId,
        'reset',
      ),
      'Failed to log password reset activity',
    );
    this.runAuthSideEffect(
      this.notifications.sendPasswordResetConfirmationEmail(
        passwordResetToken.user.email,
        {
          userName: this.getUserDisplayName(passwordResetToken.user),
        },
      ),
      'Failed to send password reset confirmation email',
    );

    return true;
  }

  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async createEmailVerificationCode(userId: string, code: string) {
    const expiresAt = new Date(
      Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000,
    );

    return this.prisma.emailVerificationCode.create({
      data: {
        userId,
        code,
        expiresAt,
      },
    });
  }

  private async createPasswordResetToken(userId: string): Promise<string> {
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000,
    );

    await this.prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: this.hashPasswordResetToken(resetToken),
        expiresAt,
      },
    });

    return resetToken;
  }

  private async sendWelcomeNotifications(user: {
    id: string;
    email: string;
    nombre: string;
  }) {
    const userName = user.nombre || user.email.split('@')[0];

    const emailPromise = this.notifications.sendWelcomeEmail(user.email, {
      userName,
    });

    const welcomeMessage = `¡Hola ${userName}! Tu cuenta ha sido creada exitosamente. ¡Explora las rifas disponibles!`;

    await Promise.all([
      emailPromise,
      this.notifications.create(
        user.id,
        'WELCOME',
        '¡Bienvenido!',
        welcomeMessage,
      ),
      this.activityService.logUserRegistered(user.id, 'email'),
    ]);
  }

  async login(input: LoginInput, ip?: string): Promise<LoginPayload> {
    try {
      await this.turnstileService.assertHuman(input.captchaToken, ip, 'login');
    } catch (error) {
      await this.logAuthCaptchaRejectedIfKnownUser(input.email, ip);
      throw error;
    }

    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user) {
      return this.recordFailedAttempt(ip, 'Invalid credentials');
    }

    // Check if user is deleted
    if (user.isDeleted) {
      return this.recordFailedAttempt(ip, 'Account has been deleted');
    }

    // Check if user is banned
    if (user.role === UserRole.BANNED) {
      return this.recordFailedAttempt(ip, 'Account has been banned');
    }

    // OAuth users don't have passwords
    if (!user.passwordHash) {
      return this.recordFailedAttempt(ip, 'Please login with Google');
    }

    const isPasswordValid = await bcrypt.compare(
      input.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      return this.recordFailedAttempt(ip, 'Invalid credentials');
    }

    // Successful password validation - clear failed attempts even if verification is pending
    if (ip) {
      this.loginThrottler.clearAttempts(ip);
    }

    if (!user.emailVerified) {
      return {
        user,
        requiresVerification: true,
        requiresTwoFactor: false,
        message:
          'Tu email todavía no está verificado. Ingresá el código de 6 dígitos o reenviá uno nuevo.',
      };
    }

    if (user.twoFactorEnabled) {
      return {
        user,
        requiresVerification: false,
        requiresTwoFactor: true,
        twoFactorChallengeToken: this.twoFactorService.createChallengeToken(
          user.id,
        ),
        message:
          'Ingresá el código de tu app autenticadora o un código de recuperación para continuar.',
      };
    }

    const accessToken = this.generateAccessToken(
      user.id,
      user.email,
      user.role,
    );
    const refreshToken = await this.createRefreshToken(user.id, undefined, ip);

    // Log login activity (non-blocking)
    this.logAuthActivity(
      this.activityService.logUserLoggedIn(user.id, 'email', ip),
      'Failed to log login activity',
    );

    return {
      token: accessToken,
      refreshToken,
      user,
      requiresVerification: false,
      requiresTwoFactor: false,
    };
  }

  async beginTwoFactorSetup(userId: string, currentPassword: string) {
    const user = await this.getActivePasswordUserOrThrow(userId);

    if (user.twoFactorEnabled) {
      throw new ConflictException(
        'La autenticación en dos pasos ya está activada en esta cuenta.',
      );
    }

    await this.assertCurrentPassword(user, currentPassword);
    return this.twoFactorService.createSetup(user);
  }

  async enableTwoFactor(userId: string, setupToken: string, code: string) {
    const user = await this.getActivePasswordUserOrThrow(userId);

    if (user.twoFactorEnabled) {
      throw new ConflictException(
        'La autenticación en dos pasos ya está activada en esta cuenta.',
      );
    }

    const setup = this.twoFactorService.validateSetupToken(setupToken);
    if (setup.userId !== userId) {
      throw new UnauthorizedException(
        'El desafío de autenticación expiró. Intentá nuevamente.',
      );
    }

    if (!this.twoFactorService.verifyTotp(code, setup.secret)) {
      throw new UnauthorizedException(
        'El código de autenticación es inválido.',
      );
    }

    const recoveryCodes = this.twoFactorService.generateRecoveryCodes();
    const recoveryCodeHashes =
      this.twoFactorService.hashRecoveryCodes(recoveryCodes);

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorEnabledAt: new Date(),
        twoFactorSecretEncrypted: this.twoFactorService.encryptSecret(
          setup.secret,
        ),
        twoFactorRecoveryCodeHashes:
          recoveryCodeHashes as Prisma.InputJsonValue,
      },
    });

    this.logAuthActivity(
      this.activityService.logTwoFactorEnabled(userId),
      'Failed to log 2FA activation activity',
    );
    this.notifyTwoFactorEnabled(updatedUser);

    return {
      user: updatedUser,
      recoveryCodes,
    };
  }

  async completeTwoFactorLogin(
    challengeToken: string,
    code: string | undefined,
    recoveryCode: string | undefined,
    ip?: string,
  ) {
    this.assertExactlyOneSecondFactor(code, recoveryCode);
    let remainingRecoveryCodesCount: number | null = null;

    const challenge =
      this.twoFactorService.validateChallengeToken(challengeToken);
    const user = await this.getActiveUserOrThrow(challenge.userId);

    if (!user.emailVerified) {
      throw new UnauthorizedException('Email not verified');
    }

    if (!user.twoFactorEnabled) {
      return this.recordFailedAttempt(
        ip,
        'La autenticación en dos pasos no está activa en esta cuenta.',
      );
    }

    const secret = this.twoFactorService.decryptSecret(
      user.twoFactorSecretEncrypted,
    );

    if (!secret) {
      return this.recordFailedAttempt(
        ip,
        'No pudimos validar el segundo factor. Intentá nuevamente.',
      );
    }

    if (code) {
      const isValidCode = this.twoFactorService.verifyTotp(code, secret);
      if (!isValidCode) {
        this.logAuthActivity(
          this.activityService.logTwoFactorCodeRejected(user.id, 'login', ip),
          'Failed to log rejected 2FA code',
        );
        return this.recordFailedAttempt(
          ip,
          'El código de autenticación es inválido.',
        );
      }
    } else if (recoveryCode) {
      const existingHashes = this.parseRecoveryCodeHashes(
        user.twoFactorRecoveryCodeHashes,
      );
      const result = this.twoFactorService.consumeRecoveryCode(
        recoveryCode,
        existingHashes,
      );

      if (!result.matched) {
        this.logAuthActivity(
          this.activityService.logTwoFactorRecoveryCodeRejected(
            user.id,
            'login',
            ip,
          ),
          'Failed to log rejected recovery code',
        );
        return this.recordFailedAttempt(
          ip,
          'El código de recuperación es inválido.',
        );
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          twoFactorRecoveryCodeHashes:
            result.remainingHashes as Prisma.InputJsonValue,
        },
      });

      this.logAuthActivity(
        this.activityService.logTwoFactorRecoveryCodeUsed(
          user.id,
          result.remainingHashes.length,
          ip,
        ),
        'Failed to log recovery code usage',
      );
      remainingRecoveryCodesCount = result.remainingHashes.length;
    }

    if (ip) {
      this.loginThrottler.clearAttempts(ip);
    }

    const accessToken = this.generateAccessToken(
      user.id,
      user.email,
      user.role,
    );
    const refreshToken = await this.createRefreshToken(user.id, undefined, ip);

    this.logAuthActivity(
      this.activityService.logUserLoggedIn(user.id, 'email', ip),
      'Failed to log login activity',
    );
    if (remainingRecoveryCodesCount !== null) {
      this.notifyRecoveryCodeLogin(user, remainingRecoveryCodesCount);
    }

    return {
      token: accessToken,
      refreshToken,
      user,
    };
  }

  async disableTwoFactor(
    userId: string,
    currentPassword: string,
    code?: string,
    recoveryCode?: string,
  ): Promise<boolean> {
    this.assertExactlyOneSecondFactor(code, recoveryCode);

    const user = await this.getActivePasswordUserOrThrow(userId);

    if (!user.twoFactorEnabled) {
      throw new ConflictException(
        'La autenticación en dos pasos no está activa en esta cuenta.',
      );
    }

    await this.assertCurrentPassword(user, currentPassword);

    const secret = this.twoFactorService.decryptSecret(
      user.twoFactorSecretEncrypted,
    );

    if (!secret) {
      throw new UnauthorizedException(
        'No pudimos validar el segundo factor. Intentá nuevamente.',
      );
    }

    if (code) {
      const isValidCode = this.twoFactorService.verifyTotp(code, secret);
      if (!isValidCode) {
        this.logAuthActivity(
          this.activityService.logTwoFactorCodeRejected(user.id, 'disable'),
          'Failed to log rejected 2FA code',
        );
        throw new UnauthorizedException(
          'El código de autenticación es inválido.',
        );
      }
    } else if (recoveryCode) {
      const existingHashes = this.parseRecoveryCodeHashes(
        user.twoFactorRecoveryCodeHashes,
      );
      const result = this.twoFactorService.consumeRecoveryCode(
        recoveryCode,
        existingHashes,
      );

      if (!result.matched) {
        this.logAuthActivity(
          this.activityService.logTwoFactorRecoveryCodeRejected(
            user.id,
            'disable',
          ),
          'Failed to log rejected recovery code',
        );
        throw new UnauthorizedException(
          'El código de recuperación es inválido.',
        );
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorEnabledAt: null,
        twoFactorSecretEncrypted: null,
        twoFactorRecoveryCodeHashes: Prisma.JsonNull,
      },
    });

    this.logAuthActivity(
      this.activityService.logTwoFactorDisabled(
        userId,
        code ? 'totp' : 'recovery',
      ),
      'Failed to log 2FA disable activity',
    );
    this.notifyTwoFactorDisabled(updatedUser);

    return true;
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.isDeleted || user.role === UserRole.BANNED) {
      return null;
    }

    return user;
  }

  /**
   * Generate JWT token for a user (used by OAuth flows)
   */
  async generateTokenForUser(
    user: {
      id: string;
      email: string;
      role: UserRole;
      emailVerified: boolean;
    },
    method: 'email' | 'google' = 'email',
    ipAddress?: string,
  ): Promise<{ token: string; refreshToken: string }> {
    if (!user.emailVerified) {
      throw new UnauthorizedException('Email not verified');
    }

    const token = this.generateAccessToken(user.id, user.email, user.role);
    const refreshToken = await this.createRefreshToken(
      user.id,
      undefined,
      ipAddress,
    );
    this.logAuthActivity(
      this.activityService.logUserLoggedIn(user.id, method, ipAddress),
      'Failed to log login activity',
    );
    return { token, refreshToken };
  }

  /**
   * Refresh the access token using a refresh token.
   * Implements token rotation - old refresh token is revoked and a new one is issued.
   */
  async refreshAccessToken(
    refreshTokenValue: string,
  ): Promise<{ token: string; refreshToken: string }> {
    const refreshToken = await this.findRefreshTokenByValue(refreshTokenValue);

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const hashedRefreshTokenValue =
      refreshToken.tokenHash ?? this.hashRefreshToken(refreshTokenValue);

    if (refreshToken.revokedAt) {
      await this.persistRefreshTokenHashIfMissing(
        refreshToken.id,
        hashedRefreshTokenValue,
        refreshToken.tokenHash,
      );

      // Token was already used - possible token theft, revoke all user tokens
      this.logger.warn(
        `Refresh token reuse detected for user ${refreshToken.userId}`,
      );
      await this.revokeAllUserRefreshTokens(refreshToken.userId);
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (refreshToken.expiresAt < new Date()) {
      await this.persistRefreshTokenHashIfMissing(
        refreshToken.id,
        hashedRefreshTokenValue,
        refreshToken.tokenHash,
      );
      throw new UnauthorizedException('Refresh token has expired');
    }

    const user = refreshToken.user;

    if (!user || user.isDeleted || user.role === UserRole.BANNED) {
      throw new UnauthorizedException('User account is not active');
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException('Email not verified');
    }

    // Revoke the old refresh token (rotation) and scrub any legacy plaintext value.
    await this.prisma.refreshToken.update({
      where: { id: refreshToken.id },
      data: {
        revokedAt: new Date(),
        tokenHash: hashedRefreshTokenValue,
        token: null,
      },
    });

    // Generate new tokens
    const newAccessToken = this.generateAccessToken(
      user.id,
      user.email,
      user.role,
    );
    const newRefreshToken = await this.createRefreshToken(user.id);

    return { token: newAccessToken, refreshToken: newRefreshToken };
  }

  /**
   * Revoke a specific refresh token (logout)
   */
  async revokeRefreshToken(refreshTokenValue: string): Promise<void> {
    const tokenHash = this.hashRefreshToken(refreshTokenValue);

    await this.prisma.refreshToken.updateMany({
      where: {
        revokedAt: null,
        OR: [{ tokenHash }, { token: refreshTokenValue }],
      },
      data: {
        revokedAt: new Date(),
        tokenHash,
        token: null,
      },
    });
  }

  /**
   * Revoke all refresh tokens for a user (logout all devices)
   */
  async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    const activeRefreshTokens: RefreshTokenForRevokeAll[] =
      await this.prisma.refreshToken.findMany({
        where: {
          userId,
          revokedAt: null,
        },
        select: {
          id: true,
          token: true,
          tokenHash: true,
        },
      });

    if (activeRefreshTokens.length === 0) {
      return;
    }

    const revokedAt = new Date();
    await this.prisma.$transaction(
      activeRefreshTokens.map((refreshToken) => {
        const data: Prisma.RefreshTokenUpdateInput = {
          revokedAt,
          token: null,
        };

        if (refreshToken.tokenHash) {
          data.tokenHash = refreshToken.tokenHash;
        } else if (refreshToken.token) {
          data.tokenHash = this.hashRefreshToken(refreshToken.token);
        }

        return this.prisma.refreshToken.update({
          where: { id: refreshToken.id },
          data,
        });
      }),
    );
  }

  /**
   * Create a new refresh token for a user
   */
  private async createRefreshToken(
    userId: string,
    deviceInfo?: string,
    ipAddress?: string,
  ): Promise<string> {
    const token = crypto.randomBytes(64).toString('hex');
    const tokenHash = this.hashRefreshToken(token);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: null,
        tokenHash,
        expiresAt,
        deviceInfo,
        ipAddress,
      },
    });

    return token;
  }

  /**
   * Clean up expired refresh tokens (called periodically)
   */
  async cleanupExpiredRefreshTokens(): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }],
      },
    });
    return result.count;
  }

  private async findRefreshTokenByValue(
    refreshTokenValue: string,
  ): Promise<RefreshTokenWithUser | null> {
    const tokenHash = this.hashRefreshToken(refreshTokenValue);

    return this.prisma.refreshToken.findFirst({
      where: {
        OR: [{ tokenHash }, { token: refreshTokenValue }],
      },
      include: { user: true },
    });
  }

  private async findActivePasswordResetToken(
    token: string,
  ): Promise<PasswordResetTokenWithUser | null> {
    return this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash: this.hashPasswordResetToken(token),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });
  }

  private hashRefreshToken(refreshTokenValue: string): string {
    return crypto
      .createHash('sha256')
      .update(refreshTokenValue, 'utf8')
      .digest('hex');
  }

  private hashPasswordResetToken(token: string): string {
    return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private async persistRefreshTokenHashIfMissing(
    refreshTokenId: string,
    tokenHash: string,
    existingTokenHash?: string | null,
  ): Promise<void> {
    if (existingTokenHash) {
      return;
    }

    await this.prisma.refreshToken.update({
      where: { id: refreshTokenId },
      data: {
        tokenHash,
        token: null,
      },
    });
  }

  private generateAccessToken(
    userId: string,
    email: string,
    role: UserRole,
  ): string {
    return this.jwtService.sign(
      {
        sub: userId,
        email,
        role,
      },
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );
  }

  private async getActiveUserOrThrow(userId: string): Promise<PrismaUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.isDeleted || user.role === UserRole.BANNED) {
      throw new UnauthorizedException('User account is not active');
    }

    return user;
  }

  private async getActivePasswordUserOrThrow(
    userId: string,
  ): Promise<PrismaUser> {
    const user = await this.getActiveUserOrThrow(userId);

    if (!user.passwordHash) {
      throw new BadRequestException(
        'Tu cuenta usa Google y no tiene contraseña configurada. La autenticación en dos pasos v1 solo funciona con inicio de sesión por contraseña.',
      );
    }

    return user;
  }

  private isPasswordResetEligibleUser(
    user: PrismaUser | null | undefined,
  ): user is PrismaUser & { passwordHash: string } {
    return Boolean(
      user &&
      !user.isDeleted &&
      user.role !== UserRole.BANNED &&
      user.passwordHash,
    );
  }

  private async assertCurrentPassword(
    user: PrismaUser,
    currentPassword: string,
  ): Promise<void> {
    if (!user.passwordHash) {
      throw new BadRequestException(
        'Tu cuenta no tiene una contraseña configurada.',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('La contraseña actual es incorrecta.');
    }
  }

  private assertPasswordStrength(password: string): void {
    const validationMessage = getPasswordValidationMessage(password);

    if (validationMessage) {
      throw new BadRequestException(validationMessage);
    }
  }

  private assertExactlyOneSecondFactor(
    code?: string,
    recoveryCode?: string,
  ): void {
    const hasCode = Boolean(code?.trim());
    const hasRecoveryCode = Boolean(recoveryCode?.trim());

    if ((hasCode && hasRecoveryCode) || (!hasCode && !hasRecoveryCode)) {
      throw new BadRequestException(
        'Debés enviar un código TOTP o un código de recuperación, pero no ambos.',
      );
    }
  }

  private parseRecoveryCodeHashes(value: Prisma.JsonValue | null): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((entry): entry is string => typeof entry === 'string');
  }

  private logAuthActivity(
    activityPromise: Promise<unknown>,
    failureMessage: string,
  ): void {
    this.runAuthSideEffect(activityPromise, failureMessage);
  }

  private runAuthSideEffect(
    sideEffectPromise: Promise<unknown>,
    failureMessage: string,
  ): void {
    sideEffectPromise.catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`${failureMessage}: ${message}`);
    });
  }

  private notifyTwoFactorEnabled(
    user: Pick<PrismaUser, 'id' | 'email' | 'nombre'>,
  ): void {
    const userName = this.getUserDisplayName(user);

    this.runAuthSideEffect(
      this.notifications.sendTwoFactorEnabledNotification(user.email, {
        userName,
      }),
      'Failed to send 2FA enabled email',
    );
    this.runAuthSideEffect(
      this.notifications.create(
        user.id,
        'SECURITY',
        '2FA activado',
        'La autenticación en dos pasos ya está activa. Guardá tus códigos de recuperación y revisá tu configuración.',
        '/dashboard/settings',
      ),
      'Failed to create 2FA enabled notification',
    );
  }

  private notifyTwoFactorDisabled(
    user: Pick<PrismaUser, 'id' | 'email' | 'nombre'>,
  ): void {
    const userName = this.getUserDisplayName(user);

    this.runAuthSideEffect(
      this.notifications.sendTwoFactorDisabledNotification(user.email, {
        userName,
      }),
      'Failed to send 2FA disabled email',
    );
    this.runAuthSideEffect(
      this.notifications.create(
        user.id,
        'SECURITY',
        '2FA desactivado',
        'La autenticación en dos pasos fue desactivada en tu cuenta. Si no fuiste vos, revisá tu seguridad.',
        '/dashboard/settings',
      ),
      'Failed to create 2FA disabled notification',
    );
  }

  private notifyRecoveryCodeLogin(
    user: Pick<PrismaUser, 'id' | 'email' | 'nombre'>,
    remainingRecoveryCodesCount: number,
  ): void {
    const userName = this.getUserDisplayName(user);
    const remainingCodesLabel =
      remainingRecoveryCodesCount === 1
        ? 'Te queda 1 código de recuperación.'
        : `Te quedan ${remainingRecoveryCodesCount} códigos de recuperación.`;

    this.runAuthSideEffect(
      this.notifications.sendTwoFactorRecoveryCodeUsedNotification(user.email, {
        userName,
        remainingRecoveryCodesCount,
      }),
      'Failed to send recovery code usage email',
    );
    this.runAuthSideEffect(
      this.notifications.create(
        user.id,
        'SECURITY',
        'Usaste un código de recuperación',
        `${remainingCodesLabel} Si no fuiste vos, revisá tu cuenta de inmediato.`,
        '/dashboard/settings',
      ),
      'Failed to create recovery code usage notification',
    );
  }

  private getUserDisplayName(
    user: Pick<PrismaUser, 'email' | 'nombre'>,
  ): string {
    return user.nombre?.trim() || user.email.split('@')[0];
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private async logAuthCaptchaRejectedIfKnownUser(
    email: string,
    ip?: string,
  ): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (!user) {
        return;
      }

      await this.activityService.logAuthCaptchaRejected(user.id, 'login', ip);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Failed to log captcha rejection activity: ${message}`);
    }
  }

  private recordFailedAttempt(ip: string | undefined, message: string): never {
    if (ip) {
      const result = this.loginThrottler.recordFailedAttempt(ip);
      if (result.blocked) {
        throw new UnauthorizedException(
          'Demasiados intentos fallidos. Su IP ha sido bloqueada temporalmente.',
        );
      }
    }

    throw new UnauthorizedException(message);
  }
}
