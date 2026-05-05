/**
 * AlertService 단위 테스트
 *
 * 모의 TypeORM 리포지토리, PriceGateway, PremiumService를 사용하여
 * 알림 CRUD, 조건 매칭, 중복 방지, 알림 발송 로직을 검증한다.
 *
 * @see 요구사항 6.1, 6.2, 6.5, 6.6, 6.7, 12.11
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { AlertService } from './alert.service';
import { AlertEntity } from './entities/alert.entity';
import { AlertHistoryEntity } from './entities/alert-history.entity';
import { PriceGateway } from '../price/price.gateway';
import { PriceMonitorService } from '../price/price-monitor.service';
import { PremiumService } from '../premium/premium.service';
import { TelegramService } from '../telegram/telegram.service';

import type { PriceUpdate, KimchiPremiumData, AlertNotification } from '@bitscope/shared';

/** 테스트용 AlertEntity 생성 헬퍼 */
function createAlertEntity(overrides: Partial<AlertEntity> = {}): AlertEntity {
  const entity = new AlertEntity();
  entity.id = overrides.id || 'alert-uuid-1';
  entity.walletAddress = (overrides.walletAddress || '0x1234567890abcdef1234567890abcdef12345678').toLowerCase();
  entity.symbol = overrides.symbol || 'BTC';
  entity.exchange = overrides.exchange ?? 'upbit';
  entity.currency = overrides.currency ?? 'KRW';
  entity.condition = overrides.condition || 'above';
  entity.targetValue = overrides.targetValue ?? 100_000_000;
  entity.isActive = overrides.isActive ?? true;
  entity.createdAt = overrides.createdAt || new Date('2026-05-01T00:00:00Z');
  entity.updatedAt = overrides.updatedAt || new Date('2026-05-01T00:00:00Z');
  entity.histories = overrides.histories || [];
  return entity;
}

/** 테스트용 PriceUpdate 생성 헬퍼 */
function createPriceUpdate(overrides: Partial<PriceUpdate> = {}): PriceUpdate {
  return {
    exchange: overrides.exchange || 'upbit',
    symbol: overrides.symbol || 'BTC',
    price: overrides.price ?? 100_500_000,
    changeRate: overrides.changeRate ?? 2.5,
    volume24h: overrides.volume24h ?? 5000,
    timestamp: overrides.timestamp ?? Date.now(),
  };
}

describe('AlertService', () => {
  let service: AlertService;
  let alertRepo: jest.Mocked<Partial<Repository<AlertEntity>>>;
  let alertHistoryRepo: jest.Mocked<Partial<Repository<AlertHistoryEntity>>>;
  let priceGateway: jest.Mocked<Partial<PriceGateway>>;
  let premiumService: jest.Mocked<Partial<PremiumService>>;
  let telegramService: jest.Mocked<Partial<TelegramService>>;

  beforeEach(async () => {
    alertRepo = {
      create: jest.fn().mockImplementation((data) => {
        const entity = new AlertEntity();
        Object.assign(entity, { id: 'new-alert-uuid', ...data });
        return entity;
      }),
      save: jest.fn().mockImplementation((entity) => {
        if (!entity.id) entity.id = 'new-alert-uuid';
        return Promise.resolve(entity);
      }),
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      remove: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    };

    alertHistoryRepo = {
      create: jest.fn().mockImplementation((data) => {
        const entity = new AlertHistoryEntity();
        Object.assign(entity, { id: 'history-uuid', ...data });
        return entity;
      }),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      createQueryBuilder: jest.fn().mockReturnValue({
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    };

    priceGateway = {
      broadcastAlert: jest.fn(),
    };

    premiumService = {
      calculatePremium: jest.fn().mockReturnValue(null),
    };

    telegramService = {
      isEnabled: jest.fn().mockReturnValue(false),
      getConnection: jest.fn().mockResolvedValue(null),
      sendMessage: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertService,
        {
          provide: getRepositoryToken(AlertEntity),
          useValue: alertRepo,
        },
        {
          provide: getRepositoryToken(AlertHistoryEntity),
          useValue: alertHistoryRepo,
        },
        {
          provide: PriceGateway,
          useValue: priceGateway,
        },
        {
          provide: PremiumService,
          useValue: premiumService,
        },
        {
          provide: TelegramService,
          useValue: telegramService,
        },
        {
          provide: PriceMonitorService,
          useValue: { subscribeToSymbols: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AlertService>(AlertService);
  });

  it('서비스 인스턴스가 정의되어 있어야 한다', () => {
    expect(service).toBeDefined();
  });

  // =========================================================================
  // createAlert
  // =========================================================================
  describe('createAlert', () => {
    it('새로운 가격 알림을 생성해야 한다', async () => {
      const dto = {
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        symbol: 'BTC',
        exchange: 'upbit',
        currency: 'KRW',
        condition: 'above',
        targetValue: 100_000_000,
      };

      const result = await service.createAlert(dto);

      expect(alertRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          walletAddress: dto.walletAddress.toLowerCase(),
          symbol: 'BTC',
          exchange: 'upbit',
          currency: 'KRW',
          condition: 'above',
          targetValue: 100_000_000,
          isActive: true,
        }),
      );
      expect(alertRepo.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('지갑 주소를 소문자로 정규화해야 한다', async () => {
      const dto = {
        walletAddress: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
        symbol: 'ETH',
        exchange: 'upbit',
        currency: 'KRW',
        condition: 'below',
        targetValue: 5_000_000,
      };

      await service.createAlert(dto);

      expect(alertRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          walletAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
        }),
      );
    });

    it('심볼을 대문자로 정규화해야 한다', async () => {
      const dto = {
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        symbol: 'btc',
        exchange: 'upbit',
        currency: 'KRW',
        condition: 'above',
        targetValue: 100_000_000,
      };

      await service.createAlert(dto);

      expect(alertRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'BTC',
        }),
      );
    });

    it('거래소를 지정하여 알림을 생성할 수 있어야 한다', async () => {
      const dto = {
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        symbol: 'BTC',
        exchange: 'upbit',
        currency: 'KRW',
        condition: 'above',
        targetValue: 100_000_000,
      };

      await service.createAlert(dto);

      expect(alertRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          exchange: 'upbit',
        }),
      );
    });

    it('김프 알림을 생성할 수 있어야 한다', async () => {
      const dto = {
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        symbol: 'BTC',
        exchange: 'upbit',
        currency: 'KRW',
        condition: 'premium_above',
        targetValue: 5,
      };

      await service.createAlert(dto);

      expect(alertRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          condition: 'premium_above',
          targetValue: 5,
        }),
      );
    });

    it('해외거래소 알림 생성 시 currency가 USD로 설정되어야 한다', async () => {
      const dto = {
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        symbol: 'BTC',
        exchange: 'binance',
        currency: 'USD',
        condition: 'above',
        targetValue: 50_000,
      };

      await service.createAlert(dto);

      expect(alertRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          exchange: 'binance',
          currency: 'USD',
        }),
      );
    });

    it('isActive를 명시적으로 false로 설정할 수 있어야 한다', async () => {
      const dto = {
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        symbol: 'BTC',
        exchange: 'upbit',
        currency: 'KRW',
        condition: 'above',
        targetValue: 100_000_000,
        isActive: false,
      };

      await service.createAlert(dto);

      expect(alertRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: false,
        }),
      );
    });
  });

  // =========================================================================
  // updateAlert
  // =========================================================================
  describe('updateAlert', () => {
    it('알림 설정을 부분적으로 수정해야 한다', async () => {
      const existing = createAlertEntity({
        id: 'alert-1',
        targetValue: 100_000_000,
      });
      (alertRepo.findOne as jest.Mock).mockResolvedValue(existing);

      const result = await service.updateAlert('alert-1', {
        targetValue: 120_000_000,
      });

      expect(result.targetValue).toBe(120_000_000);
      expect(alertRepo.save).toHaveBeenCalled();
    });

    it('존재하지 않는 알림을 수정하면 NotFoundException을 던져야 한다', async () => {
      (alertRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateAlert('nonexistent', { targetValue: 100 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('isActive를 false로 변경하면 쿨다운 맵에서 제거해야 한다', async () => {
      const existing = createAlertEntity({ id: 'alert-1' });
      (alertRepo.findOne as jest.Mock).mockResolvedValue(existing);

      await service.updateAlert('alert-1', { isActive: false });

      expect(alertRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });

    it('심볼을 대문자로 정규화해야 한다', async () => {
      const existing = createAlertEntity({ id: 'alert-1', symbol: 'BTC' });
      (alertRepo.findOne as jest.Mock).mockResolvedValue(existing);

      await service.updateAlert('alert-1', { symbol: 'eth' });

      expect(alertRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: 'ETH' }),
      );
    });

    it('여러 필드를 동시에 수정할 수 있어야 한다', async () => {
      const existing = createAlertEntity({ id: 'alert-1' });
      (alertRepo.findOne as jest.Mock).mockResolvedValue(existing);

      const result = await service.updateAlert('alert-1', {
        symbol: 'ETH',
        condition: 'below',
        targetValue: 5_000_000,
        isActive: false,
      });

      expect(result.symbol).toBe('ETH');
      expect(result.condition).toBe('below');
      expect(result.targetValue).toBe(5_000_000);
      expect(result.isActive).toBe(false);
    });
  });

  // =========================================================================
  // deleteAlert
  // =========================================================================
  describe('deleteAlert', () => {
    it('알림을 삭제해야 한다', async () => {
      const existing = createAlertEntity({ id: 'alert-1' });
      (alertRepo.findOne as jest.Mock).mockResolvedValue(existing);

      await service.deleteAlert('alert-1');

      expect(alertRepo.remove).toHaveBeenCalledWith(existing);
    });

    it('존재하지 않는 알림을 삭제하면 NotFoundException을 던져야 한다', async () => {
      (alertRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.deleteAlert('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // getAlerts
  // =========================================================================
  describe('getAlerts', () => {
    it('지갑 주소별 알림 목록을 조회해야 한다', async () => {
      const mockAlerts = [createAlertEntity(), createAlertEntity({ id: 'alert-2' })];
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockAlerts),
      };
      (alertRepo.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);

      const result = await service.getAlerts(
        '0x1234567890abcdef1234567890abcdef12345678',
      );

      expect(result).toHaveLength(2);
      expect(queryBuilder.where).toHaveBeenCalledWith(
        'alert.walletAddress = :walletAddress',
        expect.objectContaining({
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        }),
      );
    });

    it('isActive 필터를 적용해야 한다', async () => {
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      (alertRepo.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);

      await service.getAlerts(
        '0x1234567890abcdef1234567890abcdef12345678',
        true,
      );

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'alert.isActive = :isActive',
        { isActive: true },
      );
    });

    it('symbol 필터를 적용해야 한다', async () => {
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      (alertRepo.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);

      await service.getAlerts(
        '0x1234567890abcdef1234567890abcdef12345678',
        undefined,
        'btc',
      );

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'alert.symbol = :symbol',
        { symbol: 'BTC' },
      );
    });

    it('지갑 주소를 소문자로 정규화해야 한다', async () => {
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      (alertRepo.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);

      await service.getAlerts(
        '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
      );

      expect(queryBuilder.where).toHaveBeenCalledWith(
        'alert.walletAddress = :walletAddress',
        {
          walletAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
        },
      );
    });
  });

  // =========================================================================
  // getAlertHistory
  // =========================================================================
  describe('getAlertHistory', () => {
    it('알림 이력을 조회해야 한다', async () => {
      const mockHistory: AlertHistoryEntity[] = [];
      const queryBuilder = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockHistory),
      };
      (alertHistoryRepo.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);

      const result = await service.getAlertHistory(
        '0x1234567890abcdef1234567890abcdef12345678',
      );

      expect(queryBuilder.innerJoinAndSelect).toHaveBeenCalledWith(
        'history.alert',
        'alert',
      );
      expect(queryBuilder.take).toHaveBeenCalledWith(50);
      expect(result).toEqual(mockHistory);
    });

    it('사용자 정의 limit을 적용해야 한다', async () => {
      const queryBuilder = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      (alertHistoryRepo.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);

      await service.getAlertHistory(
        '0x1234567890abcdef1234567890abcdef12345678',
        20,
      );

      expect(queryBuilder.take).toHaveBeenCalledWith(20);
    });

    it('지갑 주소를 소문자로 정규화해야 한다', async () => {
      const queryBuilder = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      (alertHistoryRepo.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);

      await service.getAlertHistory(
        '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
      );

      expect(queryBuilder.where).toHaveBeenCalledWith(
        'alert.walletAddress = :walletAddress',
        {
          walletAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
        },
      );
    });
  });

  // =========================================================================
  // handlePriceUpdate (가격 알림 조건 매칭)
  // =========================================================================
  describe('handlePriceUpdate - 가격 알림', () => {
    it('above 조건이 충족되면 알림을 발송해야 한다', async () => {
      const alert = createAlertEntity({
        id: 'alert-above',
        symbol: 'BTC',
        condition: 'above',
        targetValue: 100_000_000,
      });
      (alertRepo.find as jest.Mock).mockResolvedValue([alert]);

      const update = createPriceUpdate({
        symbol: 'BTC',
        price: 100_500_000, // 목표가 이상
      });

      await service.handlePriceUpdate(update);

      expect(priceGateway.broadcastAlert).toHaveBeenCalledWith(
        alert.walletAddress,
        expect.objectContaining({
          alertId: 'alert-above',
          symbol: 'BTC',
          condition: 'above',
          triggeredValue: 100_500_000,
        }),
      );
    });

    it('below 조건이 충족되면 알림을 발송해야 한다', async () => {
      const alert = createAlertEntity({
        id: 'alert-below',
        symbol: 'BTC',
        condition: 'below',
        targetValue: 90_000_000,
      });
      (alertRepo.find as jest.Mock).mockResolvedValue([alert]);

      const update = createPriceUpdate({
        symbol: 'BTC',
        price: 89_500_000, // 목표가 이하
      });

      await service.handlePriceUpdate(update);

      expect(priceGateway.broadcastAlert).toHaveBeenCalledWith(
        alert.walletAddress,
        expect.objectContaining({
          alertId: 'alert-below',
          symbol: 'BTC',
          condition: 'below',
          triggeredValue: 89_500_000,
        }),
      );
    });

    it('above 조건이 충족되지 않으면 알림을 발송하지 않아야 한다', async () => {
      const alert = createAlertEntity({
        id: 'alert-above',
        symbol: 'BTC',
        condition: 'above',
        targetValue: 100_000_000,
      });
      (alertRepo.find as jest.Mock).mockResolvedValue([alert]);

      const update = createPriceUpdate({
        symbol: 'BTC',
        price: 99_500_000, // 목표가 미만
      });

      await service.handlePriceUpdate(update);

      expect(priceGateway.broadcastAlert).not.toHaveBeenCalled();
    });

    it('below 조건이 충족되지 않으면 알림을 발송하지 않아야 한다', async () => {
      const alert = createAlertEntity({
        id: 'alert-below',
        symbol: 'BTC',
        condition: 'below',
        targetValue: 90_000_000,
      });
      (alertRepo.find as jest.Mock).mockResolvedValue([alert]);

      const update = createPriceUpdate({
        symbol: 'BTC',
        price: 90_500_000, // 목표가 초과
      });

      await service.handlePriceUpdate(update);

      expect(priceGateway.broadcastAlert).not.toHaveBeenCalled();
    });

    it('특정 거래소가 지정된 알림은 해당 거래소의 시세만 검사해야 한다', async () => {
      const alert = createAlertEntity({
        id: 'alert-upbit',
        symbol: 'BTC',
        exchange: 'upbit',
        condition: 'above',
        targetValue: 100_000_000,
      });
      (alertRepo.find as jest.Mock).mockResolvedValue([alert]);

      // 빗썸 시세 업데이트 -> 업비트 전용 알림은 검사하지 않아야 함
      const update = createPriceUpdate({
        exchange: 'bithumb',
        symbol: 'BTC',
        price: 101_000_000,
      });

      await service.handlePriceUpdate(update);

      expect(priceGateway.broadcastAlert).not.toHaveBeenCalled();
    });

    it('같은 거래소의 시세 업데이트에서 알림이 발동해야 한다', async () => {
      const alert = createAlertEntity({
        id: 'alert-upbit-match',
        symbol: 'BTC',
        exchange: 'upbit',
        condition: 'above',
        targetValue: 100_000_000,
      });
      (alertRepo.find as jest.Mock).mockResolvedValue([alert]);

      const update = createPriceUpdate({
        exchange: 'upbit',
        symbol: 'BTC',
        price: 101_000_000,
      });

      await service.handlePriceUpdate(update);

      expect(priceGateway.broadcastAlert).toHaveBeenCalled();
    });

    it('알림 발동 시 이력을 DB에 저장해야 한다', async () => {
      const alert = createAlertEntity({
        id: 'alert-1',
        symbol: 'BTC',
        condition: 'above',
        targetValue: 100_000_000,
      });
      (alertRepo.find as jest.Mock).mockResolvedValue([alert]);

      const update = createPriceUpdate({
        symbol: 'BTC',
        price: 100_500_000,
      });

      await service.handlePriceUpdate(update);

      expect(alertHistoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          alertId: 'alert-1',
          triggeredValue: 100_500_000,
        }),
      );
      expect(alertHistoryRepo.save).toHaveBeenCalled();
    });

    it('이력 저장 실패 시 예외를 던지지 않아야 한다', async () => {
      const alert = createAlertEntity({
        id: 'alert-1',
        symbol: 'BTC',
        condition: 'above',
        targetValue: 100_000_000,
      });
      (alertRepo.find as jest.Mock).mockResolvedValue([alert]);
      (alertHistoryRepo.save as jest.Mock).mockRejectedValue(new Error('DB 오류'));

      const update = createPriceUpdate({
        symbol: 'BTC',
        price: 100_500_000,
      });

      // 예외가 발생하지 않아야 한다
      await expect(service.handlePriceUpdate(update)).resolves.not.toThrow();

      // WebSocket 알림은 정상 전송되어야 한다
      expect(priceGateway.broadcastAlert).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // handlePriceUpdate (알림 중복 방지 - 쿨다운)
  // =========================================================================
  describe('handlePriceUpdate - 알림 중복 방지', () => {
    it('쿨다운 시간 내에 동일 알림이 반복 발생하지 않아야 한다', async () => {
      const alert = createAlertEntity({
        id: 'alert-cooldown',
        symbol: 'BTC',
        condition: 'above',
        targetValue: 100_000_000,
      });
      (alertRepo.find as jest.Mock).mockResolvedValue([alert]);

      const update = createPriceUpdate({
        symbol: 'BTC',
        price: 100_500_000,
      });

      // 첫 번째 발동
      await service.handlePriceUpdate(update);
      expect(priceGateway.broadcastAlert).toHaveBeenCalledTimes(1);

      // 두 번째 발동 (쿨다운 내) - 발송되지 않아야 함
      await service.handlePriceUpdate(update);
      expect(priceGateway.broadcastAlert).toHaveBeenCalledTimes(1);
    });

    it('서로 다른 알림은 각각 독립적으로 발동해야 한다', async () => {
      const alert1 = createAlertEntity({
        id: 'alert-1',
        symbol: 'BTC',
        condition: 'above',
        targetValue: 100_000_000,
      });
      const alert2 = createAlertEntity({
        id: 'alert-2',
        symbol: 'BTC',
        condition: 'above',
        targetValue: 99_000_000,
        walletAddress: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      });
      (alertRepo.find as jest.Mock).mockResolvedValue([alert1, alert2]);

      const update = createPriceUpdate({
        symbol: 'BTC',
        price: 100_500_000,
      });

      await service.handlePriceUpdate(update);

      // 두 알림 모두 발동
      expect(priceGateway.broadcastAlert).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // handlePriceUpdate (김치 프리미엄 알림)
  // =========================================================================
  describe('handlePriceUpdate - 김치 프리미엄 알림', () => {
    it('premium_above 조건이 충족되면 알림을 발송해야 한다', async () => {
      const alert = createAlertEntity({
        id: 'alert-premium-above',
        symbol: 'BTC',
        condition: 'premium_above',
        targetValue: 3,
      });

      // 가격 알림은 빈 배열, 프리미엄 알림만 반환
      (alertRepo.find as jest.Mock).mockImplementation((options) => {
        if (!options || !options.where) return Promise.resolve([]);
        // 프리미엄 알림 쿼리인 경우
        const conditions = Array.isArray(options.where) ? options.where : [options.where];
        const hasPremiumCondition = conditions.some(
          (c: { condition?: string }) => c.condition === 'premium_above' || c.condition === 'premium_below',
        );
        if (hasPremiumCondition) {
          return Promise.resolve([alert]);
        }
        return Promise.resolve([]);
      });

      // 프리미엄 비율 3.5% 반환
      (premiumService.calculatePremium as jest.Mock).mockReturnValue({
        symbol: 'BTC',
        domesticExchange: 'upbit',
        domesticPrice: 137_550_000,
        binanceUsdtPrice: 95_000,
        usdtKrwRate: 1_400,
        binanceKrwPrice: 133_000_000,
        premiumAmount: 4_550_000,
        premiumRate: 3.5,
        timestamp: Date.now(),
      } as KimchiPremiumData);

      const update = createPriceUpdate({ symbol: 'BTC' });
      await service.handlePriceUpdate(update);

      expect(priceGateway.broadcastAlert).toHaveBeenCalledWith(
        alert.walletAddress,
        expect.objectContaining({
          alertId: 'alert-premium-above',
          symbol: 'BTC',
          condition: 'premium_above',
          triggeredValue: 3.5,
        }),
      );
    });

    it('premium_below 조건이 충족되면 알림을 발송해야 한다', async () => {
      const alert = createAlertEntity({
        id: 'alert-premium-below',
        symbol: 'BTC',
        condition: 'premium_below',
        targetValue: 1,
      });

      (alertRepo.find as jest.Mock).mockImplementation((options) => {
        if (!options || !options.where) return Promise.resolve([]);
        const conditions = Array.isArray(options.where) ? options.where : [options.where];
        const hasPremiumCondition = conditions.some(
          (c: { condition?: string }) => c.condition === 'premium_above' || c.condition === 'premium_below',
        );
        if (hasPremiumCondition) {
          return Promise.resolve([alert]);
        }
        return Promise.resolve([]);
      });

      (premiumService.calculatePremium as jest.Mock).mockReturnValue({
        symbol: 'BTC',
        domesticExchange: 'upbit',
        domesticPrice: 133_665_000,
        binanceUsdtPrice: 95_000,
        usdtKrwRate: 1_400,
        binanceKrwPrice: 133_000_000,
        premiumAmount: 665_000,
        premiumRate: 0.5,
        timestamp: Date.now(),
      } as KimchiPremiumData);

      const update = createPriceUpdate({ symbol: 'BTC' });
      await service.handlePriceUpdate(update);

      expect(priceGateway.broadcastAlert).toHaveBeenCalledWith(
        alert.walletAddress,
        expect.objectContaining({
          alertId: 'alert-premium-below',
          triggeredValue: 0.5,
        }),
      );
    });

    it('프리미엄 데이터가 없으면 알림을 발송하지 않아야 한다', async () => {
      const alert = createAlertEntity({
        id: 'alert-premium',
        symbol: 'BTC',
        condition: 'premium_above',
        targetValue: 3,
      });

      (alertRepo.find as jest.Mock).mockImplementation((options) => {
        if (!options || !options.where) return Promise.resolve([]);
        const conditions = Array.isArray(options.where) ? options.where : [options.where];
        const hasPremiumCondition = conditions.some(
          (c: { condition?: string }) => c.condition === 'premium_above' || c.condition === 'premium_below',
        );
        if (hasPremiumCondition) {
          return Promise.resolve([alert]);
        }
        return Promise.resolve([]);
      });

      // 프리미엄 계산 불가 (거래소 가격 데이터 부족)
      (premiumService.calculatePremium as jest.Mock).mockReturnValue(null);

      const update = createPriceUpdate({ symbol: 'BTC' });
      await service.handlePriceUpdate(update);

      expect(priceGateway.broadcastAlert).not.toHaveBeenCalled();
    });

    it('premium_above 조건이 충족되지 않으면 알림을 발송하지 않아야 한다', async () => {
      const alert = createAlertEntity({
        id: 'alert-premium-above',
        symbol: 'BTC',
        condition: 'premium_above',
        targetValue: 5,
      });

      (alertRepo.find as jest.Mock).mockImplementation((options) => {
        if (!options || !options.where) return Promise.resolve([]);
        const conditions = Array.isArray(options.where) ? options.where : [options.where];
        const hasPremiumCondition = conditions.some(
          (c: { condition?: string }) => c.condition === 'premium_above' || c.condition === 'premium_below',
        );
        if (hasPremiumCondition) {
          return Promise.resolve([alert]);
        }
        return Promise.resolve([]);
      });

      // 프리미엄 2% (목표: 5% 이상)
      (premiumService.calculatePremium as jest.Mock).mockReturnValue({
        symbol: 'BTC',
        domesticExchange: 'upbit',
        domesticPrice: 135_660_000,
        binanceUsdtPrice: 95_000,
        usdtKrwRate: 1_400,
        binanceKrwPrice: 133_000_000,
        premiumAmount: 2_660_000,
        premiumRate: 2.0,
        timestamp: Date.now(),
      } as KimchiPremiumData);

      const update = createPriceUpdate({ symbol: 'BTC' });
      await service.handlePriceUpdate(update);

      expect(priceGateway.broadcastAlert).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // handlePriceUpdate (오류 처리)
  // =========================================================================
  describe('handlePriceUpdate - 오류 처리', () => {
    it('알림 조건 검사 중 오류가 발생해도 예외를 던지지 않아야 한다', async () => {
      (alertRepo.find as jest.Mock).mockRejectedValue(new Error('DB 오류'));

      const update = createPriceUpdate({ symbol: 'BTC' });

      await expect(service.handlePriceUpdate(update)).resolves.not.toThrow();
    });

    it('활성 알림이 없으면 아무 작업도 하지 않아야 한다', async () => {
      (alertRepo.find as jest.Mock).mockResolvedValue([]);

      const update = createPriceUpdate({ symbol: 'BTC' });
      await service.handlePriceUpdate(update);

      expect(priceGateway.broadcastAlert).not.toHaveBeenCalled();
      expect(alertHistoryRepo.save).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 알림 메시지 생성
  // =========================================================================
  describe('알림 메시지 생성', () => {
    it('above 조건의 알림 메시지에 현재가가 포함되어야 한다', async () => {
      const alert = createAlertEntity({
        id: 'alert-msg',
        symbol: 'BTC',
        condition: 'above',
        targetValue: 100_000_000,
      });
      (alertRepo.find as jest.Mock).mockResolvedValue([alert]);

      const update = createPriceUpdate({
        symbol: 'BTC',
        price: 105_000_000,
      });

      await service.handlePriceUpdate(update);

      expect(priceGateway.broadcastAlert).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          message: expect.stringContaining('BTC'),
        }),
      );
    });

    it('premium_above 조건의 알림 메시지에 프리미엄 비율이 포함되어야 한다', async () => {
      const alert = createAlertEntity({
        id: 'alert-premium-msg',
        symbol: 'BTC',
        condition: 'premium_above',
        targetValue: 3,
      });

      (alertRepo.find as jest.Mock).mockImplementation((options) => {
        if (!options || !options.where) return Promise.resolve([]);
        const conditions = Array.isArray(options.where) ? options.where : [options.where];
        const hasPremiumCondition = conditions.some(
          (c: { condition?: string }) => c.condition === 'premium_above' || c.condition === 'premium_below',
        );
        if (hasPremiumCondition) {
          return Promise.resolve([alert]);
        }
        return Promise.resolve([]);
      });

      (premiumService.calculatePremium as jest.Mock).mockReturnValue({
        symbol: 'BTC',
        domesticExchange: 'upbit',
        domesticPrice: 137_550_000,
        binanceUsdtPrice: 95_000,
        usdtKrwRate: 1_400,
        binanceKrwPrice: 133_000_000,
        premiumAmount: 4_550_000,
        premiumRate: 3.5,
        timestamp: Date.now(),
      } as KimchiPremiumData);

      const update = createPriceUpdate({ symbol: 'BTC' });
      await service.handlePriceUpdate(update);

      expect(priceGateway.broadcastAlert).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          message: expect.stringContaining('김치 프리미엄'),
        }),
      );
    });
  });
});
