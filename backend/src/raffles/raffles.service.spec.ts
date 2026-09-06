import { Test, TestingModule } from '@nestjs/testing';
import { RafflesService } from './raffles.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityService } from '../activity/activity.service';
import { ReputationService } from '../users/reputation.service';
import { PayoutsService } from '../payouts/payouts.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RaffleEvents } from '../common/events';

describe('RafflesService', () => {
  let service: RafflesService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    raffle: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    ticket: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    transaction: {
      aggregate: jest.fn(),
    },
    drawResult: {
      create: jest.fn(),
    },
    userReputation: {
      upsert: jest.fn(),
    },
    priceHistory: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    priceReduction: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    favorite: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockNotificationsService = {
    sendWinnerNotification: jest.fn().mockResolvedValue(true),
    sendSellerMustContactWinner: jest.fn().mockResolvedValue(true),
    sendRaffleParticipantNotification: jest.fn().mockResolvedValue(true),
    sendRaffleCancelledNotification: jest.fn().mockResolvedValue(true),
    sendPriceDropAlert: jest.fn().mockResolvedValue(true),
    sendPrizeShippedNotification: jest.fn().mockResolvedValue(true),
    sendDeliveryConfirmedToSellerNotification: jest
      .fn()
      .mockResolvedValue(true),
    create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
  };

  const mockActivityService = {
    logRaffleCreated: jest.fn().mockResolvedValue({ id: 'activity-1' }),
    logRaffleDrawn: jest.fn().mockResolvedValue({ id: 'activity-2' }),
    logRaffleCancelled: jest.fn().mockResolvedValue({ id: 'activity-3' }),
    logDeliveryShipped: jest.fn().mockResolvedValue({ id: 'activity-4' }),
    logDeliveryConfirmed: jest.fn().mockResolvedValue({ id: 'activity-5' }),
    logRaffleDeadlineExtended: jest
      .fn()
      .mockResolvedValue({ id: 'activity-6' }),
    logRaffleWinnerRejected: jest.fn().mockResolvedValue({ id: 'activity-7' }),
  };

  const mockReputationService = {
    canSellerCreateRaffle: jest.fn().mockResolvedValue({ allowed: true }),
  };

  const mockPayoutsService = {
    createPayout: jest.fn().mockResolvedValue({ id: 'payout-1' }),
    processPayoutForRaffle: jest.fn().mockResolvedValue({ id: 'payout-1' }),
    schedulePayoutAfterDelivery: jest
      .fn()
      .mockResolvedValue({ id: 'payout-1' }),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const mockCacheManager = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        PLATFORM_FEE_PERCENT: '4',
      };
      return config[key];
    }),
  };

  // Test data factories
  const createTestUser = (overrides = {}) => ({
    id: 'user-123',
    email: 'seller@example.com',
    nombre: 'Test',
    apellido: 'Seller',
    sellerPaymentAccountStatus: 'CONNECTED',
    kycStatus: 'VERIFIED',
    defaultSenderAddressId: 'addr-1',
    shippingAddresses: [{ id: 'addr-1' }],
    ...overrides,
  });

  const createTestRaffle = (overrides = {}) => ({
    id: 'raffle-123',
    titulo: 'Test Raffle',
    descripcion: 'A test raffle',
    sellerId: 'user-123',
    totalTickets: 100,
    precioPorTicket: 10,
    estado: 'ACTIVA',
    fechaLimiteSorteo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    viewCount: 0,
    deliveryStatus: 'PENDING',
    isHidden: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    product: {
      id: 'prod-1',
      nombre: 'Test Product',
      descripcionDetallada: 'Details',
      categoria: 'Electronics',
      condicion: 'NUEVO',
      imagenes: ['image1.jpg'],
    },
    seller: createTestUser(),
    ...overrides,
  });

  const createTestTicket = (overrides = {}) => ({
    id: 'ticket-123',
    raffleId: 'raffle-123',
    buyerId: 'buyer-123',
    numeroTicket: 1,
    estado: 'PAGADO',
    precioPagado: 10,
    fechaCompra: new Date(),
    buyer: {
      id: 'buyer-123',
      email: 'buyer@example.com',
      nombre: 'Test Buyer',
    },
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RafflesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: ActivityService, useValue: mockActivityService },
        { provide: ReputationService, useValue: mockReputationService },
        { provide: PayoutsService, useValue: mockPayoutsService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
      ],
    }).compile();

    service = module.get<RafflesService>(RafflesService);
  });

  describe('create', () => {
    const validInput = {
      titulo: 'New Raffle',
      descripcion: 'Description',
      totalTickets: 100,
      precioPorTicket: 10,
      fechaLimite: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      productData: {
        nombre: 'Product',
        descripcionDetallada: 'Details',
        categoria: 'Electronics',
        condicion: 'NUEVO' as const,
        imagenes: ['image.jpg'],
      },
    };

    it('should create a raffle successfully', async () => {
      const seller = createTestUser();
      const newRaffle = createTestRaffle();
      mockPrismaService.user.findUnique.mockResolvedValue(seller);
      mockPrismaService.raffle.create.mockResolvedValue(newRaffle);

      const result = await service.create('user-123', validInput);

      expect(result).toEqual(newRaffle);
      expect(mockPrismaService.raffle.create).toHaveBeenCalled();
      expect(mockActivityService.logRaffleCreated).toHaveBeenCalled();
    });

    it('should throw NotFoundException if seller not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.create('user-123', validInput)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if MP not connected', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        createTestUser({ sellerPaymentAccountStatus: 'NOT_CONNECTED' }),
      );

      await expect(service.create('user-123', validInput)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create('user-123', validInput)).rejects.toThrow(
        'conectar Mercado Pago',
      );
    });

    it('should throw BadRequestException if no shipping address', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        createTestUser({ defaultSenderAddressId: null, shippingAddresses: [] }),
      );

      await expect(service.create('user-123', validInput)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create('user-123', validInput)).rejects.toThrow(
        'dirección de envío',
      );
    });

    it('should throw BadRequestException if KYC not verified', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        createTestUser({ kycStatus: 'PENDING' }),
      );

      await expect(service.create('user-123', validInput)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create('user-123', validInput)).rejects.toThrow(
        'verificar tu identidad',
      );
    });

    it('should throw BadRequestException if deadline is in the past', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(createTestUser());
      const pastInput = {
        ...validInput,
        fechaLimite: new Date(Date.now() - 1000).toISOString(),
      };

      await expect(service.create('user-123', pastInput)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create('user-123', pastInput)).rejects.toThrow(
        'futuro',
      );
    });

    it('should reject raffles that mention prohibited gambling value', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(createTestUser());

      const prohibitedInput = {
        ...validInput,
        titulo: 'Saldo para casino online',
      };

      await expect(service.create('user-123', prohibitedInput)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create('user-123', prohibitedInput)).rejects.toThrow(
        'No se permiten rifas relacionadas',
      );
    });
  });

  describe('getBuyerStats', () => {
    it('should use completed ticket-purchase transactions for total spent', async () => {
      mockPrismaService.ticket.findMany.mockResolvedValue([
        createTestTicket({
          raffleId: 'raffle-1',
          precioPagado: 500,
          raffle: { estado: 'ACTIVA' },
        }),
        createTestTicket({
          id: 'ticket-2',
          raffleId: 'raffle-2',
          precioPagado: 500,
          raffle: { estado: 'FINALIZADA' },
        }),
      ]);
      mockPrismaService.raffle.count.mockResolvedValue(1);
      mockPrismaService.favorite.count.mockResolvedValue(3);
      mockPrismaService.transaction.aggregate.mockResolvedValue({
        _sum: {
          cashChargedAmount: 1050,
        },
      });

      const result = await service.getBuyerStats('buyer-123');

      expect(result.totalTicketsPurchased).toBe(2);
      expect(result.totalRafflesWon).toBe(1);
      expect(result.totalSpent).toBe(1050);
      expect(result.activeTickets).toBe(1);
      expect(result.favoritesCount).toBe(3);
    });
  });

  describe('update', () => {
    it('should reject prohibited content when updating a raffle', async () => {
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(createTestRaffle() as any);

      await expect(
        service.update('raffle-123', 'user-123', {
          titulo: 'Fichas para casino premium',
          descripcion:
            'Descripcion valida para la edicion de una rifa activa con longitud suficiente.',
          imagenes: ['https://example.com/image.jpg'],
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.update('raffle-123', 'user-123', {
          titulo: 'Fichas para casino premium',
          descripcion:
            'Descripcion valida para la edicion de una rifa activa con longitud suficiente.',
          imagenes: ['https://example.com/image.jpg'],
        }),
      ).rejects.toThrow('No se permiten rifas relacionadas');
    });
  });

  describe('selectWinner (Draw Logic)', () => {
    it('should select a random winner from paid tickets', async () => {
      const raffle = createTestRaffle({ estado: 'ACTIVA' });
      const paidTickets = [
        createTestTicket({
          id: 'ticket-1',
          buyerId: 'buyer-1',
          numeroTicket: 1,
        }),
        createTestTicket({
          id: 'ticket-2',
          buyerId: 'buyer-2',
          numeroTicket: 2,
        }),
        createTestTicket({
          id: 'ticket-3',
          buyerId: 'buyer-3',
          numeroTicket: 3,
        }),
      ];

      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);
      mockPrismaService.ticket.findMany.mockResolvedValue(paidTickets);
      mockPrismaService.drawResult.create.mockResolvedValue({ id: 'draw-1' });
      mockPrismaService.raffle.update.mockResolvedValue({
        ...raffle,
        estado: 'SORTEADA',
        winnerId: paidTickets[0].buyerId,
        winner: paidTickets[0].buyer,
      });

      const result = await service.selectWinner('raffle-123');

      expect(result.estado).toBe('SORTEADA');
      expect(result.winnerId).toBeDefined();
      expect(mockPrismaService.drawResult.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          raffleId: 'raffle-123',
          method: 'RANDOM_INDEX',
          totalParticipants: 3,
        }),
      });
    });

    it('should throw BadRequestException if no paid tickets', async () => {
      const raffle = createTestRaffle();
      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);
      mockPrismaService.ticket.findMany.mockResolvedValue([]);

      await expect(service.selectWinner('raffle-123')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.selectWinner('raffle-123')).rejects.toThrow(
        'No hay tickets pagados',
      );
    });

    it('should emit RaffleDrawnEvent after selecting winner', async () => {
      const raffle = createTestRaffle();
      const paidTickets = [createTestTicket()];
      const updatedRaffle = {
        ...raffle,
        estado: 'SORTEADA',
        winnerId: 'buyer-123',
        winner: paidTickets[0].buyer,
      };

      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);
      mockPrismaService.ticket.findMany.mockResolvedValue(paidTickets);
      mockPrismaService.drawResult.create.mockResolvedValue({ id: 'draw-1' });
      mockPrismaService.raffle.update.mockResolvedValue(updatedRaffle);

      await service.selectWinner('raffle-123');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        RaffleEvents.DRAWN,
        expect.objectContaining({
          raffleId: 'raffle-123',
          winnerId: 'buyer-123',
        }),
      );
    });

    it('includes the winning number in seller and winner notifications', async () => {
      const raffle = createTestRaffle();
      const paidTickets = [createTestTicket({ numeroTicket: 17 })];
      const updatedRaffle = {
        ...raffle,
        estado: 'SORTEADA',
        winnerId: 'buyer-123',
        winner: paidTickets[0].buyer,
      };

      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);
      mockPrismaService.ticket.findMany.mockResolvedValue(paidTickets);
      mockPrismaService.drawResult.create.mockResolvedValue({ id: 'draw-1' });
      mockPrismaService.raffle.update.mockResolvedValue(updatedRaffle);

      await service.selectWinner('raffle-123');

      expect(
        mockNotificationsService.sendWinnerNotification,
      ).toHaveBeenCalledWith(
        'buyer@example.com',
        expect.objectContaining({
          winningTicketNumber: 17,
        }),
      );
      expect(
        mockNotificationsService.sendSellerMustContactWinner,
      ).toHaveBeenCalledWith(
        'seller@example.com',
        expect.objectContaining({
          winningTicketNumber: 17,
        }),
      );
    });

    it('should create DrawResult record for audit trail', async () => {
      const raffle = createTestRaffle();
      const paidTickets = [
        createTestTicket({ id: 'ticket-1', numeroTicket: 5 }),
        createTestTicket({ id: 'ticket-2', numeroTicket: 10 }),
      ];

      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);
      mockPrismaService.ticket.findMany.mockResolvedValue(paidTickets);
      mockPrismaService.drawResult.create.mockResolvedValue({ id: 'draw-1' });
      mockPrismaService.raffle.update.mockResolvedValue({
        ...raffle,
        estado: 'SORTEADA',
      });

      await service.selectWinner('raffle-123');

      expect(mockPrismaService.drawResult.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          raffleId: 'raffle-123',
          winningTicketId: expect.any(String),
          winnerId: expect.any(String),
          method: 'RANDOM_INDEX',
          totalParticipants: 2,
        }),
      });
    });

    it('should update raffle state to SORTEADA', async () => {
      const raffle = createTestRaffle();
      const paidTickets = [createTestTicket()];

      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);
      mockPrismaService.ticket.findMany.mockResolvedValue(paidTickets);
      mockPrismaService.drawResult.create.mockResolvedValue({ id: 'draw-1' });
      mockPrismaService.raffle.update.mockResolvedValue({
        ...raffle,
        estado: 'SORTEADA',
      });

      await service.selectWinner('raffle-123');

      expect(mockPrismaService.raffle.update).toHaveBeenCalledWith({
        where: { id: 'raffle-123' },
        data: expect.objectContaining({
          estado: 'SORTEADA',
          winnerId: expect.any(String),
          fechaSorteoReal: expect.any(Date),
        }),
        include: expect.any(Object),
      });
    });
  });

  describe('cancel', () => {
    it('should cancel an active raffle', async () => {
      const raffle = createTestRaffle({ estado: 'ACTIVA' });
      const cancelledRaffle = { ...raffle, estado: 'CANCELADA', tickets: [] };

      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);
      mockPrismaService.raffle.update.mockResolvedValue(cancelledRaffle);

      const result = await service.cancel('raffle-123', 'user-123');

      expect(result.estado).toBe('CANCELADA');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        RaffleEvents.CANCELLED,
        expect.any(Object),
      );
    });

    it('should throw ForbiddenException if not the seller', async () => {
      const raffle = createTestRaffle({ sellerId: 'other-user' });
      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);

      await expect(service.cancel('raffle-123', 'user-123')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException if raffle is not active', async () => {
      const raffle = createTestRaffle({ estado: 'SORTEADA' });
      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);

      await expect(service.cancel('raffle-123', 'user-123')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.cancel('raffle-123', 'user-123')).rejects.toThrow(
        'Solo se pueden cancelar rifas activas',
      );
    });
  });

  describe('confirmDelivery', () => {
    it('should confirm delivery and keep raffle in EN_ENTREGA while processing payout', async () => {
      const raffle = createTestRaffle({
        estado: 'SORTEADA',
        winnerId: 'winner-123',
        deliveryStatus: 'SHIPPED',
      });
      const confirmedRaffle = {
        ...raffle,
        estado: 'EN_ENTREGA',
        deliveryStatus: 'CONFIRMED',
        winner: { id: 'winner-123' },
        seller: createTestUser(),
      };

      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);
      mockPrismaService.userReputation.upsert.mockResolvedValue({});
      mockPrismaService.raffle.update.mockResolvedValue(confirmedRaffle);

      const result = await service.confirmDelivery('raffle-123', 'winner-123');

      expect(result.estado).toBe('EN_ENTREGA');
      expect(result.deliveryStatus).toBe('CONFIRMED');
      expect(mockPrismaService.userReputation.upsert).toHaveBeenCalled();
      expect(
        mockPayoutsService.schedulePayoutAfterDelivery,
      ).toHaveBeenCalledWith('raffle-123');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        RaffleEvents.DELIVERY_CONFIRMED,
        expect.any(Object),
      );
    });

    it('should throw ForbiddenException if not the winner', async () => {
      const raffle = createTestRaffle({ winnerId: 'other-winner' });
      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);

      await expect(
        service.confirmDelivery('raffle-123', 'user-123'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if already confirmed', async () => {
      const raffle = createTestRaffle({
        winnerId: 'user-123',
        deliveryStatus: 'CONFIRMED',
      });
      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);

      await expect(
        service.confirmDelivery('raffle-123', 'user-123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should increment seller reputation on confirmation', async () => {
      const raffle = createTestRaffle({
        winnerId: 'winner-123',
        deliveryStatus: 'SHIPPED',
      });

      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);
      mockPrismaService.userReputation.upsert.mockResolvedValue({});
      mockPrismaService.raffle.update.mockResolvedValue({
        ...raffle,
        estado: 'EN_ENTREGA',
      });

      await service.confirmDelivery('raffle-123', 'winner-123');

      expect(mockPrismaService.userReputation.upsert).toHaveBeenCalledWith({
        where: { userId: raffle.sellerId },
        create: expect.objectContaining({ totalVentasCompletadas: 1 }),
        update: { totalVentasCompletadas: { increment: 1 } },
      });
    });
  });

  describe('markAsShipped', () => {
    it('should mark raffle as shipped with tracking number', async () => {
      const raffle = createTestRaffle({
        estado: 'SORTEADA',
        deliveryStatus: 'PENDING',
      });
      const shippedRaffle = {
        ...raffle,
        deliveryStatus: 'SHIPPED',
        trackingNumber: 'TRACK123',
        winner: { id: 'winner-123', email: 'winner@example.com' },
      };

      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);
      mockPrismaService.raffle.update.mockResolvedValue(shippedRaffle);

      const result = await service.markAsShipped(
        'raffle-123',
        'user-123',
        'TRACK123',
      );

      expect(result.deliveryStatus).toBe('SHIPPED');
      expect(result.trackingNumber).toBe('TRACK123');
    });

    it('should throw ForbiddenException if not the seller', async () => {
      const raffle = createTestRaffle({ sellerId: 'other-seller' });
      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);

      await expect(
        service.markAsShipped('raffle-123', 'user-123'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if not in SORTEADA state', async () => {
      const raffle = createTestRaffle({ estado: 'ACTIVA' });
      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);

      await expect(
        service.markAsShipped('raffle-123', 'user-123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if already shipped', async () => {
      const raffle = createTestRaffle({
        estado: 'SORTEADA',
        deliveryStatus: 'SHIPPED',
      });
      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);

      await expect(
        service.markAsShipped('raffle-123', 'user-123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('extendRaffleDeadline', () => {
    it('should extend the deadline successfully', async () => {
      const raffle = createTestRaffle({ estado: 'ACTIVA' });
      const newDeadline = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const extendedRaffle = {
        ...raffle,
        fechaLimiteSorteo: newDeadline,
        tickets: [],
      };

      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);
      mockPrismaService.raffle.update.mockResolvedValue(extendedRaffle);

      const result = await service.extendRaffleDeadline(
        'raffle-123',
        'user-123',
        newDeadline,
      );

      expect(result.fechaLimiteSorteo).toEqual(newDeadline);
    });

    it('should throw ForbiddenException if not the seller', async () => {
      const raffle = createTestRaffle({ sellerId: 'other-seller' });
      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);

      await expect(
        service.extendRaffleDeadline('raffle-123', 'user-123', new Date()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if raffle is not active', async () => {
      const raffle = createTestRaffle({ estado: 'SORTEADA' });
      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);

      await expect(
        service.extendRaffleDeadline('raffle-123', 'user-123', new Date()),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if new deadline is in the past', async () => {
      const raffle = createTestRaffle();
      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);

      const pastDate = new Date(Date.now() - 1000);

      await expect(
        service.extendRaffleDeadline('raffle-123', 'user-123', pastDate),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if new deadline is before current', async () => {
      const raffle = createTestRaffle({
        fechaLimiteSorteo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);

      const earlierDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await expect(
        service.extendRaffleDeadline('raffle-123', 'user-123', earlierDate),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updatePrice', () => {
    it('should update price and notify on price drop', async () => {
      const raffle = createTestRaffle({ precioPorTicket: 100 });
      const updatedRaffle = { ...raffle, precioPorTicket: 80 };

      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);
      mockPrismaService.priceHistory.create.mockResolvedValue({});
      mockPrismaService.raffle.update.mockResolvedValue(updatedRaffle);
      mockPrismaService.favorite.findMany.mockResolvedValue([]);

      const result = await service.updatePrice('raffle-123', 'user-123', 80);

      expect(result.precioPorTicket).toBe(80);
      expect(mockPrismaService.priceHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          raffleId: 'raffle-123',
          previousPrice: 100,
          newPrice: 80,
        }),
      });
    });

    it('should throw ForbiddenException if not the seller', async () => {
      const raffle = createTestRaffle({ sellerId: 'other-seller' });
      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);

      await expect(
        service.updatePrice('raffle-123', 'user-123', 50),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if raffle is not active', async () => {
      const raffle = createTestRaffle({ estado: 'SORTEADA' });
      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);

      await expect(
        service.updatePrice('raffle-123', 'user-123', 50),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if price is zero or negative', async () => {
      const raffle = createTestRaffle();
      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);

      await expect(
        service.updatePrice('raffle-123', 'user-123', 0),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.updatePrice('raffle-123', 'user-123', -10),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('calculateCommissions', () => {
    it('should calculate fees correctly', () => {
      // Platform fee: 4%, no external provider fee (Mercado Pago payouts are settled separately)
      const totalAmount = 1000;
      const result = service.calculateCommissions(totalAmount);

      expect(result.platformFee).toBe(40); // 4%
      expect(result.processingFee).toBe(0);
      expect(result.totalFees).toBe(result.platformFee + result.processingFee);
      expect(result.netAmount).toBe(totalAmount - result.totalFees);
    });

    it('should handle zero amount', () => {
      const result = service.calculateCommissions(0);

      expect(result.platformFee).toBe(0);
      expect(result.netAmount).toBe(0);
    });
  });

  describe('getTicketStats', () => {
    it('should calculate ticket statistics correctly', () => {
      const raffle = {
        totalTickets: 100,
        precioPorTicket: 10,
        tickets: [
          { estado: 'PAGADO' as const },
          { estado: 'PAGADO' as const },
          { estado: 'RESERVADO' as const },
        ],
      };

      const result = service.getTicketStats(raffle);

      expect(result.ticketsVendidos).toBe(2);
      expect(result.ticketsDisponibles).toBe(98);
      expect(result.maxTicketsPorUsuario).toBe(50); // 50% of total
      expect(result.precioTotal).toBe(1000);
    });

    it('should handle raffle with no tickets', () => {
      const raffle = {
        totalTickets: 100,
        precioPorTicket: 10,
        tickets: [],
      };

      const result = service.getTicketStats(raffle);

      expect(result.ticketsVendidos).toBe(0);
      expect(result.ticketsDisponibles).toBe(100);
    });
  });

  describe('suggestPriceReduction', () => {
    it('should suggest price reduction based on sales', async () => {
      const raffle = createTestRaffle({
        totalTickets: 100,
        precioPorTicket: 100,
      });

      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);
      mockPrismaService.ticket.count.mockResolvedValue(30); // 30% sold
      mockPrismaService.priceReduction.create.mockResolvedValue({
        id: 'reduction-1',
        precioAnterior: 100,
        precioSugerido: 65, // 35% reduction (70% unsold * 0.5)
      });

      const result = await service.suggestPriceReduction('raffle-123');

      expect(mockPrismaService.priceReduction.create).toHaveBeenCalled();
      expect(result.precioAnterior).toBe(100);
    });
  });

  describe('findOne', () => {
    it('should return raffle with all relations', async () => {
      const raffle = createTestRaffle();
      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);

      const result = await service.findOne('raffle-123');

      expect(result).toEqual(
        expect.objectContaining({
          ...raffle,
          winningTicketNumber: null,
        }),
      );
      expect(mockPrismaService.raffle.findUnique).toHaveBeenCalledWith({
        where: { id: 'raffle-123' },
        include: expect.objectContaining({
          product: true,
          seller: true,
          tickets: true,
          winner: true,
          drawResult: true,
          dispute: true,
        }),
      });
    });

    it('should throw NotFoundException if raffle not found', async () => {
      mockPrismaService.raffle.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findOnePublic', () => {
    it('returns the winning ticket number for public raffle detail', async () => {
      const raffle = createTestRaffle({
        estado: 'SORTEADA',
        winnerId: 'buyer-123',
        drawResult: {
          id: 'draw-1',
          raffleId: 'raffle-123',
          winningTicketId: 'ticket-winning',
          winnerId: 'buyer-123',
        },
      });

      mockPrismaService.raffle.findFirst.mockResolvedValue(raffle);
      mockPrismaService.ticket.findMany.mockResolvedValue([
        { id: 'ticket-winning', numeroTicket: 17 },
      ]);

      const result = await service.findOnePublic('raffle-123');

      expect(result).toEqual(
        expect.objectContaining({
          winningTicketNumber: 17,
        }),
      );
      expect(mockPrismaService.raffle.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'raffle-123',
          isHidden: false,
          isDeleted: false,
        },
        include: expect.objectContaining({
          drawResult: true,
        }),
      });
    });
  });

  describe('findByUser', () => {
    it('includes the winning ticket number for seller dashboard raffles', async () => {
      const raffles = [
        createTestRaffle({
          estado: 'SORTEADA',
          winnerId: 'buyer-123',
          drawResult: {
            id: 'draw-1',
            raffleId: 'raffle-123',
            winningTicketId: 'ticket-winning',
            winnerId: 'buyer-123',
          },
        }),
      ];

      mockPrismaService.raffle.findMany.mockResolvedValue(raffles);
      mockPrismaService.ticket.findMany.mockResolvedValue([
        { id: 'ticket-winning', numeroTicket: 17 },
      ]);

      const result = await service.findByUser('user-123');

      expect(result).toEqual([
        expect.objectContaining({
          winningTicketNumber: 17,
        }),
      ]);
    });
  });

  describe('rejectRaffleWinner', () => {
    it('should reset raffle for re-draw', async () => {
      const raffle = createTestRaffle({
        estado: 'SORTEADA',
        winnerId: 'winner-123',
      });
      const resetRaffle = {
        ...raffle,
        estado: 'ACTIVA',
        winnerId: null,
        fechaSorteoReal: null,
      };

      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);
      mockPrismaService.raffle.update.mockResolvedValue(resetRaffle);

      const result = await service.rejectRaffleWinner(
        'raffle-123',
        'admin-1',
        'Winner violated rules',
      );

      expect(result.estado).toBe('ACTIVA');
      expect(result.winnerId).toBeNull();
    });

    it('should throw BadRequestException if raffle not in SORTEADA state', async () => {
      const raffle = createTestRaffle({ estado: 'ACTIVA' });
      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);

      await expect(
        service.rejectRaffleWinner('raffle-123', 'admin-1', 'reason'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if no winner assigned', async () => {
      const raffle = createTestRaffle({ estado: 'SORTEADA', winnerId: null });
      mockPrismaService.raffle.findUnique.mockResolvedValue(raffle);

      await expect(
        service.rejectRaffleWinner('raffle-123', 'admin-1', 'reason'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('incrementViewCount', () => {
    it('should increment view count', async () => {
      const raffle = createTestRaffle({ viewCount: 10 });
      mockPrismaService.raffle.update.mockResolvedValue({
        ...raffle,
        viewCount: 11,
      });

      const result = await service.incrementViewCount('raffle-123');

      expect(mockPrismaService.raffle.update).toHaveBeenCalledWith({
        where: { id: 'raffle-123' },
        data: { viewCount: { increment: 1 } },
      });
      expect(result.viewCount).toBe(11);
    });
  });
});
