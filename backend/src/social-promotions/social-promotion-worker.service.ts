import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { SocialPromotionsService } from './social-promotions.service';
import { captureException } from '../sentry';

function isDisabledFlag(value: boolean | string | undefined): boolean {
  return (
    value === false ||
    (typeof value === 'string' && value.trim().toLowerCase() === 'false')
  );
}

/**
 * Runs scheduled validation and settlement jobs for social promotion posts.
 */
@Injectable()
export class SocialPromotionWorkerService {
  private readonly logger = new Logger(SocialPromotionWorkerService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly socialPromotionsService: SocialPromotionsService,
    private readonly configService: ConfigService,
  ) {
    const featureEnabled = this.configService.get<boolean | string>(
      'SOCIAL_PROMOTION_ENABLED',
    );
    this.enabled = !isDisabledFlag(featureEnabled);
  }

  /**
   * Validates promotion posts that are due for their next check.
   */
  @Cron(process.env.SOCIAL_PROMOTION_CHECK_CRON || '0 */12 * * *')
  async processDuePosts() {
    if (!this.enabled) return;

    try {
      const processed =
        await this.socialPromotionsService.processDueSocialPromotionPosts();
      if (processed > 0) {
        this.logger.log(
          `Processed ${processed} social promotion posts due for validation`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Social promotion validation worker failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      captureException(
        error instanceof Error
          ? error
          : new Error('Social promotion validation worker failed'),
        {
          tags: {
            service: 'social-worker',
            domain: 'social-promotions',
            stage: 'validation',
          },
        },
      );
    }
  }

  /**
   * Settles closed promotion posts and emits any resulting seller bonus grants.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async settleClosedPosts() {
    if (!this.enabled) return;

    try {
      const settled =
        await this.socialPromotionsService.settleClosedSocialPromotionPosts();
      if (settled > 0) {
        this.logger.log(`Settled ${settled} closed social promotion posts`);
      }
    } catch (error) {
      this.logger.error(
        `Social promotion settlement worker failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      captureException(
        error instanceof Error
          ? error
          : new Error('Social promotion settlement worker failed'),
        {
          tags: {
            service: 'social-worker',
            domain: 'social-promotions',
            stage: 'settlement',
          },
        },
      );
    }
  }
}
