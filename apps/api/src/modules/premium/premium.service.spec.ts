/**
 * PremiumService 단위 테스트
 *
 * 모의 PriceMonitorService 및 TypeORM 리포지토리를 사용하여
 * 김치 프리미엄(국내 vs 바이낸스) 계산, 이력 조회, 스냅샷 저장 로직을 검증한다.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PremiumService } from './premium.service';
import { KimchiPremiumHistoryEntity } from './entities/kimchi-premium-history.entity';
import { PriceMonitorService, PriceEntry } from '../price/price-monitor.service';
import type { BinancePriceEntry } from '../price/exchange-ws/binance-polling.client';

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

/** 테스트용 BinancePriceEntry 생성 헬퍼 */
function createBinancePriceEntry(
  symbol: string,
  usdtPrice: number,
): BinancePriceEntry {
  return {
    symbol,
    usdtPrice,
    timestamp: Date.now(),
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
      getBinancePrice: jest.fn().mockReturnValue(null),
      getUsdtKrwRate: jest.fn().mockReturnValue(0),
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
    it('국내 가격과 바이낸스 가격이 있을 때 김프를 정확히 계산해야 한다', () => {
      // 업비트 BTC: 139,000,000 KRW
      // 바이낸스 BTC: 95,000 USDT
      // USDT/KRW 환율: 1,400 KRW
      // 바이낸스 KRW 환산가: 95,000 * 1,400 = 133,000,000
      // 김프: (139,000,000 - 133,000,000) / 133,000,000 * 100 = 4.5112...%
      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockReturnValue(createPriceEntry('upbit', 'BTC', 139_000_000));
      (priceMonitorService.getBinancePrice as jest.Mock)
        .mockReturnValue(createBinancePriceEntry('BTC', 95_000));
      (priceMonitorService.getUsdtKrwRate as jest.Mock)
        .mockReturnValue(1_400);

      const result = service.calculatePremium('BTC', 'upbit');

      expect(result).not.toBeNull();
      expect(result!.symbol).toBe('BTC');
      expect(result!.domesticExchange).toBe('upbit');
      expect(result!.domesticPrice).toBe(139_000_000);
      expect(result!.binanceUsdtPrice).toBe(95_000);
      expect(result!.usdtKrwRate).toBe(1_400);
      expect(result!.binanceKrwPrice).toBe(133_000_000);
      expect(result!.premiumAmount).toBe(6_000_000);
      expect(result!.premiumRate).toBeCloseTo(4.5113, 3);
    });

    it('국내 가격이 없을 때 null을 반환해야 한다', () => {
      (priceMonitorService.getCurrentPrice as jest.Mock).mockReturnValue(null);
      (priceMonitorService.getBinancePrice as jest.Mock)
        .mockReturnValue(createBinancePriceEntry('BTC', 95_000));
      (priceMonitorService.getUsdtKrwRate as jest.Mock).mockReturnValue(1_400);

      const result = service.calculatePremium('BTC');

      expect(result).toBeNull();
    });

    it('바이낸스 가격이 없을 때 null을 반환해야 한다', () => {
      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockReturnValue(createPriceEntry('upbit', 'BTC', 139_000_000));
      (priceMonitorService.getBinancePrice as jest.Mock).mockReturnValue(null);
      (priceMonitorService.getUsdtKrwRate as jest.Mock).mockReturnValue(1_400);

      const result = service.calculatePremium('BTC');

      expect(result).toBeNull();
    });

    it('USDT/KRW 환율이 0일 때 null을 반환해야 한다', () => {
      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockReturnValue(createPriceEntry('upbit', 'BTC', 139_000_000));
      (priceMonitorService.getBinancePrice as jest.Mock)
        .mockReturnValue(createBinancePriceEntry('BTC', 95_000));
      (priceMonitorService.getUsdtKrwRate as jest.Mock).mockReturnValue(0);

      const result = service.calculatePremium('BTC');

      expect(result).toBeNull();
    });

    it('기본 국내 거래소가 upbit이어야 한다', () => {
      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockReturnValue(createPriceEntry('upbit', 'BTC', 139_000_000));
      (priceMonitorService.getBinancePrice as jest.Mock)
        .mockReturnValue(createBinancePriceEntry('BTC', 95_000));
      (priceMonitorService.getUsdtKrwRate as jest.Mock).mockReturnValue(1_400);

      const result = service.calculatePremium('BTC');

      expect(result).not.toBeNull();
      expect(result!.domesticExchange).toBe('upbit');
      expect(priceMonitorService.getCurrentPrice).toHaveBeenCalledWith('upbit', 'BTC');
    });

    it('빗썸을 기준 국내 거래소로 지정할 수 있어야 한다', () => {
      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockReturnValue(createPriceEntry('bithumb', 'BTC', 140_000_000));
      (priceMonitorService.getBinancePrice as jest.Mock)
        .mockReturnValue(createBinancePriceEntry('BTC', 95_000));
      (priceMonitorService.getUsdtKrwRate as jest.Mock).mockReturnValue(1_400);

      const result = service.calculatePremium('BTC', 'bithumb');

      expect(result).not.toBeNull();
      expect(result!.domesticExchange).toBe('bithumb');
      expect(result!.domesticPrice).toBe(140_000_000);
      expect(priceMonitorService.getCurrentPrice).toHaveBeenCalledWith('bithumb', 'BTC');
    });

    it('마이너스 김프도 정확히 계산해야 한다', () => {
      // 국내 가격이 바이낸스보다 낮은 경우 (역프)
      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockReturnValue(createPriceEntry('upbit', 'BTC', 130_000_000));
      (priceMonitorService.getBinancePrice as jest.Mock)
        .mockReturnValue(createBinancePriceEntry('BTC', 95_000));
      (priceMonitorService.getUsdtKrwRate as jest.Mock).mockReturnValue(1_400);

      const result = service.calculatePremium('BTC');

      expect(result).not.toBeNull();
      expect(result!.premiumRate).toBeLessThan(0);
      expect(result!.premiumAmount).toBeLessThan(0);
    });

    it('timestamp 필드가 현재 시간에 가까워야 한다', () => {
      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockReturnValue(createPriceEntry('upbit', 'BTC', 139_000_000));
      (priceMonitorService.getBinancePrice as jest.Mock)
        .mockReturnValue(createBinancePriceEntry('BTC', 95_000));
      (priceMonitorService.getUsdtKrwRate as jest.Mock).mockReturnValue(1_400);

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
          domesticExchange: 'upbit',
          domesticPrice: 139_000_000,
          binanceUsdtPrice: 95_000,
          usdtKrwRate: 1_400,
          premiumRate: 4.51,
          recordedAt: new Date('2026-04-30T12:00:00Z'),
        }),
      ];

      (premiumHistoryRepo.find as jest.Mock).mockResolvedValue(mockHistory);

      const result = await service.getPremiumHistory('BTC', '24h');

      expect(premiumHistoryRepo.find).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
      expect(result[0]!.symbol).toBe('BTC');
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

    it('국내 거래소 파라미터가 조회 조건에 포함되어야 한다', async () => {
      (premiumHistoryRepo.find as jest.Mock).mockResolvedValue([]);

      await service.getPremiumHistory('BTC', '24h', 'bithumb');

      expect(premiumHistoryRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            domesticExchange: 'bithumb',
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
      (priceMonitorService.getUsdtKrwRate as jest.Mock).mockReturnValue(1_400);

      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockImplementation((exchange: string, symbol: string) => {
          // 코인별 국내 가격 (바이낸스 대비 각기 다른 김프)
          const prices: Record<string, number> = {
            BTC: 134_400_000, // 1% 김프
            ETH: 4_368_000,   // 4% 김프
            XRP: 1_540,       // 2% 김프
          };
          const price = prices[symbol];
          if (price) return createPriceEntry(exchange as 'upbit', symbol, price);
          return null;
        });

      (priceMonitorService.getBinancePrice as jest.Mock)
        .mockImplementation((symbol: string) => {
          const prices: Record<string, number> = {
            BTC: 95_000,
            ETH: 3_000,
            XRP: 1.0789,
          };
          const usdtPrice = prices[symbol];
          if (usdtPrice) return createBinancePriceEntry(symbol, usdtPrice);
          return null;
        });

      const result = service.getTopPremiumCoins(3);

      expect(result.length).toBeGreaterThan(0);
      // ETH(4%) > XRP(2%) > BTC(1%) 순서
      expect(result[0]!.symbol).toBe('ETH');
    });

    it('limit 파라미터가 결과 수를 제한해야 한다', () => {
      (priceMonitorService.getUsdtKrwRate as jest.Mock).mockReturnValue(1_400);

      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockImplementation((exchange: string, symbol: string) => {
          return createPriceEntry(exchange as 'upbit', symbol, 1_400_000);
        });

      (priceMonitorService.getBinancePrice as jest.Mock)
        .mockImplementation((symbol: string) => {
          return createBinancePriceEntry(symbol, 1_000);
        });

      const result = service.getTopPremiumCoins(3);

      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('가격 데이터가 없으면 빈 배열을 반환해야 한다', () => {
      const result = service.getTopPremiumCoins(10);

      expect(result).toHaveLength(0);
    });

    it('국내 거래소를 지정할 수 있어야 한다', () => {
      (priceMonitorService.getUsdtKrwRate as jest.Mock).mockReturnValue(1_400);
      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockReturnValue(createPriceEntry('bithumb', 'BTC', 139_000_000));
      (priceMonitorService.getBinancePrice as jest.Mock)
        .mockReturnValue(createBinancePriceEntry('BTC', 95_000));

      const result = service.getTopPremiumCoins(10, 'bithumb');

      if (result.length > 0) {
        expect(result[0]!.domesticExchange).toBe('bithumb');
      }
    });
  });

  describe('savePremiumSnapshot', () => {
    it('모든 국내 거래소 기준으로 프리미엄 스냅샷을 DB에 저장해야 한다', async () => {
      (priceMonitorService.getUsdtKrwRate as jest.Mock).mockReturnValue(1_400);

      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockImplementation((exchange: string, symbol: string) => {
          return createPriceEntry(exchange as 'upbit', symbol, 139_000_000);
        });

      (priceMonitorService.getBinancePrice as jest.Mock)
        .mockImplementation((symbol: string) => {
          return createBinancePriceEntry(symbol, 95_000);
        });

      await service.savePremiumSnapshot();

      expect(premiumHistoryRepo.save).toHaveBeenCalledTimes(1);
      const savedEntities = (premiumHistoryRepo.save as jest.Mock).mock.calls[0]![0];
      // DEFAULT_PREMIUM_COINS(5) x DOMESTIC_EXCHANGES(3) = 15 항목
      expect(savedEntities).toHaveLength(15);
    });

    it('모니터링이 비활성 상태이면 저장하지 않아야 한다', async () => {
      (priceMonitorService.isActive as jest.Mock).mockReturnValue(false);

      await service.savePremiumSnapshot();

      expect(premiumHistoryRepo.save).not.toHaveBeenCalled();
    });

    it('DB 저장 실패 시 오류를 로깅하고 예외를 던지지 않아야 한다', async () => {
      (priceMonitorService.getUsdtKrwRate as jest.Mock).mockReturnValue(1_400);
      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockReturnValue(createPriceEntry('upbit', 'BTC', 139_000_000));
      (priceMonitorService.getBinancePrice as jest.Mock)
        .mockReturnValue(createBinancePriceEntry('BTC', 95_000));

      (premiumHistoryRepo.save as jest.Mock).mockRejectedValue(
        new Error('DB 연결 실패'),
      );

      await expect(service.savePremiumSnapshot()).resolves.not.toThrow();
    });

    it('저장되는 엔티티에 올바른 데이터가 포함되어야 한다', async () => {
      (priceMonitorService.getUsdtKrwRate as jest.Mock).mockReturnValue(1_400);

      (priceMonitorService.getCurrentPrice as jest.Mock)
        .mockImplementation((exchange: string, symbol: string) => {
          if (symbol !== 'BTC') return null;
          return createPriceEntry(exchange as 'upbit', symbol, 139_000_000);
        });

      (priceMonitorService.getBinancePrice as jest.Mock)
        .mockImplementation((symbol: string) => {
          if (symbol !== 'BTC') return null;
          return createBinancePriceEntry(symbol, 95_000);
        });

      await service.savePremiumSnapshot();

      const savedEntities = (premiumHistoryRepo.save as jest.Mock).mock.calls[0]![0];
      const upbitEntity = savedEntities.find(
        (e: KimchiPremiumHistoryEntity) => e.symbol === 'BTC' && e.domesticExchange === 'upbit',
      );

      expect(upbitEntity).toBeDefined();
      expect(upbitEntity.domesticPrice).toBe(139_000_000);
      expect(upbitEntity.binanceUsdtPrice).toBe(95_000);
      expect(upbitEntity.usdtKrwRate).toBe(1_400);
    });
  });
});
