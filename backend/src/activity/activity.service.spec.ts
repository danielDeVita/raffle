import { Test, TestingModule } from '@nestjs/testing';
import { ActivityService } from './activity.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityType } from '@prisma/client';

type MockPrismaService = {
  activityLog: {
    create: jest.Mock;
    findMany: jest.Mock;
  };
};

describe('ActivityService', () => {
  let service: ActivityService;
  let prisma: MockPrismaService;

  const mockPrismaService = (): MockPrismaService => ({
    activityLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityService,
        { provide: PrismaService, useValue: mockPrismaService() },
      ],
    }).compile();

    service = module.get<ActivityService>(ActivityService);
    prisma = module.get(PrismaService) as unknown as MockPrismaService;
  });

  describe('log', () => {
    it('should create activity log entry', async () => {
      const mockActivity = {
        id: 'activity-1',
        userId: 'user-1',
        action: ActivityType.USER_LOGGED_IN,
        createdAt: new Date(),
      };

      prisma.activityLog.create.mockResolvedValue(mockActivity);

      const result = await service.log({
        userId: 'user-1',
        action: ActivityType.USER_LOGGED_IN,
        ipAddress: '127.0.0.1',
      });

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          action: ActivityType.USER_LOGGED_IN,
          targetType: undefined,
          targetId: undefined,
          metadata: undefined,
          ipAddress: '127.0.0.1',
          userAgent: undefined,
        },
      });
      expect(result).toEqual(mockActivity);
    });

    it('should return null and log error if activity logging fails', async () => {
      prisma.activityLog.create.mockRejectedValue(new Error('DB error'));

      const result = await service.log({
        userId: 'user-1',
        action: ActivityType.USER_LOGGED_IN,
      });

      expect(result).toBeNull();
    });
  });

  describe('Authentication events', () => {
    it('should log user registration', async () => {
      prisma.activityLog.create.mockResolvedValue({ id: 'activity-1' });

      await service.logUserRegistered('user-1', 'email');

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          action: ActivityType.USER_REGISTERED,
          metadata: { method: 'email' },
        }),
      });
    });

    it('should log user login with Google', async () => {
      prisma.activityLog.create.mockResolvedValue({ id: 'activity-1' });

      await service.logUserLoggedIn('user-1', 'google', '192.168.1.1');

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          action: ActivityType.USER_LOGGED_IN_GOOGLE,
          ipAddress: '192.168.1.1',
        }),
      });
    });

    it('should log password change', async () => {
      prisma.activityLog.create.mockResolvedValue({ id: 'activity-1' });

      await service.logPasswordChanged('user-1');

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          action: ActivityType.PASSWORD_CHANGED,
          metadata: { source: 'settings' },
        }),
      });
    });

    it('should log 2FA activation', async () => {
      prisma.activityLog.create.mockResolvedValue({ id: 'activity-1' });

      await service.logTwoFactorEnabled('user-1');

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          action: ActivityType.TWO_FACTOR_ENABLED,
          metadata: { method: 'totp' },
        }),
      });
    });

    it('should log recovery code usage with remaining count', async () => {
      prisma.activityLog.create.mockResolvedValue({ id: 'activity-1' });

      await service.logTwoFactorRecoveryCodeUsed('user-1', 7, '192.168.1.1');

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          action: ActivityType.TWO_FACTOR_RECOVERY_CODE_USED,
          metadata: { remainingRecoveryCodesCount: 7 },
          ipAddress: '192.168.1.1',
        }),
      });
    });

    it('should log captcha rejection with stage context', async () => {
      prisma.activityLog.create.mockResolvedValue({ id: 'activity-1' });

      await service.logAuthCaptchaRejected('user-1', 'login', '192.168.1.1');

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          action: ActivityType.AUTH_CAPTCHA_REJECTED,
          metadata: { stage: 'login' },
          ipAddress: '192.168.1.1',
        }),
      });
    });
  });

  describe('Raffle events', () => {
    it('should log raffle creation', async () => {
      prisma.activityLog.create.mockResolvedValue({ id: 'activity-1' });

      await service.logRaffleCreated('user-1', 'raffle-1', 'iPhone 15 Pro');

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          action: ActivityType.RAFFLE_CREATED,
          targetType: 'Raffle',
          targetId: 'raffle-1',
          metadata: { titulo: 'iPhone 15 Pro' },
        }),
      });
    });

    it('should log raffle drawn with winner', async () => {
      prisma.activityLog.create.mockResolvedValue({ id: 'activity-1' });

      await service.logRaffleDrawn('seller-1', 'raffle-1', 'winner-1');

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'seller-1',
          action: ActivityType.RAFFLE_DRAWN,
          targetType: 'Raffle',
          targetId: 'raffle-1',
          metadata: { winnerId: 'winner-1' },
        }),
      });
    });

    it('should log raffle cancellation with reason', async () => {
      prisma.activityLog.create.mockResolvedValue({ id: 'activity-1' });

      await service.logRaffleCancelled(
        'seller-1',
        'raffle-1',
        'Low ticket sales',
      );

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'seller-1',
          action: ActivityType.RAFFLE_CANCELLED,
          targetType: 'Raffle',
          targetId: 'raffle-1',
          metadata: { reason: 'Low ticket sales' },
        }),
      });
    });
  });

  describe('Ticket events', () => {
    it('should log tickets purchased', async () => {
      prisma.activityLog.create.mockResolvedValue({ id: 'activity-1' });

      await service.logTicketsPurchased(
        'buyer-1',
        'raffle-1',
        [5, 10, 15],
        300,
        'mp-123',
      );

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'buyer-1',
          action: ActivityType.TICKETS_PURCHASED,
          targetType: 'Raffle',
          targetId: 'raffle-1',
          metadata: {
            ticketNumbers: [5, 10, 15],
            amount: 300,
            purchaseReference: 'mp-123',
            count: 3,
          },
        }),
      });
    });

    it('should log tickets refunded', async () => {
      prisma.activityLog.create.mockResolvedValue({ id: 'activity-1' });

      await service.logTicketsRefunded(
        'buyer-1',
        'raffle-1',
        3,
        300,
        'Raffle cancelled',
      );

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'buyer-1',
          action: ActivityType.TICKETS_REFUNDED,
          targetType: 'Raffle',
          targetId: 'raffle-1',
          metadata: {
            ticketCount: 3,
            amount: 300,
            reason: 'Raffle cancelled',
          },
        }),
      });
    });
  });

  describe('Social promotion events', () => {
    it('should log social promotion draft creation', async () => {
      prisma.activityLog.create.mockResolvedValue({ id: 'activity-1' });

      await service.logSocialPromotionDraftCreated('seller-1', 'draft-1', {
        raffleId: 'raffle-1',
        network: 'X',
      });

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'seller-1',
          action: ActivityType.SOCIAL_PROMOTION_DRAFT_CREATED,
          targetType: 'SocialPromotionDraft',
          targetId: 'draft-1',
          metadata: {
            raffleId: 'raffle-1',
            network: 'X',
          },
        }),
      });
    });

    it('should log promotion bonus reversal', async () => {
      prisma.activityLog.create.mockResolvedValue({ id: 'activity-1' });

      await service.logSocialPromotionBonusReversed('buyer-1', 'redeem-1', {
        raffleId: 'raffle-1',
        grantId: 'grant-1',
        refundAmount: 500,
        discountApplied: 250,
      });

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'buyer-1',
          action: ActivityType.SOCIAL_PROMOTION_BONUS_REVERSED,
          targetType: 'PromotionBonusRedemption',
          targetId: 'redeem-1',
          metadata: {
            raffleId: 'raffle-1',
            grantId: 'grant-1',
            refundAmount: 500,
            discountApplied: 250,
          },
        }),
      });
    });
  });

  describe('seller payment account events', () => {
    it('should log seller payment account connection', async () => {
      prisma.activityLog.create.mockResolvedValue({ id: 'activity-1' });

      await service.logSellerPaymentAccountConnected('seller-1', 'spa-1');

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'seller-1',
          action: ActivityType.SELLER_PAYMENT_ACCOUNT_CONNECTED,
          targetType: 'SellerPaymentAccount',
          targetId: 'spa-1',
          metadata: {
            sellerPaymentAccountId: 'spa-1',
          },
        }),
      });
    });
  });

  describe('Delivery events', () => {
    it('should log delivery shipped with tracking', async () => {
      prisma.activityLog.create.mockResolvedValue({ id: 'activity-1' });

      await service.logDeliveryShipped('seller-1', 'raffle-1', 'TRACK123');

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'seller-1',
          action: ActivityType.DELIVERY_SHIPPED,
          targetType: 'Raffle',
          targetId: 'raffle-1',
          metadata: { trackingNumber: 'TRACK123' },
        }),
      });
    });

    it('should log delivery confirmed', async () => {
      prisma.activityLog.create.mockResolvedValue({ id: 'activity-1' });

      await service.logDeliveryConfirmed('winner-1', 'raffle-1');

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'winner-1',
          action: ActivityType.DELIVERY_CONFIRMED,
          targetType: 'Raffle',
          targetId: 'raffle-1',
        }),
      });
    });
  });

  describe('Dispute events', () => {
    it('should log dispute opened', async () => {
      prisma.activityLog.create.mockResolvedValue({ id: 'activity-1' });

      await service.logDisputeOpened(
        'buyer-1',
        'dispute-1',
        'raffle-1',
        'Product not received',
      );

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'buyer-1',
          action: ActivityType.DISPUTE_OPENED,
          targetType: 'Dispute',
          targetId: 'dispute-1',
          metadata: { raffleId: 'raffle-1', reason: 'Product not received' },
        }),
      });
    });

    it('should log dispute resolved', async () => {
      prisma.activityLog.create.mockResolvedValue({ id: 'activity-1' });

      await service.logDisputeResolved(
        'admin-1',
        'dispute-1',
        'Refund approved',
      );

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'admin-1',
          action: ActivityType.DISPUTE_RESOLVED,
          targetType: 'Dispute',
          targetId: 'dispute-1',
          metadata: { resolution: 'Refund approved' },
        }),
      });
    });
  });

  describe('Payment events', () => {
    it('should log payment received', async () => {
      prisma.activityLog.create.mockResolvedValue({ id: 'activity-1' });

      await service.logPaymentReceived('seller-1', 'raffle-1', 5000);

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'seller-1',
          action: ActivityType.PAYMENT_RECEIVED,
          targetType: 'Raffle',
          targetId: 'raffle-1',
          metadata: { amount: 5000 },
        }),
      });
    });

    it('should log payout released', async () => {
      prisma.activityLog.create.mockResolvedValue({ id: 'activity-1' });

      await service.logPayoutReleased('seller-1', 'payout-1', 4500);

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'seller-1',
          action: ActivityType.PAYOUT_RELEASED,
          targetType: 'Payout',
          targetId: 'payout-1',
          metadata: { amount: 4500 },
        }),
      });
    });
  });

  describe('Profile events', () => {
    it('should log profile updated with changed fields', async () => {
      prisma.activityLog.create.mockResolvedValue({ id: 'activity-1' });

      await service.logProfileUpdated('user-1', ['nombre', 'telefono']);

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          action: ActivityType.PROFILE_UPDATED,
          metadata: { updatedFields: ['nombre', 'telefono'] },
        }),
      });
    });
  });

  describe('Query methods', () => {
    it('should get activity for specific user', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          userId: 'user-1',
          action: ActivityType.USER_LOGGED_IN,
        },
      ];

      prisma.activityLog.findMany.mockResolvedValue(mockActivities);

      const result = await service.getActivityForUser('user-1', 20, 0);

      expect(prisma.activityLog.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take: 20,
        skip: 0,
      });
      expect(result).toEqual(mockActivities);
    });

    it('should get recent activity across all users', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          action: ActivityType.RAFFLE_CREATED,
          user: { id: 'user-1', email: 'test@test.com' },
        },
      ];

      prisma.activityLog.findMany.mockResolvedValue(mockActivities);

      const result = await service.getRecentActivity(50);

      expect(prisma.activityLog.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          user: { select: { id: true, email: true, nombre: true } },
        },
      });
      expect(result).toEqual(mockActivities);
    });
  });
});
