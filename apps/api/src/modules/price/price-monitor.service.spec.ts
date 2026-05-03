/**
 * PriceMonitorService 단위 테스트
 *
 * 시세 모니터링 서비스의 시작/중지, 가격 맵 관리,
 * 이벤트 발행 등 핵심 로직을 검증한다.
 */

import { EventEmitter2 } from '@nestjs/event-emitter';

import type { PriceUpdate } from '@bitscope/shared';

import { PriceMonitorService, PRICE_EVENTS } from './price-monitor.service';
import type { PriceEntry } from './price-monitor.service';
import { UpbitWsClient } from './exchange-ws/upbit-ws.client';
import { BithumbWsClient } from './exchange-ws/bithumb-ws.client';
import { CoinonePollingClient } from './exchange-ws/coinone-polling.client';
import { BinancePollingClient } from './exchange-ws/binance-polling.client';

// 거래소 클라이언트 모킹
jest.mock('./exchange-ws/upbit-ws.client');
jest.mock('./exchange-ws/bithumb-ws.client');
jest.mock('./exchange-ws/coinone-polling.client');
jest.mock('./exchange-ws/binance-polling.client');

describe('PriceMonitorService', () => {
  let service: PriceMonitorService;
  let eventEmitter: EventEmitter2;
  let upbitClient: jest.Mocked<UpbitWsClient>;
  let bithumbClient: jest.Mocked<BithumbWsClient>;
  let coinoneClient: jest.Mocked<CoinonePollingClient>;
  let binanceClient: jest.Mocked<BinancePollingClient>;

  /** priceUpdate 이벤트 핸들러 맵 (클라이언트별) */
  const eventHandlers: Map<string, Map<string, ((...args: unknown[]) => void)[]>> = new Map();

  beforeEach(() => {
    eventEmitter = new EventEmitter2();
    eventHandlers.clear();

    // 각 클라이언트의 on/removeAllListeners를 이벤트 핸들러 맵으로 구현
    const createMockClient = (name: string, exchangeType: string) => {
      const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
      eventHandlers.set(name, handlers);

      return {
        getExchangeType: jest.fn().mockReturnValue(exchangeType),
        start: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
        subscribe: jest.fn(),
        unsubscribe: jest.fn(),
        isConnected: jest.fn().mockReturnValue(true),
        on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
          if (!handlers.has(event)) {
            handlers.set(event, []);
          }
          handlers.get(event)!.push(handler);
        }),
        removeAllListeners: jest.fn(() => {
          handlers.clear();
        }),
        emit: jest.fn((event: string, ...args: unknown[]) => {
          const fns = handlers.get(event) || [];
          for (const fn of fns) {
            fn(...args);
          }
        }),
      };
    };

    upbitClient = createMockClient('upbit', 'upbit') as unknown as jest.Mocked<UpbitWsClient>;
    bithumbClient = createMockClient('bithumb', 'bithumb') as unknown as jest.Mocked<BithumbWsClient>;
    coinoneClient = createMockClient('coinone', 'coinone') as unknown as jest.Mocked<CoinonePollingClient>;
    binanceClient = {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(),
      getPrice: jest.fn().mockReturnValue(null),
      getAllPrices: jest.fn().mockReturnValue(new Map()),
      isActive: jest.fn().mockReturnValue(false),
      onModuleDestroy: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<BinancePollingClient>;

    service = new PriceMonitorService(
      eventEmitter,
      upbitClient,
      bithumbClient,
      coinoneClient,
      binanceClient,
    );
  });

  afterEach(async () => {
    await service.stopMonitoring();
  });

  describe('startMonitoring', () => {
    it('모든 거래소 클라이언트의 start를 호출해야 한다', async () => {
      await service.startMonitoring();

      expect(upbitClient.start).toHaveBeenCalledTimes(1);
      expect(bithumbClient.start).toHaveBeenCalledTimes(1);
      expect(coinoneClient.start).toHaveBeenCalledTimes(1);
    });

    it('주요 코인 심볼로 시작해야 한다', async () => {
      await service.startMonitoring();

      const upbitArgs = upbitClient.start.mock.calls[0]?.[0] as string[] | undefined;
      expect(upbitArgs).toContain('BTC');
      expect(upbitArgs).toContain('ETH');
    });

    it('isActive()가 true를 반환해야 한다', async () => {
      expect(service.isActive()).toBe(false);
      await service.startMonitoring();
      expect(service.isActive()).toBe(true);
    });

    it('MONITORING_STARTED 이벤트를 발행해야 한다', async () => {
      const handler = jest.fn();
      eventEmitter.on(PRICE_EVENTS.MONITORING_STARTED, handler);

      await service.startMonitoring();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('이미 모니터링 중이면 중복 시작하지 않아야 한다', async () => {
      await service.startMonitoring();
      await service.startMonitoring();

      // 각 클라이언트의 start는 1번만 호출
      expect(upbitClient.start).toHaveBeenCalledTimes(1);
    });

    it('개별 거래소 시작 실패 시 나머지는 정상 시작해야 한다', async () => {
      upbitClient.start.mockRejectedValue(new Error('업비트 연결 실패'));

      await service.startMonitoring();

      // 업비트 실패에도 모니터링은 활성
      expect(service.isActive()).toBe(true);
      expect(bithumbClient.start).toHaveBeenCalledTimes(1);
      expect(coinoneClient.start).toHaveBeenCalledTimes(1);
    });
  });

  describe('stopMonitoring', () => {
    it('모든 거래소 클라이언트의 stop을 호출해야 한다', async () => {
      await service.startMonitoring();
      await service.stopMonitoring();

      expect(upbitClient.stop).toHaveBeenCalledTimes(1);
      expect(bithumbClient.stop).toHaveBeenCalledTimes(1);
      expect(coinoneClient.stop).toHaveBeenCalledTimes(1);
    });

    it('isActive()가 false를 반환해야 한다', async () => {
      await service.startMonitoring();
      await service.stopMonitoring();

      expect(service.isActive()).toBe(false);
    });

    it('MONITORING_STOPPED 이벤트를 발행해야 한다', async () => {
      const handler = jest.fn();
      eventEmitter.on(PRICE_EVENTS.MONITORING_STOPPED, handler);

      await service.startMonitoring();
      await service.stopMonitoring();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('모니터링이 비활성인 상태에서 호출해도 오류가 없어야 한다', async () => {
      // 시작하지 않고 중지 호출 - 오류 없어야 함
      await expect(service.stopMonitoring()).resolves.not.toThrow();
    });

    it('이벤트 핸들러를 제거해야 한다', async () => {
      await service.startMonitoring();
      await service.stopMonitoring();

      expect(upbitClient.removeAllListeners).toHaveBeenCalled();
      expect(bithumbClient.removeAllListeners).toHaveBeenCalled();
      expect(coinoneClient.removeAllListeners).toHaveBeenCalled();
    });
  });

  describe('handlePriceUpdate (가격 맵 관리)', () => {
    it('시세 업데이트를 수신하면 가격 맵을 업데이트해야 한다', async () => {
      await service.startMonitoring();

      // 업비트 클라이언트의 priceUpdate 이벤트 핸들러를 수동 실행
      const priceUpdate: PriceUpdate = {
        exchange: 'upbit',
        symbol: 'BTC',
        price: 100000000,
        changeRate: 1.5,
        volume24h: 1234.56,
        timestamp: Date.now(),
      };

      // on('priceUpdate', handler)로 등록된 핸들러를 직접 호출
      const handlers = eventHandlers.get('upbit')?.get('priceUpdate') ?? [];
      for (const handler of handlers) {
        handler(priceUpdate);
      }

      const entry = service.getCurrentPrice('upbit', 'BTC');
      expect(entry).not.toBeNull();
      expect(entry?.exchange).toBe('upbit');
      expect(entry?.symbol).toBe('BTC');
      expect(entry?.price).toBe(100000000);
      expect(entry?.changeRate).toBe(1.5);
      expect(entry?.volume24h).toBe(1234.56);
    });

    it('시세 업데이트 시 PRICE_UPDATE 이벤트를 발행해야 한다', async () => {
      await service.startMonitoring();

      const eventHandler = jest.fn();
      eventEmitter.on(PRICE_EVENTS.PRICE_UPDATE, eventHandler);

      const priceUpdate: PriceUpdate = {
        exchange: 'bithumb',
        symbol: 'ETH',
        price: 5000000,
        changeRate: -2.0,
        volume24h: 5678.9,
        timestamp: Date.now(),
      };

      const handlers = eventHandlers.get('bithumb')?.get('priceUpdate') || [];
      for (const handler of handlers) {
        handler(priceUpdate);
      }

      expect(eventHandler).toHaveBeenCalledTimes(1);
      expect(eventHandler).toHaveBeenCalledWith(priceUpdate);
    });

    it('동일 거래소+심볼의 업데이트는 가격 맵을 덮어써야 한다', async () => {
      await service.startMonitoring();

      const handlers = eventHandlers.get('upbit')?.get('priceUpdate') || [];

      // 첫 번째 업데이트
      handlers.forEach((h) =>
        h({
          exchange: 'upbit',
          symbol: 'BTC',
          price: 100000000,
          changeRate: 1.0,
          volume24h: 100,
          timestamp: 1000,
        }),
      );

      // 두 번째 업데이트 (가격 변경)
      handlers.forEach((h) =>
        h({
          exchange: 'upbit',
          symbol: 'BTC',
          price: 101000000,
          changeRate: 2.0,
          volume24h: 200,
          timestamp: 2000,
        }),
      );

      const entry = service.getCurrentPrice('upbit', 'BTC');
      expect(entry!.price).toBe(101000000);
      expect(entry!.changeRate).toBe(2.0);
    });
  });

  describe('getCurrentPrice', () => {
    it('존재하지 않는 가격 키에 대해 null을 반환해야 한다', () => {
      const result = service.getCurrentPrice('upbit', 'NONEXISTENT');
      expect(result).toBeNull();
    });
  });

  describe('getAllPrices', () => {
    it('모든 가격 데이터를 반환해야 한다', async () => {
      await service.startMonitoring();

      const upbitHandlers = eventHandlers.get('upbit')?.get('priceUpdate') || [];
      const bithumbHandlers = eventHandlers.get('bithumb')?.get('priceUpdate') || [];

      upbitHandlers.forEach((h) =>
        h({
          exchange: 'upbit',
          symbol: 'BTC',
          price: 100000000,
          changeRate: 1.0,
          volume24h: 100,
          timestamp: Date.now(),
        }),
      );

      bithumbHandlers.forEach((h) =>
        h({
          exchange: 'bithumb',
          symbol: 'BTC',
          price: 99800000,
          changeRate: 0.8,
          volume24h: 80,
          timestamp: Date.now(),
        }),
      );

      const allPrices = service.getAllPrices();
      expect(allPrices.size).toBe(2);
      expect(allPrices.has('upbit:BTC')).toBe(true);
      expect(allPrices.has('bithumb:BTC')).toBe(true);
    });
  });

  describe('getPricesBySymbol', () => {
    it('특정 심볼의 모든 거래소 가격을 반환해야 한다', async () => {
      await service.startMonitoring();

      const upbitHandlers = eventHandlers.get('upbit')?.get('priceUpdate') || [];
      const bithumbHandlers = eventHandlers.get('bithumb')?.get('priceUpdate') || [];
      const coinoneHandlers = eventHandlers.get('coinone')?.get('priceUpdate') || [];

      upbitHandlers.forEach((h) =>
        h({
          exchange: 'upbit',
          symbol: 'BTC',
          price: 100000000,
          changeRate: 1.0,
          volume24h: 100,
          timestamp: Date.now(),
        }),
      );

      bithumbHandlers.forEach((h) =>
        h({
          exchange: 'bithumb',
          symbol: 'BTC',
          price: 99800000,
          changeRate: 0.8,
          volume24h: 80,
          timestamp: Date.now(),
        }),
      );

      coinoneHandlers.forEach((h) =>
        h({
          exchange: 'coinone',
          symbol: 'ETH',
          price: 5000000,
          changeRate: -1.0,
          volume24h: 50,
          timestamp: Date.now(),
        }),
      );

      const btcPrices = service.getPricesBySymbol('BTC');
      expect(btcPrices).toHaveLength(2);
      expect(btcPrices.map((p) => p.exchange)).toContain('upbit');
      expect(btcPrices.map((p) => p.exchange)).toContain('bithumb');

      const ethPrices = service.getPricesBySymbol('ETH');
      expect(ethPrices).toHaveLength(1);
      expect(ethPrices[0]?.exchange).toBe('coinone');
    });
  });

  describe('subscribeToSymbols', () => {
    it('모든 거래소 클라이언트에 심볼 구독을 추가해야 한다', async () => {
      await service.startMonitoring();

      service.subscribeToSymbols(['SHIB', 'SAND']);

      expect(upbitClient.subscribe).toHaveBeenCalledWith(['SHIB', 'SAND']);
      expect(bithumbClient.subscribe).toHaveBeenCalledWith(['SHIB', 'SAND']);
      expect(coinoneClient.subscribe).toHaveBeenCalledWith(['SHIB', 'SAND']);
    });
  });

  describe('unsubscribeFromSymbols', () => {
    it('모든 거래소 클라이언트에서 심볼 구독을 해제해야 한다', async () => {
      await service.startMonitoring();

      // 먼저 데이터를 채운다
      const upbitHandlers = eventHandlers.get('upbit')?.get('priceUpdate') || [];
      upbitHandlers.forEach((h) =>
        h({
          exchange: 'upbit',
          symbol: 'BTC',
          price: 100000000,
          changeRate: 1.0,
          volume24h: 100,
          timestamp: Date.now(),
        }),
      );

      service.unsubscribeFromSymbols(['BTC']);

      expect(upbitClient.unsubscribe).toHaveBeenCalledWith(['BTC']);
      expect(bithumbClient.unsubscribe).toHaveBeenCalledWith(['BTC']);
      expect(coinoneClient.unsubscribe).toHaveBeenCalledWith(['BTC']);

      // 가격 맵에서도 제거되어야 한다
      expect(service.getCurrentPrice('upbit', 'BTC')).toBeNull();
    });
  });
});
