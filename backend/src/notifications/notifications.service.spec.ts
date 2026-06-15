import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

type MockPrismaService = {
  notification: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
};

type MockPubSub = {
  publish: jest.Mock;
  asyncIterableIterator: jest.Mock;
};

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: MockPrismaService;
  let pubSub: MockPubSub;
  let configService: ConfigService;

  const mockPrismaService = (): MockPrismaService => ({
    notification: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  });

  const mockPubSub = (): MockPubSub => ({
    publish: jest.fn(),
    asyncIterableIterator: jest.fn(),
  });

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        EMAIL_FROM: 'test@example.com',
        EMAIL_FROM_NAME: 'Test Service',
        BREVO_API_KEY: 'mock', // Mock mode for testing
      };
      return config[key];
    }),
  };

  const getSendEmailSpy = () =>
    jest.spyOn(
      service as unknown as {
        sendEmail: (options: unknown) => Promise<boolean>;
      },
      'sendEmail',
    );

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrismaService() },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: 'PUB_SUB', useValue: mockPubSub() },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    prisma = module.get(PrismaService) as unknown as MockPrismaService;
    pubSub = module.get('PUB_SUB') as unknown as MockPubSub;
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('In-App Notifications', () => {
    describe('create', () => {
      it('should create notification and publish to PubSub', async () => {
        const mockNotification = {
          id: 'notif-1',
          userId: 'user-1',
          type: 'TICKET_PURCHASED',
          title: 'Ticket comprado',
          message: 'Compraste 3 tickets',
          read: false,
          createdAt: new Date(),
        };

        prisma.notification.create.mockResolvedValue(mockNotification);

        await service.create(
          'user-1',
          'TICKET_PURCHASED',
          'Ticket comprado',
          'Compraste 3 tickets',
        );

        expect(prisma.notification.create).toHaveBeenCalledWith({
          data: {
            userId: 'user-1',
            type: 'TICKET_PURCHASED',
            title: 'Ticket comprado',
            message: 'Compraste 3 tickets',
          },
        });

        expect(pubSub.publish).toHaveBeenCalledWith('notificationAdded', {
          notificationAdded: mockNotification,
        });
      });
    });

    describe('findAll', () => {
      it('should return user notifications ordered by createdAt desc', async () => {
        const mockNotifications = [
          {
            id: 'notif-2',
            userId: 'user-1',
            title: 'Test 2',
            createdAt: new Date('2025-01-02'),
          },
          {
            id: 'notif-1',
            userId: 'user-1',
            title: 'Test 1',
            createdAt: new Date('2025-01-01'),
          },
        ];

        prisma.notification.findMany.mockResolvedValue(mockNotifications);

        const result = await service.findAll('user-1');

        expect(result).toEqual(mockNotifications);
        expect(prisma.notification.findMany).toHaveBeenCalledWith({
          where: { userId: 'user-1' },
          orderBy: { createdAt: 'desc' },
        });
      });
    });

    describe('markAsRead', () => {
      it('should update notification read status', async () => {
        const mockNotification = {
          id: 'notif-1',
          userId: 'user-1',
          read: true,
        };
        prisma.notification.findUnique.mockResolvedValue({
          id: 'notif-1',
          userId: 'user-1',
          read: false,
        });
        prisma.notification.update.mockResolvedValue(mockNotification);

        await service.markAsRead('notif-1', 'user-1');

        expect(prisma.notification.findUnique).toHaveBeenCalledWith({
          where: { id: 'notif-1' },
          select: { id: true, userId: true, read: true },
        });
        expect(prisma.notification.update).toHaveBeenCalledWith({
          where: { id: 'notif-1' },
          data: { read: true },
        });
      });
    });

    describe('markAllAsRead', () => {
      it('should batch update all unread notifications', async () => {
        prisma.notification.updateMany.mockResolvedValue({ count: 5 });

        await service.markAllAsRead('user-1');

        expect(prisma.notification.updateMany).toHaveBeenCalledWith({
          where: { userId: 'user-1', read: false },
          data: { read: true },
        });
      });
    });
  });

  describe('Email Sending', () => {
    describe('sendWelcomeEmail', () => {
      it('should send welcome email with user name', async () => {
        const result = await service.sendWelcomeEmail('test@example.com', {
          userName: 'Juan',
        });

        // In mock mode, should return true
        expect(result).toBe(true);
      });
    });

    describe('sendEmailVerificationCode', () => {
      it('should send verification code email', async () => {
        const result = await service.sendEmailVerificationCode(
          'test@example.com',
          {
            userName: 'Juan',
            code: '123456',
            expiresInMinutes: 15,
          },
        );

        expect(result).toBe(true);
      });
    });

    describe('sendPasswordResetEmail', () => {
      it('should send a reset email with the reset-password URL and CTA', async () => {
        const sendEmailSpy = getSendEmailSpy().mockResolvedValue(true);

        const result = await service.sendPasswordResetEmail(
          'test@example.com',
          {
            userName: 'Juan',
            resetToken: 'reset-token',
            expiresInMinutes: 30,
          },
        );

        expect(result).toBe(true);
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            to: 'test@example.com',
            subject: 'Restablecé tu contraseña',
            html: expect.stringContaining(
              '/auth/reset-password?token=reset-token',
            ),
          }),
        );
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.stringContaining('Restablecer contraseña'),
          }),
        );
      });
    });

    describe('sendPasswordResetConfirmationEmail', () => {
      it('should send a confirmation email after a password reset', async () => {
        const sendEmailSpy = getSendEmailSpy().mockResolvedValue(true);

        const result = await service.sendPasswordResetConfirmationEmail(
          'test@example.com',
          {
            userName: 'Juan',
          },
        );

        expect(result).toBe(true);
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            to: 'test@example.com',
            subject: 'Tu contraseña fue actualizada',
            html: expect.stringContaining('Si no fuiste vos'),
          }),
        );
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.stringContaining('/auth/login'),
          }),
        );
      });
    });

    describe('sendTwoFactorEnabledNotification', () => {
      it('should send the 2FA enabled security email with settings CTA', async () => {
        const sendEmailSpy = getSendEmailSpy().mockResolvedValue(true);

        const result = await service.sendTwoFactorEnabledNotification(
          'test@example.com',
          {
            userName: 'Juan',
          },
        );

        expect(result).toBe(true);
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            subject: '🔐 La autenticación en dos pasos ya está activa',
            html: expect.stringContaining('Revisar seguridad'),
          }),
        );
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.stringContaining('/dashboard/settings'),
          }),
        );
      });
    });

    describe('sendTwoFactorDisabledNotification', () => {
      it('should send the 2FA disabled security email', async () => {
        const sendEmailSpy = getSendEmailSpy().mockResolvedValue(true);

        const result = await service.sendTwoFactorDisabledNotification(
          'test@example.com',
          {
            userName: 'Juan',
          },
        );

        expect(result).toBe(true);
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            subject: '⚠️ La autenticación en dos pasos fue desactivada',
            html: expect.stringContaining('ya no requiere un segundo factor'),
          }),
        );
      });
    });

    describe('sendTwoFactorRecoveryCodeUsedNotification', () => {
      it('should send the recovery-code usage email with remaining code count', async () => {
        const sendEmailSpy = getSendEmailSpy().mockResolvedValue(true);

        const result = await service.sendTwoFactorRecoveryCodeUsedNotification(
          'test@example.com',
          {
            userName: 'Juan',
            remainingRecoveryCodesCount: 2,
          },
        );

        expect(result).toBe(true);
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            subject: '🔐 Se usó un código de recuperación en tu cuenta',
            html: expect.stringContaining(
              'Te quedan 2 códigos de recuperación.',
            ),
          }),
        );
      });
    });

    describe('sendPromotionBonusGrantIssuedEmail', () => {
      it('should send promotion bonus grant email with CTA and grant details', async () => {
        const sendEmailSpy = getSendEmailSpy().mockResolvedValue(true);

        const result = await service.sendPromotionBonusGrantIssuedEmail(
          'seller@example.com',
          {
            userName: 'Juan',
            raffleName: 'iPhone 15 Pro',
            discountPercent: 10,
            maxDiscountAmount: 15000,
            expiresAt: new Date('2026-04-15T12:00:00.000Z'),
          },
        );

        expect(result).toBe(true);
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            to: 'seller@example.com',
            subject: '🎁 Ganaste una bonificación promocional',
            html: expect.stringContaining(
              'publicación promocional para la rifa',
            ),
          }),
        );
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.stringContaining('10% off hasta $15.000'),
          }),
        );
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.stringContaining('Ver mis bonificaciones'),
          }),
        );
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.stringContaining('/dashboard/tickets'),
          }),
        );
      });
    });

    describe('sendTicketPurchaseConfirmation', () => {
      it('should send ticket purchase confirmation', async () => {
        const result = await service.sendTicketPurchaseConfirmation(
          'test@example.com',
          {
            raffleName: 'iPhone 15 Pro',
            purchaseReference: 'purchase-ref-1',
            ticketNumbers: [1, 2, 3],
            amount: 1500,
          },
        );

        expect(result).toBe(true);
      });

      it('should render pack details when the purchase includes a pack bonus', async () => {
        const sendEmailSpy = getSendEmailSpy().mockResolvedValue(true);

        const result = await service.sendTicketPurchaseConfirmation(
          'test@example.com',
          {
            raffleName: 'iPhone 15 Pro',
            purchaseReference: 'purchase-ref-1',
            ticketNumbers: [1, 2, 3, 4, 5, 6],
            amount: 2500,
            packApplied: true,
            baseQuantity: 5,
            bonusQuantity: 1,
            grantedQuantity: 6,
            subsidyAmount: 500,
          },
        );

        expect(result).toBe(true);
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.stringContaining('Pack simple aplicado'),
          }),
        );
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.stringContaining('Pagaste 5 ticket(s)'),
          }),
        );
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.stringMatching(/LUK subsidió[\s\S]*\$500\.00/),
          }),
        );
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.stringContaining(
              '/dashboard/tickets/receipts/purchase-ref-1',
            ),
          }),
        );
      });

      it('should not render pack details when the purchase is normal', async () => {
        const sendEmailSpy = getSendEmailSpy().mockResolvedValue(true);

        await service.sendTicketPurchaseConfirmation('test@example.com', {
          raffleName: 'iPhone 15 Pro',
          purchaseReference: 'purchase-ref-1',
          ticketNumbers: [1, 2, 3],
          amount: 1500,
        });

        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.not.stringContaining('Pack simple aplicado'),
          }),
        );
      });
    });

    describe('sendCreditTopUpApprovedNotification', () => {
      it('should render the wallet receipt CTA and provider identifiers', async () => {
        const sendEmailSpy = getSendEmailSpy().mockResolvedValue(true);

        const result = await service.sendCreditTopUpApprovedNotification(
          'test@example.com',
          {
            amount: 3000,
            topUpSessionId: 'topup-1',
            providerPaymentId: 'mp-payment-1',
            providerOrderId: 'preference-1',
          },
        );

        expect(result).toBe(true);
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            subject: '✅ Saldo LUK acreditado',
            html: expect.stringContaining('/dashboard/wallet/receipts/topup-1'),
          }),
        );
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.stringContaining('mp-payment-1'),
          }),
        );
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.stringContaining('preference-1'),
          }),
        );
      });
    });

    describe('sendRaffleCompletedNotification', () => {
      it('should send raffle completed notification', async () => {
        const result = await service.sendRaffleCompletedNotification(
          'test@example.com',
          {
            raffleName: 'iPhone 15 Pro',
          },
        );

        expect(result).toBe(true);
      });
    });

    describe('sendWinnerNotification', () => {
      it('should include the winning number in the winner email', async () => {
        const sendEmailSpy = getSendEmailSpy().mockResolvedValue(true);

        const result = await service.sendWinnerNotification(
          'winner@example.com',
          {
            raffleName: 'iPhone 15 Pro',
            productName: 'iPhone 15 Pro 256GB',
            sellerEmail: 'seller@example.com',
            winningTicketNumber: 42,
          },
        );

        expect(result).toBe(true);
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.stringContaining('Número ganador'),
          }),
        );
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.stringContaining('42'),
          }),
        );
      });
    });

    describe('sendRaffleParticipantNotification', () => {
      it('should send notification to non-winners', async () => {
        const result = await service.sendRaffleParticipantNotification(
          'buyer@example.com',
          {
            raffleName: 'iPhone 15 Pro',
            winnerName: 'Juan Pérez',
          },
        );

        expect(result).toBe(true);
      });
    });

    describe('sendRefundNotification', () => {
      it('should send refund notification', async () => {
        const result = await service.sendRefundNotification(
          'buyer@example.com',
          {
            raffleName: 'iPhone 15 Pro',
            amount: 1500,
            reason: 'Rifa cancelada por no alcanzar el 70% de ventas',
          },
        );

        expect(result).toBe(true);
      });
    });

    describe('sendSellerPaymentNotification', () => {
      it('should send seller payment notification', async () => {
        const result = await service.sendSellerPaymentNotification(
          'seller@example.com',
          {
            raffleName: 'iPhone 15 Pro',
            amount: 45000,
            fees: 4500,
          },
        );

        expect(result).toBe(true);
      });
    });

    describe('sendRaffleCancelledNotification', () => {
      it('should send raffle cancelled notification', async () => {
        const result = await service.sendRaffleCancelledNotification(
          'seller@example.com',
          {
            raffleName: 'iPhone 15 Pro',
            reason: 'No se alcanzó el 70% de tickets vendidos',
          },
        );

        expect(result).toBe(true);
      });
    });

    describe('sendPriceReductionSuggestion', () => {
      it('should send price reduction suggestion to seller', async () => {
        const result = await service.sendPriceReductionSuggestion(
          'seller@example.com',
          {
            raffleName: 'iPhone 15 Pro',
            currentPrice: 500,
            suggestedPrice: 350,
            percentageSold: 45,
            raffleId: 'raffle-1',
            priceReductionId: 'pr-1',
          },
        );

        expect(result).toBe(true);
      });
    });

    describe('sendSellerReviewReceivedNotification', () => {
      it('should send seller review notification with rating and comment', async () => {
        const sendEmailSpy = getSendEmailSpy().mockResolvedValue(true);

        const result = await service.sendSellerReviewReceivedNotification(
          'seller@example.com',
          {
            sellerName: 'Seller Pro',
            sellerId: 'seller-1',
            reviewerName: 'Buyer Winner',
            raffleName: 'MacBook QA',
            rating: 5,
            comentario: 'Excelente entrega',
          },
        );

        expect(result).toBe(true);
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            to: 'seller@example.com',
            subject: 'Nueva reseña recibida - MacBook QA',
            html: expect.stringContaining('Recibiste una nueva reseña'),
          }),
        );
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.stringContaining('Excelente entrega'),
          }),
        );
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.stringContaining('/seller/seller-1'),
          }),
        );
      });

      it('should escape user-generated review comments in email HTML', async () => {
        const sendEmailSpy = getSendEmailSpy().mockResolvedValue(true);

        await service.sendSellerReviewReceivedNotification(
          'seller@example.com',
          {
            sellerName: 'Seller Pro',
            sellerId: 'seller-1',
            reviewerName: 'Buyer Winner',
            raffleName: 'MacBook QA',
            rating: 5,
            comentario: '<b>bad</b>',
          },
        );

        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.stringContaining('&lt;b&gt;bad&lt;/b&gt;'),
          }),
        );
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.not.stringContaining('"<b>bad</b>"'),
          }),
        );
      });
    });

    describe('sendSellerTicketPurchasedNotification', () => {
      it('should render pack details for seller notifications when LUK subsidizes bonus tickets', async () => {
        const sendEmailSpy = getSendEmailSpy().mockResolvedValue(true);

        const result = await service.sendSellerTicketPurchasedNotification(
          'seller@example.com',
          {
            sellerName: 'Seller Pro',
            raffleName: 'MacBook Pro',
            ticketCount: 6,
            amount: 3000,
            soldTickets: 12,
            totalTickets: 20,
            raffleId: 'raffle-1',
            packApplied: true,
            baseQuantity: 5,
            bonusQuantity: 1,
            grantedQuantity: 6,
            subsidyAmount: 500,
          },
        );

        expect(result).toBe(true);
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.stringContaining('Tickets bonus:'),
          }),
        );
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.stringContaining('Subsidio LUK:'),
          }),
        );
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.stringContaining('no reducen el cobro de esta venta'),
          }),
        );
      });
    });
  });

  describe('Delivery Notifications', () => {
    describe('sendSellerMustContactWinner', () => {
      it('should include the winning number in the seller email', async () => {
        const sendEmailSpy = getSendEmailSpy().mockResolvedValue(true);

        const result = await service.sendSellerMustContactWinner(
          'seller@example.com',
          {
            raffleName: 'iPhone 15 Pro',
            winnerEmail: 'winner@example.com',
            winningTicketNumber: 42,
          },
        );

        expect(result).toBe(true);
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.stringContaining('Número ganador'),
          }),
        );
        expect(sendEmailSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.stringContaining('42'),
          }),
        );
      });
    });

    describe('sendDeliveryReminderToWinner', () => {
      it('should send delivery reminder to winner', async () => {
        const result = await service.sendDeliveryReminderToWinner(
          'winner@example.com',
          {
            raffleName: 'iPhone 15 Pro',
            daysSinceShipped: 3,
          },
        );

        expect(result).toBe(true);
      });
    });

    describe('sendPaymentWillBeReleasedNotification', () => {
      it('should send payment release warning', async () => {
        const result = await service.sendPaymentWillBeReleasedNotification(
          'winner@example.com',
          {
            raffleName: 'iPhone 15 Pro',
            daysRemaining: 2,
          },
        );

        expect(result).toBe(true);
      });
    });
  });

  describe('Dispute Notifications', () => {
    describe('sendDisputeOpenedToSeller', () => {
      it('should notify seller of new dispute', async () => {
        const result = await service.sendDisputeOpenedToSeller(
          'seller@example.com',
          {
            raffleName: 'iPhone 15 Pro',
            disputeType: 'PRODUCTO_NO_RECIBIDO',
            disputeTitle: 'No recibí el producto',
          },
        );

        expect(result).toBe(true);
      });
    });

    describe('sendDisputeOpenedToBuyer', () => {
      it('should notify buyer that dispute was opened', async () => {
        const result = await service.sendDisputeOpenedToBuyer(
          'buyer@example.com',
          {
            raffleName: 'iPhone 15 Pro',
            disputeId: 'dispute-1',
          },
        );

        expect(result).toBe(true);
      });
    });

    describe('sendSellerMustRespondDispute', () => {
      it('should send reminder to seller to respond', async () => {
        const result = await service.sendSellerMustRespondDispute(
          'seller@example.com',
          {
            raffleName: 'iPhone 15 Pro',
            hoursRemaining: 24,
          },
        );

        expect(result).toBe(true);
      });
    });

    describe('sendDisputeResolvedNotification', () => {
      it('should send resolution notification', async () => {
        const result = await service.sendDisputeResolvedNotification(
          'buyer@example.com',
          {
            raffleName: 'iPhone 15 Pro',
            resolution: 'RESUELTA_COMPRADOR',
            refundAmount: 5000,
          },
        );

        expect(result).toBe(true);
      });
    });

    describe('sendRefundDueToDisputeNotification', () => {
      it('should send refund notification due to dispute', async () => {
        const result = await service.sendRefundDueToDisputeNotification(
          'buyer@example.com',
          {
            raffleName: 'iPhone 15 Pro',
            amount: 5000,
          },
        );

        expect(result).toBe(true);
      });
    });
  });

  describe('KYC Notifications', () => {
    describe('sendKycApprovedNotification', () => {
      it('should send KYC approval notification', async () => {
        const result = await service.sendKycApprovedNotification(
          'seller@example.com',
          {
            userName: 'Juan',
          },
        );

        expect(result).toBe(true);
      });
    });

    describe('sendKycRejectedNotification', () => {
      it('should send KYC rejection notification', async () => {
        const result = await service.sendKycRejectedNotification(
          'seller@example.com',
          {
            userName: 'Juan',
            rejectionReason: 'Documento ilegible, por favor volver a subir',
          },
        );

        expect(result).toBe(true);
      });
    });
  });

  describe('Configuration', () => {
    it('should initialize with correct email settings', () => {
      expect(configService.get).toHaveBeenCalledWith('EMAIL_FROM');
      expect(configService.get).toHaveBeenCalledWith('EMAIL_FROM_NAME');
      expect(configService.get).toHaveBeenCalledWith('BREVO_API_KEY');
    });

    it('should work in mock mode when BREVO_API_KEY is "mock"', async () => {
      // Service is already in mock mode from beforeEach
      const result = await service.sendWelcomeEmail('test@example.com', {
        userName: 'Test',
      });

      // Should return true in mock mode
      expect(result).toBe(true);
    });
  });
});
