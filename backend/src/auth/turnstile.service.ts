import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_ERROR_MESSAGE =
  'No pudimos validar que sos humano. Intentá nuevamente.';

interface TurnstileVerificationResponse {
  success: boolean;
  'error-codes'?: string[];
}

type TurnstileStage = 'login' | 'register' | 'password_reset';

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  constructor(private readonly configService: ConfigService) {}

  async assertHuman(
    captchaToken?: string,
    remoteIp?: string,
    stage?: TurnstileStage,
  ): Promise<void> {
    if (!this.configService.get<boolean>('TURNSTILE_ENABLED', false)) {
      return;
    }

    if (!captchaToken) {
      throw new UnauthorizedException(TURNSTILE_ERROR_MESSAGE);
    }

    const secretKey = this.configService
      .get<string>('TURNSTILE_SECRET_KEY', '')
      .trim();

    if (!secretKey) {
      this.logger.error(
        `TURNSTILE_ENABLED=true but TURNSTILE_SECRET_KEY is missing.${this.buildLogContext(stage, remoteIp)}`,
      );
      throw new UnauthorizedException(TURNSTILE_ERROR_MESSAGE);
    }

    const requestBody = new URLSearchParams({
      secret: secretKey,
      response: captchaToken,
    });

    if (remoteIp) {
      requestBody.append('remoteip', remoteIp);
    }

    try {
      const response = await fetch(TURNSTILE_VERIFY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: requestBody.toString(),
      });

      if (!response.ok) {
        this.logger.warn(
          `Turnstile verification request failed with status ${response.status}.${this.buildLogContext(stage, remoteIp)}`,
        );
        throw new UnauthorizedException(TURNSTILE_ERROR_MESSAGE);
      }

      const result = (await response.json()) as TurnstileVerificationResponse;

      if (!result.success) {
        const errorCodes = result['error-codes']?.join(', ') ?? 'unknown';
        this.logger.warn(
          `Turnstile verification rejected request. errorCodes=${errorCodes}.${this.buildLogContext(stage, remoteIp)}`,
        );
        throw new UnauthorizedException(TURNSTILE_ERROR_MESSAGE);
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Turnstile verification failed: ${message}.${this.buildLogContext(stage, remoteIp)}`,
      );
      throw new UnauthorizedException(TURNSTILE_ERROR_MESSAGE);
    }
  }

  private buildLogContext(stage?: TurnstileStage, remoteIp?: string): string {
    const context: string[] = [];

    if (stage) {
      context.push(`stage=${stage}`);
    }

    if (remoteIp) {
      context.push('remoteIpPresent=true');
    }

    return context.length > 0 ? ` ${context.join(' ')}` : '';
  }
}
