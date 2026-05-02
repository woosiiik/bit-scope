/**
 * PremiumService 단위 테스트
 *
 * 모의 PriceMonitorService 및 TypeORM 리포지토리를 사용하여
 * 김치 프리미엄 계산, 이력 조회, 스냅샷 저장 로직을 검증한다.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PremiumService } from './premium.service';
import { KimchiPremiumHistoryEntity } from './entities/kimchi-premium-history.entity';
import { PriceMonitorService, PriceEntry } from '../price/price-monitor.service';

/** 테스트용 PriceEntry 생성 헬퍼 */
function createPriceEntry(
  exchange: 'upbit' | 'bithumb' | 'coinone',
  symbol: string,
  price: number,
): PriceEntry {
  return {
    exchange,
    symbol,
    price,
    changeRate: 0,
    volume24h: 1000,
    timestamp: Date.now(),
    updatedAt: Date.now(),
  };
}

describe('PremiumService', () => {
  let service: PremiumService;
  let premiumHistoryRepo: jest.Mocked<Partial<Repository<KimchiPremiumHistoryEntity>>>;
  let priceMonitorService: jest.Mocked<Partial<PriceMonitorService>>;

  beforeEach(async () => {
    premiumHistoryRepo = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((entities) => Promise.resolve(entities)),
    };

    priceMonitorService = {
      getCurrentPrice: jest.fn().mockReturnValue(null),
      isActive: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PremiumService,
        {
          provide: getRepositoryToken(KimchiPremiumHistoryEntity),
          useValue: premiumHistoryRepo,
        },
        {
          provide: PriceMonitorService,
          useValue: priceMonitorService,
        },
      ],
    }).compile();

    service = module.get<PremiumService>(PremiumService);
  });

  it('서비스 인스턴스가 정의되어 있어야 한다', () => {
    expect(service).toBeDefined();
  });

  describe('calculatePremium', () => {
    it('3개 거래소의 가격이 모두 있을 때 프리미엄을 정확히 계산해야 한다', () => {
      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockImplementation((exchange: string, symbol: string) => {
          if (exchange === 'upbit') return createPriceEntry('upbit', symbol, 100_000_000);
          if (exchange === 'bithumb') return createPriceEntry('bithumb', symbol, 100_500_000);
          if (exchange === 'coinone') return createPriceEntry('coinone', symbol, 99_800_000);
          return null;
        });

      const result = service.calculatePremium('BTC');

      expect(result).not.toBeNull();
      expect(result!.symbol).toBe('BTC');
      expect(result!.maxPrice.exchange).toBe('bithumb');
      expect(result!.maxPrice.price).toBe(100_500_000);
      expect(result!.minPrice.exchange).toBe('coinone');
      expect(result!.minPrice.price).toBe(99_800_000);
      expect(result!.premiumAmount).toBe(700_000);
      // (100500000 - 99800000) / 99800000 * 100 = 0.7014...
      expect(result!.premiumRate).toBeCloseTo(0.7014, 3);
    });

    it('2개 거래소의 가격만 있을 때도 프리미엄을 계산해야 한다', () => {
      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockImplementation((exchange: string, symbol: string) => {
          if (exchange === 'upbit') return createPriceEntry('upbit', symbol, 50_000_000);
          if (exchange === 'bithumb') return createPriceEntry('bithumb', symbol, 50_250_000);
          return null;
        });

      const result = service.calculatePremium('ETH');

      expect(result).not.toBeNull();
      expect(result!.symbol).toBe('ETH');
      expect(result!.maxPrice.exchange).toBe('bithumb');
      expect(result!.minPrice.exchange).toBe('upbit');
      expect(result!.premiumAmount).toBe(250_000);
    });

    it('1개 거래소의 가격만 있을 때 null을 반환해야 한다', () => {
      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockImplementation((exchange: string, symbol: string) => {
          if (exchange === 'upbit') return createPriceEntry('upbit', symbol, 100_000_000);
          return null;
        });

      const result = service.calculatePremium('BTC');

      expect(result).toBeNull();
    });

    it('가격 데이터가 없을 때 null을 반환해야 한다', () => {
      const result = service.calculatePremium('BTC');

      expect(result).toBeNull();
    });

    it('가격이 0인 거래소는 무시해야 한다', () => {
      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockImplementation((exchange: string, symbol: string) => {
          if (exchange === 'upbit') return createPriceEntry('upbit', symbol, 100_000_000);
          if (exchange === 'bithumb') return createPriceEntry('bithumb', symbol, 0);
          if (exchange === 'coinone') return createPriceEntry('coinone', symbol, 99_500_000);
          return null;
        });

      const result = service.calculatePremium('BTC');

      expect(result).not.toBeNull();
      // 빗썸(0원)은 무시되고, 업비트와 코인원만 비교
      expect(Object.keys(result!.prices)).toHaveLength(2);
      expect(result!.prices.bithumb).toBeUndefined();
    });

    it('모든 거래소의 가격이 동일할 때 프리미엄이 0이어야 한다', () => {
      const samePrice = 100_000_000;
      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockImplementation((exchange: string, symbol: string) => {
          return createPriceEntry(exchange as 'upbit', symbol, samePrice);
        });

      const result = service.calculatePremium('BTC');

      expect(result).not.toBeNull();
      expect(result!.premiumAmount).toBe(0);
      expect(result!.premiumRate).toBe(0);
    });

    it('prices 필드에 유효한 거래소별 가격이 포함되어야 한다', () => {
      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockImplementation((exchange: string, symbol: string) => {
          if (exchange === 'upbit') return createPriceEntry('upbit', symbol, 100_000_000);
          if (exchange === 'bithumb') return createPriceEntry('bithumb', symbol, 101_000_000);
          if (exchange === 'coinone') return createPriceEntry('coinone', symbol, 99_000_000);
          return null;
        });

      const result = service.calculatePremium('BTC');

      expect(result).not.toBeNull();
      expect(result!.prices.upbit).toBe(100_000_000);
      expect(result!.prices.bithumb).toBe(101_000_000);
      expect(result!.prices.coinone).toBe(99_000_000);
    });

    it('timestamp 필드가 현재 시간에 가까워야 한다', () => {
      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockImplementation((exchange: string, symbol: string) => {
          return createPriceEntry(exchange as 'upbit', symbol, 100_000_000);
        });

      const before = Date.now();
      const result = service.calculatePremium('BTC');
      const after = Date.now();

      expect(result).not.toBeNull();
      expect(result!.timestamp).toBeGreaterThanOrEqual(before);
      expect(result!.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('getPremiumHistory', () => {
    it('24시간 기간의 프리미엄 이력을 조회해야 한다', async () => {
      const mockHistory: KimchiPremiumHistoryEntity[] = [
        Object.assign(new KimchiPremiumHistoryEntity(), {
          id: 'hist-1',
          symbol: 'BTC',
          upbitPrice: 100_000_000,
          bithumbPrice: 100_500_000,
          coinonePrice: 99_800_000,
          premiumRate: 0.7014,
          recordedAt: new Date('2026-04-30T12:00:00Z'),
        }),
      ];

      (premiumHistoryRepo.find as jest.Mock).mockResolvedValue(mockHistory);

      const result = await service.getPremiumHistory('BTC', '24h');

      expect(premiumHistoryRepo.find).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
      expect(result[0]!.symbol).toBe('BTC');
    });

    it('7일 기간의 프리미엄 이력을 조회해야 한다', async () => {
      (premiumHistoryRepo.find as jest.Mock).mockResolvedValue([]);

      await service.getPremiumHistory('ETH', '7d');

      expect(premiumHistoryRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            symbol: 'ETH',
          }),
          order: { recordedAt: 'ASC' },
        }),
      );
    });

    it('30일 기간의 프리미엄 이력을 조회해야 한다', async () => {
      (premiumHistoryRepo.find as jest.Mock).mockResolvedValue([]);

      await service.getPremiumHistory('XRP', '30d');

      expect(premiumHistoryRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            symbol: 'XRP',
          }),
          order: { recordedAt: 'ASC' },
        }),
      );
    });

    it('심볼을 대문자로 정규화하여 조회해야 한다', async () => {
      (premiumHistoryRepo.find as jest.Mock).mockResolvedValue([]);

      await service.getPremiumHistory('btc', '24h');

      expect(premiumHistoryRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            symbol: 'BTC',
          }),
        }),
      );
    });

    it('데이터가 없으면 빈 배열을 반환해야 한다', async () => {
      (premiumHistoryRepo.find as jest.Mock).mockResolvedValue([]);

      const result = await service.getPremiumHistory('BTC', '24h');

      expect(result).toHaveLength(0);
    });
  });

  describe('getTopPremiumCoins', () => {
    it('프리미엄 비율(절대값) 기준 내림차순으로 정렬해야 한다', () => {
      // BTC: 프리미엄 1%, ETH: 프리미엄 3%, XRP: 프리미엄 2%
      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockImplementation((exchange: string, symbol: string) => {
          const prices: Record<string, Record<string, number>> = {
            BTC: { upbit: 100_000_000, bithumb: 101_000_000, coinone: 100_000_000 },
            ETH: { upbit: 5_000_000, bithumb: 5_150_000, coinone: 5_000_000 },
            XRP: { upbit: 1_000, bithumb: 1_020, coinone: 1_000 },
          };
          const price = prices[symbol]?.[exchange];
          if (price) return createPriceEntry(exchange as 'upbit', symbol, price);
          return null;
        });

      const result = service.getTopPremiumCoins(3);

      expect(result.length).toBeGreaterThan(0);
      // ETH(3%) > XRP(2%) > BTC(1%) 순서
      expect(result[0]!.symbol).toBe('ETH');
      expect(result[1]!.symbol).toBe('XRP');
      expect(result[2]!.symbol).toBe('BTC');
    });

    it('limit 파라미터가 결과 수를 제한해야 한다', () => {
      // 모든 코인에 대해 가격 데이터 제공
      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockImplementation((exchange: string, symbol: string) => {
          const basePrice = 1_000_000;
          const exchangeMultiplier = exchange === 'upbit' ? 1.01 : exchange === 'bithumb' ? 1.02 : 1.0;
          return createPriceEntry(exchange as 'upbit', symbol, basePrice * exchangeMultiplier);
        });

      const result = service.getTopPremiumCoins(3);

      expect(result).toHaveLength(3);
    });

    it('가격 데이터가 없으면 빈 배열을 반환해야 한다', () => {
      const result = service.getTopPremiumCoins(10);

      expect(result).toHaveLength(0);
    });

    it('limit 기본값은 10이어야 한다', () => {
      // 모든 코인에 대해 가격 데이터 제공
      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockImplementation((exchange: string, symbol: string) => {
          return createPriceEntry(exchange as 'upbit', symbol, 1_000_000);
        });

      const result = service.getTopPremiumCoins();

      expect(result.length).toBeLessThanOrEqual(10);
    });
  });

  describe('savePremiumSnapshot', () => {
    it('프리미엄 스냅샷을 DB에 저장해야 한다', async () => {
      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockImplementation((exchange: string, symbol: string) => {
          const prices: Record<string, Record<string, number>> = {
            BTC: { upbit: 100_000_000, bithumb: 100_500_000, coinone: 99_800_000 },
            ETH: { upbit: 5_000_000, bithumb: 5_050_000, coinone: 4_980_000 },
            XRP: { upbit: 1_000, bithumb: 1_010, coinone: 995 },
            SOL: { upbit: 200_000, bithumb: 201_000, coinone: 199_500 },
            DOGE: { upbit: 200, bithumb: 202, coinone: 199 },
          };
          const price = prices[symbol]?.[exchange];
          if (price) return createPriceEntry(exchange as 'upbit', symbol, price);
          return null;
        });

      await service.savePremiumSnapshot();

      expect(premiumHistoryRepo.save).toHaveBeenCalledTimes(1);
      const savedEntities = (premiumHistoryRepo.save as jest.Mock).mock.calls[0]![0];
      // DEFAULT_PREMIUM_COINS에 포함된 5개 코인 모두 저장
      expect(savedEntities).toHaveLength(5);
    });

    it('모니터링이 비활성 상태이면 저장하지 않아야 한다', async () => {
      (priceMonitorService.isActive as jest.Mock).mockReturnValue(false);

      await service.savePremiumSnapshot();

      expect(premiumHistoryRepo.save).not.toHaveBeenCalled();
    });

    it('가격 데이터가 없는 코인은 스냅샷에 포함하지 않아야 한다', async () => {
      // BTC만 가격 데이터 제공 (2개 거래소 이상)
      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockImplementation((exchange: string, symbol: string) => {
          if (symbol === 'BTC') {
            return createPriceEntry(exchange as 'upbit', symbol, 100_000_000);
          }
          return null;
        });

      await service.savePremiumSnapshot();

      expect(premiumHistoryRepo.save).toHaveBeenCalledTimes(1);
      const savedEntities = (premiumHistoryRepo.save as jest.Mock).mock.calls[0]![0];
      // BTC는 3개 거래소 가격이 동일하므로 프리미엄 0%
      expect(savedEntities).toHaveLength(1);
      expect(savedEntities[0].symbol).toBe('BTC');
    });

    it('저장할 데이터가 없으면 save를 호출하지 않아야 한다', async () => {
      // 모든 코인에 대해 1개 거래소만 가격 제공 (프리미엄 계산 불가)
      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockImplementation((exchange: string, symbol: string) => {
          if (exchange === 'upbit') {
            return createPriceEntry('upbit', symbol, 100_000_000);
          }
          return null;
        });

      await service.savePremiumSnapshot();

      expect(premiumHistoryRepo.save).not.toHaveBeenCalled();
    });

    it('DB 저장 실패 시 오류를 로깅하고 예외를 던지지 않아야 한다', async () => {
      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockImplementation((exchange: string, symbol: string) => {
          return createPriceEntry(exchange as 'upbit', symbol, 100_000_000);
        });

      (premiumHistoryRepo.save as jest.Mock).mockRejectedValue(
        new Error('DB 연결 실패'),
      );

      // 예외가 발생하지 않아야 한다
      await expect(service.savePremiumSnapshot()).resolves.not.toThrow();
    });

    it('저장되는 엔티티에 올바른 거래소별 가격이 포함되어야 한다', async () => {
      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockImplementation((exchange: string, symbol: string) => {
          if (symbol !== 'BTC') return null;
          if (exchange === 'upbit') return createPriceEntry('upbit', 'BTC', 100_000_000);
          if (exchange === 'bithumb') return createPriceEntry('bithumb', 'BTC', 100_500_000);
          if (exchange === 'coinone') return createPriceEntry('coinone', 'BTC', 99_800_000);
          return null;
        });

      await service.savePremiumSnapshot();

      const savedEntities = (premiumHistoryRepo.save as jest.Mock).mock.calls[0]![0];
      const btcEntity = savedEntities.find(
        (e: KimchiPremiumHistoryEntity) => e.symbol === 'BTC',
      );

      expect(btcEntity).toBeDefined();
      expect(btcEntity.upbitPrice).toBe(100_000_000);
      expect(btcEntity.bithumbPrice).toBe(100_500_000);
      expect(btcEntity.coinonePrice).toBe(99_800_000);
    });

    it('특정 거래소의 가격이 없으면 해당 거래소 가격을 0으로 저장해야 한다', async () => {
      // BTC: 업비트, 빗썸만 가격 제공 (코인원 없음)
      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockImplementation((exchange: string, symbol: string) => {
          if (symbol !== 'BTC') return null;
          if (exchange === 'upbit') return createPriceEntry('upbit', 'BTC', 100_000_000);
          if (exchange === 'bithumb') return createPriceEntry('bithumb', 'BTC', 100_500_000);
          return null;
        });

      await service.savePremiumSnapshot();

      const savedEntities = (premiumHistoryRepo.save as jest.Mock).mock.calls[0]![0];
      const btcEntity = savedEntities.find(
        (e: KimchiPremiumHistoryEntity) => e.symbol === 'BTC',
      );

      expect(btcEntity).toBeDefined();
      expect(btcEntity.coinonePrice).toBe(0);
    });
  });
});
