import {
  Inject,
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Brevo from '@getbrevo/brevo';
import { PubSub } from 'graphql-subscriptions';
import { PrismaService } from '../prisma/prisma.service';
import {
  BRAND_NAME,
  DEFAULT_EMAIL_FROM,
  DEFAULT_EMAIL_FROM_NAME,
} from '../common/constants/brand.constants';
import {
  getAdminNewKycSubmissionContent,
  getCreditTopUpApprovedContent,
  getCreditTopUpFailedContent,
  getCreditTopUpRefundedContent,
  getDeliveryConfirmedToSellerContent,
  getDeliveryReminderToWinnerContent,
  getDisputeOpenedToBuyerContent,
  getDisputeOpenedToSellerContent,
  getDisputeResolvedNotificationContent,
  getDisputeSellerRespondedContent,
  getEmailVerificationCodeContent,
  getKycApprovedContent,
  getKycRejectedContent,
  getNewQuestionNotificationContent,
  getPasswordResetConfirmationContent,
  getPasswordResetContent,
  getPaymentWillBeReleasedNotificationContent,
  getPayoutFailedNotificationContent,
  getPromotionBonusGrantIssuedContent,
  getPriceDropAlertContent,
  getPrizeShippedContent,
  getPriceReductionSuggestionContent,
  getQuestionAnsweredNotificationContent,
  getRaffleCancelledNotificationContent,
  getRaffleCompletedNotificationContent,
  getRaffleExpirationReminderContent,
  getRaffleParticipantNotificationContent,
  getRefundDueToDisputeNotificationContent,
  getRefundNotificationContent,
  getSellerReviewReceivedContent,
  getTwoFactorDisabledContent,
  getTwoFactorEnabledContent,
  getTwoFactorRecoveryCodeUsedContent,
  getSellerMustContactWinnerContent,
  getSellerMustRespondDisputeContent,
  getSellerPaymentNotificationContent,
  getSellerTicketPurchasedContent,
  getStripeConnectSuccessNotificationContent,
  getTicketPurchaseConfirmationContent,
  getWelcomeEmailContent,
  getWinnerNotificationContent,
} from './email-templates';
import { captureException } from '../sentry';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * NotificationsService - Handles all email communications
 * Uses Brevo (formerly Sendinblue) for email delivery via HTTP API
 */

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly brevoApi: Brevo.TransactionalEmailsApi | null;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly isProduction: boolean;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    @Inject('PUB_SUB') private readonly pubSub: PubSub,
  ) {
    this.fromEmail =
      this.configService.get<string>('EMAIL_FROM') || DEFAULT_EMAIL_FROM;
    this.fromName =
      this.configService.get<string>('EMAIL_FROM_NAME') ||
      DEFAULT_EMAIL_FROM_NAME;

    // Check if we have Brevo API key
    const brevoApiKey = this.configService.get<string>('BREVO_API_KEY');

    this.isProduction = !!brevoApiKey && brevoApiKey !== 'mock';

    if (this.isProduction && brevoApiKey) {
      this.brevoApi = new Brevo.TransactionalEmailsApi();
      this.brevoApi.setApiKey(
        Brevo.TransactionalEmailsApiApiKeys.apiKey,
        brevoApiKey,
      );
      this.logger.log('✅ Brevo email service initialized');
    } else {
      this.brevoApi = null;
      this.logger.warn('⚠️ Email service in MOCK mode (no BREVO_API_KEY)');
    }
  }

  // ==================== In-App Notifications ====================

  async create(
    userId: string,
    type: string,
    title: string,
    message: string,
    actionUrl?: string,
  ) {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        actionUrl,
      },
    });

    await this.pubSub.publish('notificationAdded', {
      notificationAdded: notification,
    });

    return notification;
  }

  async findAll(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markAsRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: { id: true, userId: true, read: true },
    });

    if (!notification) {
      throw new NotFoundException('Notificación no encontrada');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException(
        'No tienes permisos para modificar esta notificación',
      );
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  // ==================== Core Email Method ====================

  private async sendEmail(options: EmailOptions): Promise<boolean> {
    if (this.brevoApi && this.isProduction) {
      try {
        const sendSmtpEmail = new Brevo.SendSmtpEmail();
        sendSmtpEmail.sender = { name: this.fromName, email: this.fromEmail };
        sendSmtpEmail.to = [{ email: options.to }];
        sendSmtpEmail.subject = options.subject;
        sendSmtpEmail.htmlContent = options.html;

        const result = await this.brevoApi.sendTransacEmail(sendSmtpEmail);

        this.logger.log(
          `📧 Email sent: ${options.subject} -> ${options.to} (ID: ${result.body.messageId})`,
        );
        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Email error: ${message}`);
        captureException(
          error instanceof Error ? error : new Error('Email delivery failed'),
          {
            tags: {
              service: 'luk-backend',
              domain: 'notifications',
              stage: 'email',
            },
            extra: {
              to: options.to,
              subject: options.subject,
            },
          },
        );
        return false;
      }
    } else {
      // Mock mode - log email content
      this.logger.log(`📧 [MOCK] Email to: ${options.to}`);
      this.logger.log(`   Subject: ${options.subject}`);
      this.logger.debug(
        `   Body preview: ${options.html.substring(0, 150)}...`,
      );
      return true;
    }
  }

  // ==================== Auth Notifications ====================

  async sendWelcomeEmail(email: string, data: { userName: string }) {
    const html = getWelcomeEmailContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: `¡Bienvenido a ${BRAND_NAME}!`,
      html,
    });
  }

  async sendEmailVerificationCode(
    email: string,
    data: { userName: string; code: string; expiresInMinutes: number },
  ) {
    const html = getEmailVerificationCodeContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: 'Verificá tu email - Código de confirmación',
      html,
    });
  }

  async sendPasswordResetEmail(
    email: string,
    data: { userName: string; resetToken: string; expiresInMinutes: number },
  ) {
    const html = getPasswordResetContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: 'Restablecé tu contraseña',
      html,
    });
  }

  async sendPasswordResetConfirmationEmail(
    email: string,
    data: { userName: string },
  ) {
    const html = getPasswordResetConfirmationContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: 'Tu contraseña fue actualizada',
      html,
    });
  }

  async sendTwoFactorEnabledNotification(
    email: string,
    data: { userName: string },
  ) {
    const html = getTwoFactorEnabledContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: '🔐 La autenticación en dos pasos ya está activa',
      html,
    });
  }

  async sendTwoFactorDisabledNotification(
    email: string,
    data: { userName: string },
  ) {
    const html = getTwoFactorDisabledContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: '⚠️ La autenticación en dos pasos fue desactivada',
      html,
    });
  }

  async sendTwoFactorRecoveryCodeUsedNotification(
    email: string,
    data: { userName: string; remainingRecoveryCodesCount: number },
  ) {
    const html = getTwoFactorRecoveryCodeUsedContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: '🔐 Se usó un código de recuperación en tu cuenta',
      html,
    });
  }

  async sendPromotionBonusGrantIssuedEmail(
    email: string,
    data: {
      userName: string;
      raffleName: string;
      discountPercent: number;
      maxDiscountAmount: number;
      expiresAt: Date;
    },
  ) {
    const html = getPromotionBonusGrantIssuedContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: '🎁 Ganaste una bonificación promocional',
      html,
    });
  }

  // ==================== Wallet Notifications ====================

  async sendCreditTopUpApprovedNotification(
    email: string,
    data: {
      amount: number;
      topUpSessionId: string;
      providerPaymentId?: string | null;
      providerOrderId?: string | null;
    },
  ) {
    const html = getCreditTopUpApprovedContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: '✅ Saldo LUK acreditado',
      html,
    });
  }

  async sendCreditTopUpFailedNotification(
    email: string,
    data: { amount: number; status: string; statusDetail?: string | null },
  ) {
    const html = getCreditTopUpFailedContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: 'No pudimos acreditar tu Saldo LUK',
      html,
    });
  }

  async sendCreditTopUpRefundedNotification(
    email: string,
    data: { amount: number; fullRefund: boolean },
  ) {
    const html = getCreditTopUpRefundedContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: 'Reintegro de Saldo LUK procesado',
      html,
    });
  }

  // ==================== Raffle Notifications ====================

  async sendTicketPurchaseConfirmation(
    email: string,
    data: {
      raffleName: string;
      purchaseReference: string;
      ticketNumbers: number[];
      amount: number;
      packApplied?: boolean;
      baseQuantity?: number;
      bonusQuantity?: number;
      grantedQuantity?: number;
      subsidyAmount?: number;
    },
  ) {
    const html = getTicketPurchaseConfirmationContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: `✅ Confirmación de compra - ${data.raffleName}`,
      html,
    });
  }

  async sendRaffleCompletedNotification(
    email: string,
    data: { raffleName: string },
  ) {
    const html = getRaffleCompletedNotificationContent(
      data,
      this.configService,
    );
    return this.sendEmail({
      to: email,
      subject: `🎯 Rifa completada - ${data.raffleName}`,
      html,
    });
  }

  async sendWinnerNotification(
    email: string,
    data: {
      raffleName: string;
      productName: string;
      sellerEmail: string;
      winningTicketNumber: number;
    },
  ) {
    const html = getWinnerNotificationContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: `🎉 ¡GANASTE! - ${data.raffleName}`,
      html,
    });
  }

  async sendRaffleParticipantNotification(
    email: string,
    data: { raffleName: string; winnerName: string },
  ) {
    const html = getRaffleParticipantNotificationContent(
      data,
      this.configService,
    );
    return this.sendEmail({
      to: email,
      subject: `Resultado del sorteo - ${data.raffleName}`,
      html,
    });
  }

  async sendRefundNotification(
    email: string,
    data: { raffleName: string; amount: number; reason: string },
  ) {
    const html = getRefundNotificationContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: `💰 Reembolso procesado - ${data.raffleName}`,
      html,
    });
  }

  async sendSellerPaymentNotification(
    email: string,
    data: { raffleName: string; amount: number; fees: number },
  ) {
    const html = getSellerPaymentNotificationContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: `💰 Pago recibido - ${data.raffleName}`,
      html,
    });
  }

  async sendPayoutFailedNotification(
    email: string,
    data: { raffleName: string; amount: number; reason: string },
  ) {
    const html = getPayoutFailedNotificationContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: `No pudimos procesar tu pago - ${data.raffleName}`,
      html,
    });
  }

  async sendPriceReductionSuggestion(
    email: string,
    data: {
      raffleName: string;
      currentPrice: number;
      suggestedPrice: number;
      percentageSold: number;
      raffleId: string;
      priceReductionId: string;
    },
  ) {
    const html = getPriceReductionSuggestionContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: `📉 Sugerencia de precio - ${data.raffleName}`,
      html,
    });
  }

  async sendRaffleCancelledNotification(
    email: string,
    data: { raffleName: string; reason: string },
  ) {
    const html = getRaffleCancelledNotificationContent(
      data,
      this.configService,
    );
    return this.sendEmail({
      to: email,
      subject: `❌ Rifa cancelada - ${data.raffleName}`,
      html,
    });
  }

  async sendRaffleExpirationReminder(
    email: string,
    data: {
      raffleName: string;
      deadline: Date;
      soldTickets: number;
      totalTickets: number;
    },
  ) {
    const html = getRaffleExpirationReminderContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: `Tu rifa está por vencer - ${data.raffleName}`,
      html,
    });
  }

  // ==================== Delivery Notifications ====================

  async sendSellerMustContactWinner(
    email: string,
    data: {
      raffleName: string;
      winnerEmail: string;
      winningTicketNumber: number;
    },
  ) {
    const html = getSellerMustContactWinnerContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: `🚀 ¡Acción requerida! Contacta al ganador - ${data.raffleName}`,
      html,
    });
  }

  async sendDeliveryReminderToWinner(
    email: string,
    data: { raffleName: string; daysSinceShipped: number },
  ) {
    const html = getDeliveryReminderToWinnerContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: `📦 ¿Recibiste tu producto? - ${data.raffleName}`,
      html,
    });
  }

  async sendPaymentWillBeReleasedNotification(
    email: string,
    data: { raffleName: string; daysRemaining: number },
  ) {
    const html = getPaymentWillBeReleasedNotificationContent(
      data,
      this.configService,
    );
    return this.sendEmail({
      to: email,
      subject: `⏰ Pago próximo a liberarse - ${data.raffleName}`,
      html,
    });
  }

  // ==================== Shipping Notifications ====================

  async sendPrizeShippedNotification(
    email: string,
    data: { raffleName: string; trackingNumber?: string },
  ) {
    const html = getPrizeShippedContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: `📦 ¡Tu premio fue enviado! - ${data.raffleName}`,
      html,
    });
  }

  async sendDeliveryConfirmedToSellerNotification(
    email: string,
    data: { raffleName: string },
  ) {
    const html = getDeliveryConfirmedToSellerContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: `✅ ¡Entrega confirmada! - ${data.raffleName}`,
      html,
    });
  }

  // ==================== Dispute Notifications ====================

  async sendDisputeOpenedToSeller(
    email: string,
    data: { raffleName: string; disputeType: string; disputeTitle: string },
  ) {
    const html = getDisputeOpenedToSellerContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: `⚠️ Disputa abierta - ${data.raffleName}`,
      html,
    });
  }

  async sendDisputeOpenedToBuyer(
    email: string,
    data: { raffleName: string; disputeId: string },
  ) {
    const html = getDisputeOpenedToBuyerContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: `📝 Disputa registrada - ${data.raffleName}`,
      html,
    });
  }

  async sendSellerMustRespondDispute(
    email: string,
    data: { raffleName: string; hoursRemaining: number },
  ) {
    const html = getSellerMustRespondDisputeContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: `⚠️ URGENTE: Responde la disputa - ${data.raffleName}`,
      html,
    });
  }

  async sendDisputeSellerRespondedNotification(
    email: string,
    data: { raffleName: string },
  ) {
    const html = getDisputeSellerRespondedContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: `📩 El vendedor respondió a tu disputa - ${data.raffleName}`,
      html,
    });
  }

  async sendDisputeResolvedNotification(
    email: string,
    data: { raffleName: string; resolution: string; refundAmount?: number },
  ) {
    const html = getDisputeResolvedNotificationContent(
      data,
      this.configService,
    );
    return this.sendEmail({
      to: email,
      subject: `✅ Disputa resuelta - ${data.raffleName}`,
      html,
    });
  }

  async sendRefundDueToDisputeNotification(
    email: string,
    data: { raffleName: string; amount: number },
  ) {
    const html = getRefundDueToDisputeNotificationContent(
      data,
      this.configService,
    );
    return this.sendEmail({
      to: email,
      subject: `💰 Reembolso por disputa - ${data.raffleName}`,
      html,
    });
  }

  // ==================== Stripe Connect Notifications ====================

  async sendStripeConnectSuccessNotification(
    email: string,
    data: { userName: string },
  ) {
    const html = getStripeConnectSuccessNotificationContent(
      data,
      this.configService,
    );
    return this.sendEmail({
      to: email,
      subject: '✅ ¡Cuenta conectada!',
      html,
    });
  }

  // ==================== Price Alert Notifications ====================

  async sendPriceDropAlert(
    email: string,
    data: {
      raffleName: string;
      oldPrice: number;
      newPrice: number;
      dropPercent: number;
      raffleUrl: string;
    },
  ) {
    const html = getPriceDropAlertContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: `📉 ¡Precio reducido! ${data.raffleName} ahora $${data.newPrice}`,
      html,
    });
  }

  // ==================== KYC Notifications ====================

  async sendAdminNewKycSubmission(
    email: string,
    data: { userName: string; userEmail: string; submittedAt: Date },
  ) {
    const html = getAdminNewKycSubmissionContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: '📋 Nueva solicitud de KYC pendiente de revisión',
      html,
    });
  }

  async sendKycApprovedNotification(email: string, data: { userName: string }) {
    const html = getKycApprovedContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: '✅ ¡Tu verificación KYC fue aprobada!',
      html,
    });
  }

  async sendKycRejectedNotification(
    email: string,
    data: { userName: string; rejectionReason: string },
  ) {
    const html = getKycRejectedContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: '❌ Tu verificación KYC necesita correcciones',
      html,
    });
  }

  // ==================== Question Notifications ====================

  async sendNewQuestionNotification(
    email: string,
    data: {
      sellerName: string;
      raffleName: string;
      questionContent: string;
      askerName: string;
      raffleId: string;
    },
  ) {
    const html = getNewQuestionNotificationContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: `💬 Nueva pregunta en "${data.raffleName}"`,
      html,
    });
  }

  async sendQuestionAnsweredNotification(
    email: string,
    data: {
      buyerName: string;
      raffleName: string;
      questionContent: string;
      answerContent: string;
      sellerName: string;
      raffleId: string;
    },
  ) {
    const html = getQuestionAnsweredNotificationContent(
      data,
      this.configService,
    );
    return this.sendEmail({
      to: email,
      subject: `✅ Tu pregunta en "${data.raffleName}" fue respondida`,
      html,
    });
  }

  async sendSellerReviewReceivedNotification(
    email: string,
    data: {
      sellerName: string;
      sellerId: string;
      reviewerName: string;
      raffleName: string;
      rating: number;
      comentario?: string | null;
    },
  ) {
    const html = getSellerReviewReceivedContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: `Nueva reseña recibida - ${data.raffleName}`,
      html,
    });
  }

  // ==================== Seller Ticket Purchase Notification ====================

  async sendSellerTicketPurchasedNotification(
    email: string,
    data: {
      sellerName: string;
      raffleName: string;
      ticketCount: number;
      amount: number;
      soldTickets: number;
      totalTickets: number;
      raffleId: string;
      packApplied?: boolean;
      baseQuantity?: number;
      bonusQuantity?: number;
      grantedQuantity?: number;
      subsidyAmount?: number;
    },
  ) {
    const html = getSellerTicketPurchasedContent(data, this.configService);
    return this.sendEmail({
      to: email,
      subject: `🎉 ¡Nueva venta! ${data.ticketCount} ticket(s) en "${data.raffleName}"`,
      html,
    });
  }
}
