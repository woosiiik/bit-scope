/**
 * 실시간 가격 저장소 단위 테스트
 *
 * Zustand price store의 가격 업데이트, 연결 상태 관리,
 * 구독 심볼 관리, 셀렉터 동작을 검증한다.
 *
 * @see 요구사항 5.1 (마켓 시세 목록)
 * @see 요구사항 5.2 (실시간 시세 업데이트)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { usePriceStore } from '../price-store';
import type { PriceUpdate, ExchangeType } from '@bitscope/shared';

/** 테스트용 PriceUpdate 생성 헬퍼 */
function createPriceUpdate(
  overrides?: Partial<PriceUpdate>,
): PriceUpdate {
  return {
    exchange: 'upbit',
    symbol: 'BTC',
    price: 55000000,
    changeRate: 2.5,
    volume24h: 1234.56,
    timestamp: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  // 스토어 상태 초기화
  usePriceStore.setState({
    prices: {},
    connectionStatus: 'disconnected',
    isPollingMode: false,
    reconnectAttempts: 0,
    lastError: null,
    subscribedSymbols: [],
  });
});

describe('price-store', () => {
  describe('초기 상태', () => {
    it('기본 상태로 초기화되어야 한다', () => {
      const state = usePriceStore.getState();

      expect(state.prices).toEqual({});
      expect(state.connectionStatus).toBe('disconnected');
      expect(state.isPollingMode).toBe(false);
      expect(state.reconnectAttempts).toBe(0);
      expect(state.lastError).toBeNull();
      expect(state.subscribedSymbols).toEqual([]);
    });
  });

  describe('updatePrice', () => {
    it('단일 시세 업데이트를 저장해야 한다', () => {
      const store = usePriceStore.getState();
      const update = createPriceUpdate();

      store.updatePrice(update);

      const entry = usePriceStore.getState().prices['upbit:BTC'];
      expect(entry).toBeDefined();
      expect(entry!.price).toBe(55000000);
      expect(entry!.exchange).toBe('upbit');
      expect(entry!.symbol).toBe('BTC');
      expect(entry!.changeRate).toBe(2.5);
      expect(entry!.volume24h).toBe(1234.56);
      expect(entry!.receivedAt).toBeGreaterThan(0);
    });

    it('기존 가격을 덮어써야 한다', () => {
      const store = usePriceStore.getState();

      store.updatePrice(createPriceUpdate({ price: 54000000 }));
      store.updatePrice(createPriceUpdate({ price: 56000000 }));

      const entry = usePriceStore.getState().prices['upbit:BTC'];
      expect(entry!.price).toBe(56000000);
    });

    it('다른 거래소+심볼은 독립적으로 저장해야 한다', () => {
      const store = usePriceStore.getState();

      store.updatePrice(createPriceUpdate({ exchange: 'upbit', symbol: 'BTC', price: 55000000 }));
      store.updatePrice(createPriceUpdate({ exchange: 'bithumb', symbol: 'BTC', price: 54500000 }));
      store.updatePrice(createPriceUpdate({ exchange: 'upbit', symbol: 'ETH', price: 3500000 }));

      const state = usePriceStore.getState();
      expect(state.prices['upbit:BTC']!.price).toBe(55000000);
      expect(state.prices['bithumb:BTC']!.price).toBe(54500000);
      expect(state.prices['upbit:ETH']!.price).toBe(3500000);
    });
  });

  describe('updatePrices', () => {
    it('여러 시세를 한번에 업데이트해야 한다', () => {
      const store = usePriceStore.getState();

      store.updatePrices([
        createPriceUpdate({ exchange: 'upbit', symbol: 'BTC', price: 55000000 }),
        createPriceUpdate({ exchange: 'upbit', symbol: 'ETH', price: 3500000 }),
        createPriceUpdate({ exchange: 'bithumb', symbol: 'BTC', price: 54500000 }),
      ]);

      const state = usePriceStore.getState();
      expect(Object.keys(state.prices)).toHaveLength(3);
      expect(state.prices['upbit:BTC']!.price).toBe(55000000);
      expect(state.prices['upbit:ETH']!.price).toBe(3500000);
      expect(state.prices['bithumb:BTC']!.price).toBe(54500000);
    });

    it('빈 배열은 상태를 변경하지 않아야 한다', () => {
      const store = usePriceStore.getState();
      store.updatePrice(createPriceUpdate());

      const pricesBefore = usePriceStore.getState().prices;
      store.updatePrices([]);
      const pricesAfter = usePriceStore.getState().prices;

      // 빈 배열 호출 시 상태 참조가 동일해야 한다 (불필요한 리렌더링 방지)
      expect(pricesAfter).toBe(pricesBefore);
    });
  });

  describe('연결 상태 관리', () => {
    it('setConnectionStatus로 연결 상태를 변경해야 한다', () => {
      const store = usePriceStore.getState();

      store.setConnectionStatus('connecting');
      expect(usePriceStore.getState().connectionStatus).toBe('connecting');

      store.setConnectionStatus('connected');
      expect(usePriceStore.getState().connectionStatus).toBe('connected');

      store.setConnectionStatus('reconnecting');
      expect(usePriceStore.getState().connectionStatus).toBe('reconnecting');

      store.setConnectionStatus('disconnected');
      expect(usePriceStore.getState().connectionStatus).toBe('disconnected');
    });

    it('setPollingMode로 폴링 모드를 설정해야 한다', () => {
      const store = usePriceStore.getState();

      store.setPollingMode(true);
      expect(usePriceStore.getState().isPollingMode).toBe(true);

      store.setPollingMode(false);
      expect(usePriceStore.getState().isPollingMode).toBe(false);
    });

    it('setReconnectAttempts로 재연결 시도 횟수를 설정해야 한다', () => {
      const store = usePriceStore.getState();

      store.setReconnectAttempts(3);
      expect(usePriceStore.getState().reconnectAttempts).toBe(3);
    });

    it('setLastError로 마지막 오류를 설정해야 한다', () => {
      const store = usePriceStore.getState();

      store.setLastError('연결 오류 발생');
      expect(usePriceStore.getState().lastError).toBe('연결 오류 발생');

      store.setLastError(null);
      expect(usePriceStore.getState().lastError).toBeNull();
    });
  });

  describe('구독 심볼 관리', () => {
    it('setSubscribedSymbols로 구독 심볼을 설정해야 한다', () => {
      const store = usePriceStore.getState();

      store.setSubscribedSymbols(['BTC', 'ETH']);
      expect(usePriceStore.getState().subscribedSymbols).toEqual(['BTC', 'ETH']);
    });

    it('addSubscribedSymbols로 구독 심볼을 추가해야 한다', () => {
      const store = usePriceStore.getState();

      store.setSubscribedSymbols(['BTC']);
      store.addSubscribedSymbols(['ETH', 'XRP']);

      expect(usePriceStore.getState().subscribedSymbols).toEqual(
        expect.arrayContaining(['BTC', 'ETH', 'XRP']),
      );
    });

    it('addSubscribedSymbols는 중복을 제거해야 한다', () => {
      const store = usePriceStore.getState();

      store.setSubscribedSymbols(['BTC', 'ETH']);
      store.addSubscribedSymbols(['ETH', 'XRP']);

      const symbols = usePriceStore.getState().subscribedSymbols;
      expect(symbols).toHaveLength(3);
      expect(symbols).toEqual(expect.arrayContaining(['BTC', 'ETH', 'XRP']));
    });

    it('removeSubscribedSymbols로 구독 심볼을 제거해야 한다', () => {
      const store = usePriceStore.getState();

      store.setSubscribedSymbols(['BTC', 'ETH', 'XRP']);
      store.removeSubscribedSymbols(['ETH']);

      expect(usePriceStore.getState().subscribedSymbols).toEqual(['BTC', 'XRP']);
    });

    it('removeSubscribedSymbols는 존재하지 않는 심볼을 무시해야 한다', () => {
      const store = usePriceStore.getState();

      store.setSubscribedSymbols(['BTC', 'ETH']);
      store.removeSubscribedSymbols(['DOGE']); // 존재하지 않는 심볼

      expect(usePriceStore.getState().subscribedSymbols).toEqual(['BTC', 'ETH']);
    });
  });

  describe('초기화', () => {
    it('resetPrices는 가격 데이터만 초기화해야 한다', () => {
      const store = usePriceStore.getState();

      store.updatePrice(createPriceUpdate());
      store.setConnectionStatus('connected');
      store.setSubscribedSymbols(['BTC']);

      store.resetPrices();

      const state = usePriceStore.getState();
      expect(state.prices).toEqual({});
      // 연결 상태와 구독 심볼은 유지
      expect(state.connectionStatus).toBe('connected');
      expect(state.subscribedSymbols).toEqual(['BTC']);
    });

    it('resetAll은 전체 상태를 초기화해야 한다', () => {
      const store = usePriceStore.getState();

      store.updatePrice(createPriceUpdate());
      store.setConnectionStatus('connected');
      store.setPollingMode(true);
      store.setReconnectAttempts(3);
      store.setLastError('some error');
      store.setSubscribedSymbols(['BTC', 'ETH']);

      store.resetAll();

      const state = usePriceStore.getState();
      expect(state.prices).toEqual({});
      expect(state.connectionStatus).toBe('disconnected');
      expect(state.isPollingMode).toBe(false);
      expect(state.reconnectAttempts).toBe(0);
      expect(state.lastError).toBeNull();
      expect(state.subscribedSymbols).toEqual([]);
    });
  });

  describe('셀렉터', () => {
    beforeEach(() => {
      const store = usePriceStore.getState();
      store.updatePrices([
        createPriceUpdate({ exchange: 'upbit', symbol: 'BTC', price: 55000000 }),
        createPriceUpdate({ exchange: 'bithumb', symbol: 'BTC', price: 54500000 }),
        createPriceUpdate({ exchange: 'coinone', symbol: 'BTC', price: 54800000 }),
        createPriceUpdate({ exchange: 'upbit', symbol: 'ETH', price: 3500000 }),
        createPriceUpdate({ exchange: 'bithumb', symbol: 'ETH', price: 3480000 }),
      ]);
    });

    describe('getPrice', () => {
      it('특정 거래소+심볼의 가격을 반환해야 한다', () => {
        const store = usePriceStore.getState();
        const price = store.getPrice('upbit', 'BTC');

        expect(price).not.toBeNull();
        expect(price!.price).toBe(55000000);
        expect(price!.exchange).toBe('upbit');
        expect(price!.symbol).toBe('BTC');
      });

      it('존재하지 않는 조합에 대해 null을 반환해야 한다', () => {
        const store = usePriceStore.getState();
        const price = store.getPrice('coinone', 'ETH');

        expect(price).toBeNull();
      });
    });

    describe('getPricesBySymbol', () => {
      it('특정 심볼의 모든 거래소 가격을 반환해야 한다', () => {
        const store = usePriceStore.getState();
        const btcPrices = store.getPricesBySymbol('BTC');

        expect(btcPrices).toHaveLength(3);
        const exchanges = btcPrices.map((p) => p.exchange);
        expect(exchanges).toEqual(expect.arrayContaining(['upbit', 'bithumb', 'coinone']));
      });

      it('존재하지 않는 심볼에 대해 빈 배열을 반환해야 한다', () => {
        const store = usePriceStore.getState();
        const prices = store.getPricesBySymbol('DOGE');

        expect(prices).toEqual([]);
      });
    });

    describe('getPricesByExchange', () => {
      it('특정 거래소의 모든 가격을 반환해야 한다', () => {
        const store = usePriceStore.getState();
        const upbitPrices = store.getPricesByExchange('upbit');

        expect(upbitPrices).toHaveLength(2);
        const symbols = upbitPrices.map((p) => p.symbol);
        expect(symbols).toEqual(expect.arrayContaining(['BTC', 'ETH']));
      });

      it('데이터가 없는 거래소에 대해 빈 배열을 반환해야 한다', () => {
        usePriceStore.setState({ prices: {} });
        const store = usePriceStore.getState();
        const prices = store.getPricesByExchange('coinone');

        expect(prices).toEqual([]);
      });
    });

    describe('getIsActive', () => {
      it('WebSocket 연결 시 활성 상태여야 한다', () => {
        usePriceStore.getState().setConnectionStatus('connected');
        expect(usePriceStore.getState().getIsActive()).toBe(true);
      });

      it('폴링 모드 시 활성 상태여야 한다', () => {
        usePriceStore.getState().setPollingMode(true);
        expect(usePriceStore.getState().getIsActive()).toBe(true);
      });

      it('연결도 폴링도 아닌 경우 비활성 상태여야 한다', () => {
        usePriceStore.getState().setConnectionStatus('disconnected');
        usePriceStore.getState().setPollingMode(false);
        expect(usePriceStore.getState().getIsActive()).toBe(false);
      });

      it('재연결 중에는 비활성 상태여야 한다 (폴링이 아닌 한)', () => {
        usePriceStore.getState().setConnectionStatus('reconnecting');
        usePriceStore.getState().setPollingMode(false);
        expect(usePriceStore.getState().getIsActive()).toBe(false);
      });
    });
  });
});
