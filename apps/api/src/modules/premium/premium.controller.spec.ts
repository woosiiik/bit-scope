/**
 * PremiumController 단위 테스트
 *
 * 모의 PremiumService를 사용하여 컨트롤러의 엔드포인트 동작을 검증한다.
 */

import { Test, TestingModule } from '@nestjs/testing';

import type { KimchiPremiumData } from '@bitscope/shared';

import { PremiumController } from './premium.controller';
import { PremiumService } from './premium.service';
import { KimchiPremiumHistoryEntity } from './entities/kimchi-premium-history.entity';

/** 테스트용 KimchiPremiumData 생성 헬퍼 */
function createTestPremiumData(
  symbol: string,
  premiumRate: number,
  domesticExchange: 'upbit' | 'bithumb' | 'coinone' = 'upbit',
): KimchiPremiumData {
  return {
    symbol,
    domesticExchange,
    domesticPrice: 139_000_000,
    binanceUsdtPrice: 95_000,
    usdtKrwRate: 1_400,
    binanceKrwPrice: 133_000_000,
    premiumAmount: 6_000_000,
    premiumRate,
    timestamp: Date.now(),
  };
}

describe('PremiumController', () => {
  let controller: PremiumController;
  let premiumService: jest.Mocked<Partial<PremiumService>>;

  beforeEach(async () => {
    premiumService = {
      calculatePremium: jest.fn(),
      getPremiumHistory: jest.fn(),
      getTopPremiumCoins: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PremiumController],
      providers: [
        {
          provide: PremiumService,
          useValue: premiumService,
        },
      ],
    }).compile();

    controller = module.get<PremiumController>(PremiumController);
  });

  it('컨트롤러 인스턴스가 정의되어 있어야 한다', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /premium', () => {
    it('상위 프리미엄 목록을 반환해야 한다', () => {
      const mockData = [
        createTestPremiumData('BTC', 4.5),
        createTestPremiumData('ETH', 3.2),
      ];
      (premiumService.getTopPremiumCoins as jest.Mock).mockReturnValue(mockData);

      const result = controller.getTopPremiums();

      expect(premiumService.getTopPremiumCoins).toHaveBeenCalledWith(10, 'upbit');
      expect(result).toHaveLength(2);
    });

    it('limit 파라미터를 올바르게 전달해야 한다', () => {
      (premiumService.getTopPremiumCoins as jest.Mock).mockReturnValue([]);

      controller.getTopPremiums(undefined, '5');

      expect(premiumService.getTopPremiumCoins).toHaveBeenCalledWith(5, 'upbit');
    });

    it('exchange 파라미터를 올바르게 전달해야 한다', () => {
      (premiumService.getTopPremiumCoins as jest.Mock).mockReturnValue([]);

      controller.getTopPremiums('bithumb', '10');

      expect(premiumService.getTopPremiumCoins).toHaveBeenCalledWith(10, 'bithumb');
    });

    it('잘못된 exchange 파라미터는 기본값 upbit으로 처리해야 한다', () => {
      (premiumService.getTopPremiumCoins as jest.Mock).mockReturnValue([]);

      controller.getTopPremiums('invalid');

      expect(premiumService.getTopPremiumCoins).toHaveBeenCalledWith(10, 'upbit');
    });

    it('잘못된 limit 파라미터는 기본값 10으로 처리해야 한다', () => {
      (premiumService.getTopPremiumCoins as jest.Mock).mockReturnValue([]);

      controller.getTopPremiums(undefined, 'invalid');

      expect(premiumService.getTopPremiumCoins).toHaveBeenCalledWith(10, 'upbit');
    });
  });

  describe('GET /premium/:symbol', () => {
    it('특정 코인의 프리미엄 데이터를 반환해야 한다', () => {
      const mockData = createTestPremiumData('BTC', 4.5);
      (premiumService.calculatePremium as jest.Mock).mockReturnValue(mockData);

      const result = controller.getPremium('BTC');

      expect(premiumService.calculatePremium).toHaveBeenCalledWith('BTC', 'upbit');
      expect(result).not.toBeNull();
      expect(result!.symbol).toBe('BTC');
    });

    it('심볼을 대문자로 변환하여 서비스에 전달해야 한다', () => {
      (premiumService.calculatePremium as jest.Mock).mockReturnValue(null);

      controller.getPremium('btc');

      expect(premiumService.calculatePremium).toHaveBeenCalledWith('BTC', 'upbit');
    });

    it('exchange 쿼리 파라미터를 서비스에 전달해야 한다', () => {
      (premiumService.calculatePremium as jest.Mock).mockReturnValue(null);

      controller.getPremium('BTC', 'bithumb');

      expect(premiumService.calculatePremium).toHaveBeenCalledWith('BTC', 'bithumb');
    });

    it('데이터가 없으면 null을 반환해야 한다', () => {
      (premiumService.calculatePremium as jest.Mock).mockReturnValue(null);

      const result = controller.getPremium('UNKNOWN');

      expect(result).toBeNull();
    });
  });

  describe('GET /premium/:symbol/history', () => {
    it('24시간 이력을 기본 조회해야 한다', async () => {
      const mockHistory: KimchiPremiumHistoryEntity[] = [];
      (premiumService.getPremiumHistory as jest.Mock).mockResolvedValue(mockHistory);

      const result = await controller.getPremiumHistory('BTC', {});

      expect(premiumService.getPremiumHistory).toHaveBeenCalledWith('BTC', '24h', 'upbit');
      expect(result).toHaveLength(0);
    });

    it('지정된 기간(7d)으로 이력을 조회해야 한다', async () => {
      (premiumService.getPremiumHistory as jest.Mock).mockResolvedValue([]);

      await controller.getPremiumHistory('ETH', { period: '7d' });

      expect(premiumService.getPremiumHistory).toHaveBeenCalledWith('ETH', '7d', 'upbit');
    });

    it('exchange 쿼리 파라미터를 이력 조회에 전달해야 한다', async () => {
      (premiumService.getPremiumHistory as jest.Mock).mockResolvedValue([]);

      await controller.getPremiumHistory('BTC', { period: '24h' }, 'coinone');

      expect(premiumService.getPremiumHistory).toHaveBeenCalledWith('BTC', '24h', 'coinone');
    });

    it('심볼을 대문자로 변환하여 서비스에 전달해야 한다', async () => {
      (premiumService.getPremiumHistory as jest.Mock).mockResolvedValue([]);

      await controller.getPremiumHistory('btc', { period: '24h' });

      expect(premiumService.getPremiumHistory).toHaveBeenCalledWith('BTC', '24h', 'upbit');
    });
  });
});
