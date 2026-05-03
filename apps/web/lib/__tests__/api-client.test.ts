/**
 * ExchangeApiClient 단위 테스트
 *
 * 거래소 API 클라이언트의 각 함수를 테스트한다.
 * - 서명 생성 -> Route Handler 호출 -> 응답 처리 파이프라인
 * - 병렬 API 호출 (다중 거래소 동시 조회)
 * - 오류 처리 (파싱 오류, API 오류, 빈 응답 등)
 *
 * @see 요구사항 2.4, 2.5, 2.11, NF1.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchBalance,
  fetchTicker,
  fetchOrderbook,
  fetchOrderHistory,
  fetchBalancesInParallel,
  fetchTickersInParallel,
  signBalanceRequest,
  signOrderHistoryRequest,
  ExchangeApiError,
  type BalanceResponse,
  type TickerResponse,
  type OrderbookResponse,
  type OrderHistoryResponse,
} from '../api-client';

// 전역 fetch를 모킹한다.
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// createSigner를 모킹한다.
vi.mock('../exchange/signer-factory', () => ({
  createSigner: vi.fn((exchange: string) => ({
    signRequest: vi.fn((params: Record<string, unknown>) => ({
      url: `https://api.${exchange}.com/${params.endpoint}`,
      method: params.method,
      headers: { Authorization: `Bearer test-token-${exchange}` },
      body: undefined,
    })),
    validateApiKey: vi.fn().mockResolvedValue({ isValid: true, isReadOnly: true }),
    getExchangeType: vi.fn(() => exchange),
  })),
}));

/** 성공 응답을 생성하는 헬퍼 */
function createSuccessResponse<T>(data: T): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true, data, cached: false, stale: false, dataTimestamp: Date.now() }),
  } as unknown as Response;
}

/** 오류 응답을 생성하는 헬퍼 */
function createErrorResponse(code: string, message: string, statusCode: number = 502): Response {
  return {
    ok: false,
    status: statusCode,
    json: () => Promise.resolve({ success: false, error: { code, message, statusCode } }),
  } as unknown as Response;
}

/** 파싱 불가 응답을 생성하는 헬퍼 */
function createUnparsableResponse(): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.reject(new Error('Invalid JSON')),
  } as unknown as Response;
}

/** 테스트용 API Key */
const TEST_API_KEY = {
  accessKey: 'test-access-key',
  secretKey: 'test-secret-key',
};

/** 테스트용 잔고 응답 */
const MOCK_BALANCE_RESPONSE: BalanceResponse = {
  exchange: 'upbit',
  holdings: [
    {
      exchange: 'upbit',
      symbol: 'BTC',
      currency: 'KRW',
      balance: 0.5,
      lockedBalance: 0,
      avgBuyPrice: 50000000,
      currentPrice: 55000000,
      evaluationAmount: 27500000,
      profitLoss: 2500000,
      profitLossRate: 10,
    },
  ],
  krwBalance: 1000000,
  timestamp: Date.now(),
};

/** 테스트용 시세 응답 */
const MOCK_TICKER_RESPONSE: TickerResponse = {
  exchange: 'upbit',
  tickers: [
    {
      exchange: 'upbit',
      symbol: 'BTC',
      currentPrice: 55000000,
      openPrice: 54000000,
      highPrice: 56000000,
      lowPrice: 53000000,
      prevClosePrice: 54500000,
      changeRate: 1.85,
      changePrice: 1000000,
      volume24h: 1234.5,
      volumeAmount24h: 67890000000,
      timestamp: Date.now(),
    },
  ],
  timestamp: Date.now(),
};

/** 테스트용 호가 응답 */
const MOCK_ORDERBOOK_RESPONSE: OrderbookResponse = {
  exchange: 'upbit',
  orderbook: {
    exchange: 'upbit',
    symbol: 'BTC',
    asks: [{ price: 55100000, quantity: 0.1 }],
    bids: [{ price: 54900000, quantity: 0.2 }],
    timestamp: Date.now(),
  },
  timestamp: Date.now(),
};

/** 테스트용 주문 내역 응답 */
const MOCK_ORDER_HISTORY_RESPONSE: OrderHistoryResponse = {
  exchange: 'upbit',
  orders: [
    {
      orderId: 'order-001',
      symbol: 'BTC',
      side: 'buy',
      price: 50000000,
      quantity: 0.5,
      executedQuantity: 0.5,
      status: 'filled',
      orderedAt: new Date('2024-01-01T00:00:00Z'),
    },
  ],
  timestamp: Date.now(),
};

describe('ExchangeApiClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===== signBalanceRequest =====
  describe('signBalanceRequest', () => {
    it('거래소별 서명기를 통해 잔고 조회 서명을 생성한다', () => {
      const signed = signBalanceRequest('upbit', TEST_API_KEY);

      expect(signed).toBeDefined();
      expect(signed.url).toContain('upbit');
      expect(signed.method).toBe('GET');
      expect(signed.headers).toBeDefined();
      expect(signed.headers.Authorization).toContain('test-token-upbit');
    });

    it('빗썸 거래소에 대해 올바른 서명을 생성한다', () => {
      const signed = signBalanceRequest('bithumb', TEST_API_KEY);

      expect(signed.url).toContain('bithumb');
      expect(signed.headers.Authorization).toContain('test-token-bithumb');
    });

    it('코인원 거래소에 대해 올바른 서명을 생성한다', () => {
      const signed = signBalanceRequest('coinone', TEST_API_KEY);

      expect(signed.url).toContain('coinone');
      expect(signed.headers.Authorization).toContain('test-token-coinone');
    });
  });

  // ===== signOrderHistoryRequest =====
  describe('signOrderHistoryRequest', () => {
    it('파라미터 없이 주문 내역 서명을 생성한다', () => {
      const signed = signOrderHistoryRequest('upbit', TEST_API_KEY);

      expect(signed).toBeDefined();
      expect(signed.url).toContain('upbit');
    });

    it('심볼 파라미터와 함께 서명을 생성한다', () => {
      const signed = signOrderHistoryRequest('upbit', TEST_API_KEY, { symbol: 'BTC' });

      expect(signed).toBeDefined();
      expect(signed.url).toContain('upbit');
    });
  });

  // ===== fetchBalance =====
  describe('fetchBalance', () => {
    it('서명된 요청을 Route Handler에 전달하고 정규화된 잔고 데이터를 반환한다', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse(MOCK_BALANCE_RESPONSE));

      const result = await fetchBalance('upbit', TEST_API_KEY);

      // fetch가 올바른 URL로 호출되었는지 확인
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      const [url, options] = callArgs;
      expect(url).toBe('/api/exchange/upbit/balance');
      expect(options.method).toBe('POST');
      expect((options.headers as Record<string, string>)['Content-Type']).toBe('application/json');

      // 응답 데이터가 올바른지 확인
      expect(result.exchange).toBe('upbit');
      expect(result.holdings).toHaveLength(1);
      expect(result.holdings[0]!.symbol).toBe('BTC');
      expect(result.krwBalance).toBe(1000000);
    });

    it('API 호출 실패 시 ExchangeApiError를 발생시킨다', async () => {
      mockFetch.mockResolvedValueOnce(
        createErrorResponse('AUTH_ERROR', 'API 키가 유효하지 않습니다.', 401),
      );

      try {
        await fetchBalance('upbit', TEST_API_KEY);
        // 여기에 도달하면 안 됨
        expect.unreachable('ExchangeApiError가 발생해야 합니다.');
      } catch (error) {
        expect(error).toBeInstanceOf(ExchangeApiError);
        const apiError = error as ExchangeApiError;
        expect(apiError.code).toBe('AUTH_ERROR');
        expect(apiError.exchange).toBe('upbit');
      }
    });

    it('응답 파싱 실패 시 ExchangeApiError를 발생시킨다', async () => {
      mockFetch.mockResolvedValueOnce(createUnparsableResponse());

      try {
        await fetchBalance('upbit', TEST_API_KEY);
        expect.unreachable('ExchangeApiError가 발생해야 합니다.');
      } catch (error) {
        expect(error).toBeInstanceOf(ExchangeApiError);
        const apiError = error as ExchangeApiError;
        expect(apiError.code).toBe('PARSE_ERROR');
        expect(apiError.exchange).toBe('upbit');
      }
    });

    it('빈 응답 데이터 시 ExchangeApiError를 발생시킨다', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: null }),
      } as unknown as Response);

      try {
        await fetchBalance('upbit', TEST_API_KEY);
        expect.unreachable('ExchangeApiError가 발생해야 합니다.');
      } catch (error) {
        expect(error).toBeInstanceOf(ExchangeApiError);
        const apiError = error as ExchangeApiError;
        expect(apiError.code).toBe('EMPTY_RESPONSE');
      }
    });
  });

  // ===== fetchTicker =====
  describe('fetchTicker', () => {
    it('공개 시세 API를 GET으로 조회한다', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse(MOCK_TICKER_RESPONSE));

      const result = await fetchTicker('upbit', ['BTC', 'ETH']);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const tickerCallArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(tickerCallArgs[0]).toContain('/api/exchange/upbit/ticker');
      expect(tickerCallArgs[0]).toContain('symbols=BTC%2CETH');
      expect(tickerCallArgs[1].method).toBe('GET');

      expect(result.exchange).toBe('upbit');
      expect(result.tickers).toHaveLength(1);
    });

    it('심볼 미지정 시 기본 시세를 조회한다', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse(MOCK_TICKER_RESPONSE));

      await fetchTicker('upbit');

      const tickerNoSymbolArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(tickerNoSymbolArgs[0]).toBe('/api/exchange/upbit/ticker');
      expect(tickerNoSymbolArgs[0]).not.toContain('symbols=');
    });

    it('시세 API 실패 시 ExchangeApiError를 발생시킨다', async () => {
      mockFetch.mockResolvedValueOnce(
        createErrorResponse('SERVER_ERROR', '거래소 서버 오류', 502),
      );

      await expect(fetchTicker('upbit')).rejects.toThrow(ExchangeApiError);
    });
  });

  // ===== fetchOrderbook =====
  describe('fetchOrderbook', () => {
    it('공개 호가 API를 GET으로 조회한다', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse(MOCK_ORDERBOOK_RESPONSE));

      const result = await fetchOrderbook('upbit', 'BTC');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const orderbookCallArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(orderbookCallArgs[0]).toContain('/api/exchange/upbit/orderbook');
      expect(orderbookCallArgs[0]).toContain('symbol=BTC');
      expect(orderbookCallArgs[1].method).toBe('GET');

      expect(result.exchange).toBe('upbit');
      expect(result.orderbook.symbol).toBe('BTC');
    });

    it('호가 API 실패 시 ExchangeApiError를 발생시킨다', async () => {
      mockFetch.mockResolvedValueOnce(
        createErrorResponse('SERVER_ERROR', '거래소 서버 오류', 502),
      );

      await expect(fetchOrderbook('upbit', 'BTC')).rejects.toThrow(ExchangeApiError);
    });
  });

  // ===== fetchOrderHistory =====
  describe('fetchOrderHistory', () => {
    it('서명된 요청으로 주문 내역을 조회한다', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse(MOCK_ORDER_HISTORY_RESPONSE));

      const result = await fetchOrderHistory('upbit', TEST_API_KEY);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(callArgs[0]).toBe('/api/exchange/upbit/orders');
      expect(callArgs[1].method).toBe('POST');

      expect(result.exchange).toBe('upbit');
      expect(result.orders).toHaveLength(1);
      expect(result.orders[0]!.symbol).toBe('BTC');
    });

    it('파라미터를 포함하여 주문 내역을 조회한다', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse(MOCK_ORDER_HISTORY_RESPONSE));

      await fetchOrderHistory('upbit', TEST_API_KEY, { symbol: 'ETH', limit: 10 });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('주문 내역 API 실패 시 ExchangeApiError를 발생시킨다', async () => {
      mockFetch.mockResolvedValueOnce(
        createErrorResponse('AUTH_ERROR', '인증 실패', 401),
      );

      await expect(fetchOrderHistory('upbit', TEST_API_KEY)).rejects.toThrow(
        ExchangeApiError,
      );
    });
  });

  // ===== fetchBalancesInParallel =====
  describe('fetchBalancesInParallel', () => {
    it('여러 거래소의 잔고를 병렬로 조회한다', async () => {
      const upbitBalance: BalanceResponse = { ...MOCK_BALANCE_RESPONSE, exchange: 'upbit' };
      const bithumbBalance: BalanceResponse = {
        exchange: 'bithumb',
        holdings: [
          {
            exchange: 'bithumb',
            symbol: 'ETH',
            currency: 'KRW',
            balance: 10,
            lockedBalance: 0,
            avgBuyPrice: 2000000,
            currentPrice: 2200000,
            evaluationAmount: 22000000,
            profitLoss: 2000000,
            profitLossRate: 10,
          },
        ],
        krwBalance: 500000,
        timestamp: Date.now(),
      };

      mockFetch
        .mockResolvedValueOnce(createSuccessResponse(upbitBalance))
        .mockResolvedValueOnce(createSuccessResponse(bithumbBalance));

      const results = await fetchBalancesInParallel({
        upbit: TEST_API_KEY,
        bithumb: TEST_API_KEY,
      });

      // 두 거래소 모두 성공
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.status === 'success')).toBe(true);
      expect(results.every((r) => r.data !== null)).toBe(true);
      expect(results.every((r) => r.error === null)).toBe(true);
    });

    it('일부 거래소 실패 시 나머지는 정상적으로 반환한다 (Graceful Degradation)', async () => {
      const upbitBalance: BalanceResponse = { ...MOCK_BALANCE_RESPONSE, exchange: 'upbit' };

      mockFetch
        .mockResolvedValueOnce(createSuccessResponse(upbitBalance))
        .mockResolvedValueOnce(
          createErrorResponse('SERVER_ERROR', '빗썸 서버 오류', 502),
        );

      const results = await fetchBalancesInParallel({
        upbit: TEST_API_KEY,
        bithumb: TEST_API_KEY,
      });

      expect(results).toHaveLength(2);

      // 업비트: 성공
      const upbitResult = results.find((r) => r.exchange === 'upbit');
      expect(upbitResult?.status).toBe('success');
      expect(upbitResult?.data).toBeDefined();
      expect(upbitResult?.error).toBeNull();

      // 빗썸: 실패
      const bithumbResult = results.find((r) => r.exchange === 'bithumb');
      expect(bithumbResult?.status).toBe('error');
      expect(bithumbResult?.data).toBeNull();
      expect(bithumbResult?.error).toBeInstanceOf(ExchangeApiError);
    });

    it('빈 거래소 목록에 대해 빈 배열을 반환한다', async () => {
      const results = await fetchBalancesInParallel({});

      expect(results).toHaveLength(0);
    });

    it('모든 거래소가 실패해도 결과를 반환한다', async () => {
      mockFetch
        .mockResolvedValueOnce(
          createErrorResponse('SERVER_ERROR', '업비트 서버 오류', 502),
        )
        .mockResolvedValueOnce(
          createErrorResponse('SERVER_ERROR', '빗썸 서버 오류', 502),
        );

      const results = await fetchBalancesInParallel({
        upbit: TEST_API_KEY,
        bithumb: TEST_API_KEY,
      });

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.status === 'error')).toBe(true);
      expect(results.every((r) => r.error !== null)).toBe(true);
    });
  });

  // ===== fetchTickersInParallel =====
  describe('fetchTickersInParallel', () => {
    it('여러 거래소의 시세를 병렬로 조회한다', async () => {
      const upbitTicker: TickerResponse = { ...MOCK_TICKER_RESPONSE, exchange: 'upbit' };
      const bithumbTicker: TickerResponse = { ...MOCK_TICKER_RESPONSE, exchange: 'bithumb' };

      mockFetch
        .mockResolvedValueOnce(createSuccessResponse(upbitTicker))
        .mockResolvedValueOnce(createSuccessResponse(bithumbTicker));

      const results = await fetchTickersInParallel(['upbit', 'bithumb'], ['BTC']);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.status === 'success')).toBe(true);
    });

    it('빈 거래소 목록에 대해 빈 배열을 반환한다', async () => {
      const results = await fetchTickersInParallel([]);

      expect(results).toHaveLength(0);
    });

    it('일부 거래소 실패 시 나머지는 정상적으로 반환한다', async () => {
      mockFetch
        .mockResolvedValueOnce(createSuccessResponse(MOCK_TICKER_RESPONSE))
        .mockResolvedValueOnce(
          createErrorResponse('TIMEOUT', '요청 시간 초과', 408),
        );

      const results = await fetchTickersInParallel(['upbit', 'bithumb']);

      expect(results).toHaveLength(2);

      const successResult = results.find((r) => r.status === 'success');
      expect(successResult).toBeDefined();

      const errorResult = results.find((r) => r.status === 'error');
      expect(errorResult).toBeDefined();
      expect(errorResult?.error).toBeInstanceOf(ExchangeApiError);
    });
  });

  // ===== ExchangeApiError =====
  describe('ExchangeApiError', () => {
    it('오류 코드, 거래소, 상태 코드를 올바르게 보관한다', () => {
      const error = new ExchangeApiError('테스트 오류', 'TEST_ERROR', 'upbit', 500);

      expect(error.message).toBe('테스트 오류');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.exchange).toBe('upbit');
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe('ExchangeApiError');
      expect(error instanceof Error).toBe(true);
    });

    it('상태 코드 없이도 생성 가능하다', () => {
      const error = new ExchangeApiError('테스트 오류', 'TEST_ERROR', 'bithumb');

      expect(error.statusCode).toBeUndefined();
      expect(error.exchange).toBe('bithumb');
    });
  });
});
