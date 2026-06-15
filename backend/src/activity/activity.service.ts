import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityType, Prisma } from '@prisma/client';

interface LogActivityParams {
  userId: string;
  action: ActivityType;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(private prisma: PrismaService) {}

  async log(params: LogActivityParams) {
    try {
      const activity = await this.prisma.activityLog.create({
        data: {
          userId: params.userId,
          action: params.action,
          targetType: params.targetType,
          targetId: params.targetId,
          metadata: params.metadata as Prisma.InputJsonValue | undefined,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
        },
      });

      this.logger.debug(
        `Activity: ${params.action} by user ${params.userId}${params.targetType ? ` on ${params.targetType}:${params.targetId}` : ''}`,
      );

      return activity;
    } catch (error) {
      // Don't fail the main operation if activity logging fails
      this.logger.error(`Failed to log activity: ${(error as Error).message}`);
      return null;
    }
  }

  // ==================== Auth Events ====================

  async logUserRegistered(
    userId: string,
    method: 'email' | 'google' = 'email',
  ) {
    return this.log({
      userId,
      action: ActivityType.USER_REGISTERED,
      metadata: { method },
    });
  }

  async logUserLoggedIn(
    userId: string,
    method: 'email' | 'google' = 'email',
    ipAddress?: string,
  ) {
    return this.log({
      userId,
      action:
        method === 'google'
          ? ActivityType.USER_LOGGED_IN_GOOGLE
          : ActivityType.USER_LOGGED_IN,
      ipAddress,
    });
  }

  async logPasswordChanged(
    userId: string,
    source: 'settings' | 'reset' = 'settings',
  ) {
    return this.log({
      userId,
      action: ActivityType.PASSWORD_CHANGED,
      metadata: { source },
    });
  }

  async logTwoFactorEnabled(userId: string, method: 'totp' = 'totp') {
    return this.log({
      userId,
      action: ActivityType.TWO_FACTOR_ENABLED,
      metadata: { method },
    });
  }

  async logTwoFactorDisabled(userId: string, method: 'totp' | 'recovery') {
    return this.log({
      userId,
      action: ActivityType.TWO_FACTOR_DISABLED,
      metadata: { method },
    });
  }

  async logTwoFactorRecoveryCodeUsed(
    userId: string,
    remainingRecoveryCodesCount: number,
    ipAddress?: string,
  ) {
    return this.log({
      userId,
      action: ActivityType.TWO_FACTOR_RECOVERY_CODE_USED,
      metadata: { remainingRecoveryCodesCount },
      ipAddress,
    });
  }

  async logTwoFactorCodeRejected(
    userId: string,
    stage: 'login' | 'disable',
    ipAddress?: string,
  ) {
    return this.log({
      userId,
      action: ActivityType.TWO_FACTOR_CODE_REJECTED,
      metadata: { stage },
      ipAddress,
    });
  }

  async logTwoFactorRecoveryCodeRejected(
    userId: string,
    stage: 'login' | 'disable',
    ipAddress?: string,
  ) {
    return this.log({
      userId,
      action: ActivityType.TWO_FACTOR_RECOVERY_CODE_REJECTED,
      metadata: { stage },
      ipAddress,
    });
  }

  async logAuthCaptchaRejected(
    userId: string,
    stage: 'login' | 'register',
    ipAddress?: string,
  ) {
    return this.log({
      userId,
      action: ActivityType.AUTH_CAPTCHA_REJECTED,
      metadata: { stage },
      ipAddress,
    });
  }

  // ==================== Raffle Events ====================

  async logRaffleCreated(userId: string, raffleId: string, titulo: string) {
    return this.log({
      userId,
      action: ActivityType.RAFFLE_CREATED,
      targetType: 'Raffle',
      targetId: raffleId,
      metadata: { titulo },
    });
  }

  async logRafflePublished(userId: string, raffleId: string) {
    return this.log({
      userId,
      action: ActivityType.RAFFLE_PUBLISHED,
      targetType: 'Raffle',
      targetId: raffleId,
    });
  }

  async logRaffleCompleted(userId: string, raffleId: string) {
    return this.log({
      userId,
      action: ActivityType.RAFFLE_COMPLETED,
      targetType: 'Raffle',
      targetId: raffleId,
    });
  }

  async logRaffleCancelled(userId: string, raffleId: string, reason?: string) {
    return this.log({
      userId,
      action: ActivityType.RAFFLE_CANCELLED,
      targetType: 'Raffle',
      targetId: raffleId,
      metadata: reason ? { reason } : undefined,
    });
  }

  async logRaffleDrawn(userId: string, raffleId: string, winnerId: string) {
    return this.log({
      userId,
      action: ActivityType.RAFFLE_DRAWN,
      targetType: 'Raffle',
      targetId: raffleId,
      metadata: { winnerId },
    });
  }

  async logRaffleDeadlineExtended(
    userId: string,
    raffleId: string,
    newDeadline: Date,
  ) {
    return this.log({
      userId,
      action: ActivityType.RAFFLE_DEADLINE_EXTENDED,
      targetType: 'Raffle',
      targetId: raffleId,
      metadata: { newDeadline: newDeadline.toISOString() },
    });
  }

  async logRaffleWinnerRejected(
    adminId: string,
    raffleId: string,
    previousWinnerId: string,
    reason: string,
  ) {
    return this.log({
      userId: adminId,
      action: ActivityType.RAFFLE_WINNER_REJECTED,
      targetType: 'Raffle',
      targetId: raffleId,
      metadata: { previousWinnerId, reason },
    });
  }

  // ==================== Ticket Events ====================

  async logTicketsPurchased(
    userId: string,
    raffleId: string,
    ticketNumbers: number[],
    amount: number,
    purchaseReference?: string | null,
  ) {
    return this.log({
      userId,
      action: ActivityType.TICKETS_PURCHASED,
      targetType: 'Raffle',
      targetId: raffleId,
      metadata: {
        ticketNumbers,
        amount,
        purchaseReference,
        count: ticketNumbers.length,
      },
    });
  }

  async logTicketsRefunded(
    userId: string,
    raffleId: string,
    ticketCount: number,
    amount: number,
    reason: string,
  ) {
    return this.log({
      userId,
      action: ActivityType.TICKETS_REFUNDED,
      targetType: 'Raffle',
      targetId: raffleId,
      metadata: { ticketCount, amount, reason },
    });
  }

  // ==================== Delivery Events ====================

  async logDeliveryShipped(
    userId: string,
    raffleId: string,
    trackingNumber?: string,
  ) {
    return this.log({
      userId,
      action: ActivityType.DELIVERY_SHIPPED,
      targetType: 'Raffle',
      targetId: raffleId,
      metadata: trackingNumber ? { trackingNumber } : undefined,
    });
  }

  async logDeliveryConfirmed(userId: string, raffleId: string) {
    return this.log({
      userId,
      action: ActivityType.DELIVERY_CONFIRMED,
      targetType: 'Raffle',
      targetId: raffleId,
    });
  }

  // ==================== Dispute Events ====================

  async logDisputeOpened(
    userId: string,
    disputeId: string,
    raffleId: string,
    reason: string,
  ) {
    return this.log({
      userId,
      action: ActivityType.DISPUTE_OPENED,
      targetType: 'Dispute',
      targetId: disputeId,
      metadata: { raffleId, reason },
    });
  }

  async logDisputeResponded(userId: string, disputeId: string) {
    return this.log({
      userId,
      action: ActivityType.DISPUTE_RESPONDED,
      targetType: 'Dispute',
      targetId: disputeId,
    });
  }

  async logDisputeResolved(
    adminId: string,
    disputeId: string,
    resolution: string,
  ) {
    return this.log({
      userId: adminId,
      action: ActivityType.DISPUTE_RESOLVED,
      targetType: 'Dispute',
      targetId: disputeId,
      metadata: { resolution },
    });
  }

  // ==================== Payment Events ====================

  async logPaymentReceived(sellerId: string, raffleId: string, amount: number) {
    return this.log({
      userId: sellerId,
      action: ActivityType.PAYMENT_RECEIVED,
      targetType: 'Raffle',
      targetId: raffleId,
      metadata: { amount },
    });
  }

  async logCreditTopUpCreated(
    userId: string,
    topUpSessionId: string,
    amount: number,
    metadata?: Record<string, unknown>,
  ) {
    return this.log({
      userId,
      action: ActivityType.CREDIT_TOP_UP_CREATED,
      targetType: 'CreditTopUpSession',
      targetId: topUpSessionId,
      metadata: { amount, ...(metadata ?? {}) },
    });
  }

  async logCreditTopUpApproved(
    userId: string,
    topUpSessionId: string,
    amount: number,
    metadata?: Record<string, unknown>,
  ) {
    return this.log({
      userId,
      action: ActivityType.CREDIT_TOP_UP_APPROVED,
      targetType: 'CreditTopUpSession',
      targetId: topUpSessionId,
      metadata: { amount, ...(metadata ?? {}) },
    });
  }

  async logCreditTopUpFailed(
    userId: string,
    topUpSessionId: string,
    status: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.log({
      userId,
      action: ActivityType.CREDIT_TOP_UP_FAILED,
      targetType: 'CreditTopUpSession',
      targetId: topUpSessionId,
      metadata: { status, ...(metadata ?? {}) },
    });
  }

  async logCreditTopUpRefunded(
    userId: string,
    topUpSessionId: string,
    amount: number,
    metadata?: Record<string, unknown>,
  ) {
    return this.log({
      userId,
      action: ActivityType.CREDIT_TOP_UP_REFUNDED,
      targetType: 'CreditTopUpSession',
      targetId: topUpSessionId,
      metadata: { amount, ...(metadata ?? {}) },
    });
  }

  async logPayoutScheduled(
    sellerId: string,
    payoutId: string,
    scheduledFor: Date,
  ) {
    return this.log({
      userId: sellerId,
      action: ActivityType.PAYOUT_SCHEDULED,
      targetType: 'Payout',
      targetId: payoutId,
      metadata: { scheduledFor: scheduledFor.toISOString() },
    });
  }

  async logPayoutReleased(sellerId: string, payoutId: string, amount: number) {
    return this.log({
      userId: sellerId,
      action: ActivityType.PAYOUT_RELEASED,
      targetType: 'Payout',
      targetId: payoutId,
      metadata: { amount },
    });
  }

  async logPayoutFailed(
    sellerId: string,
    payoutId: string,
    reason: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.log({
      userId: sellerId,
      action: ActivityType.PAYOUT_FAILED,
      targetType: 'Payout',
      targetId: payoutId,
      metadata: { reason, ...(metadata ?? {}) },
    });
  }

  async logSellerPaymentAccountConnected(
    userId: string,
    sellerPaymentAccountId: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.log({
      userId,
      action: ActivityType.SELLER_PAYMENT_ACCOUNT_CONNECTED,
      targetType: 'SellerPaymentAccount',
      targetId: sellerPaymentAccountId,
      metadata: {
        sellerPaymentAccountId,
        ...(metadata ?? {}),
      },
    });
  }

  async logSellerPaymentAccountDisconnected(
    userId: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.log({
      userId,
      action: ActivityType.SELLER_PAYMENT_ACCOUNT_DISCONNECTED,
      targetType: 'SellerPaymentAccount',
      targetId: userId,
      metadata,
    });
  }

  // ==================== Social Promotion Events ====================

  async logSocialPromotionDraftCreated(
    sellerId: string,
    draftId: string,
    metadata: {
      raffleId: string;
      network: string;
    },
  ) {
    return this.log({
      userId: sellerId,
      action: ActivityType.SOCIAL_PROMOTION_DRAFT_CREATED,
      targetType: 'SocialPromotionDraft',
      targetId: draftId,
      metadata,
    });
  }

  async logSocialPromotionPostSubmitted(
    sellerId: string,
    postId: string,
    metadata: {
      raffleId: string;
      draftId: string;
      network: string;
      canonicalPermalink?: string | null;
    },
  ) {
    return this.log({
      userId: sellerId,
      action: ActivityType.SOCIAL_PROMOTION_POST_SUBMITTED,
      targetType: 'SocialPromotionPost',
      targetId: postId,
      metadata,
    });
  }

  async logSocialPromotionPostDisqualified(
    sellerId: string,
    postId: string,
    metadata: {
      raffleId: string;
      network: string;
      reason: string;
      disqualifiedBy?: 'system' | 'admin';
    },
  ) {
    return this.log({
      userId: sellerId,
      action: ActivityType.SOCIAL_PROMOTION_POST_DISQUALIFIED,
      targetType: 'SocialPromotionPost',
      targetId: postId,
      metadata,
    });
  }

  async logSocialPromotionSettled(
    sellerId: string,
    postId: string,
    metadata: {
      raffleId: string;
      settlementId: string;
      score: number;
      tier?: string;
      network?: string;
    },
  ) {
    return this.log({
      userId: sellerId,
      action: ActivityType.SOCIAL_PROMOTION_SETTLED,
      targetType: 'SocialPromotionPost',
      targetId: postId,
      metadata,
    });
  }

  async logSocialPromotionGrantIssued(
    sellerId: string,
    grantId: string,
    metadata: {
      postId: string;
      raffleId: string;
      settlementId: string;
      score: number;
      tier: string;
      discountPercent: number;
      maxDiscountAmount: number;
      network?: string;
    },
  ) {
    return this.log({
      userId: sellerId,
      action: ActivityType.SOCIAL_PROMOTION_GRANT_ISSUED,
      targetType: 'PromotionBonusGrant',
      targetId: grantId,
      metadata,
    });
  }

  async logSocialPromotionBonusUsed(
    buyerId: string,
    redemptionId: string,
    metadata: {
      raffleId: string;
      grantId: string;
      discountApplied: number;
      cashChargedAmount: number;
    },
  ) {
    return this.log({
      userId: buyerId,
      action: ActivityType.SOCIAL_PROMOTION_BONUS_USED,
      targetType: 'PromotionBonusRedemption',
      targetId: redemptionId,
      metadata,
    });
  }

  async logSocialPromotionBonusReversed(
    buyerId: string,
    redemptionId: string,
    metadata: {
      raffleId: string;
      grantId: string;
      refundAmount: number;
      discountApplied: number;
    },
  ) {
    return this.log({
      userId: buyerId,
      action: ActivityType.SOCIAL_PROMOTION_BONUS_REVERSED,
      targetType: 'PromotionBonusRedemption',
      targetId: redemptionId,
      metadata,
    });
  }

  // ==================== Profile Events ====================

  async logProfileUpdated(userId: string, fields: string[]) {
    return this.log({
      userId,
      action: ActivityType.PROFILE_UPDATED,
      metadata: { updatedFields: fields },
    });
  }

  async logShippingAddressAdded(userId: string, addressId: string) {
    return this.log({
      userId,
      action: ActivityType.SHIPPING_ADDRESS_ADDED,
      targetType: 'ShippingAddress',
      targetId: addressId,
    });
  }

  // ==================== Query Methods ====================

  async getActivityForUser(userId: string, limit = 50, offset = 0) {
    return this.prisma.activityLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async getRecentActivity(limit = 100) {
    return this.prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { id: true, email: true, nombre: true } },
      },
    });
  }
}
