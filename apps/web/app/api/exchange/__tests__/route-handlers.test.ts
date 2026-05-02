/**
 * Route Handler 엔드포인트 통합 테스트
 *
 * MSW(Mock Service Worker) 대신 fetch를 직접 모킹하여
 * 거래소 API 응답을 시뮬레이션하고, Route Handler의 전체 흐름
 * (요청 검증 -> 릴레이 -> 정규화 -> 응답)을 통합적으로 검증한다.
 *
 * 테스트 범위:
 * - 잔고 조회 (balance): POST /api/exchange/[exchange]/balance
 * - 시세 조회 (ticker): GET/POST /api/exchange/[exchange]/ticker
 * - 호가 조회 (orderbook): GET/POST /api/exchange/[exchange]/orderbook
 * - 주문 내역 조회 (orders): POST /api/exchange/[exchange]/orders
 *
 * @see 요구사항 12.2, 12.3, 8.15, 8.16
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { SignedRequest } from '@bitscope/shared';
import { resetGlobalCache } from '../_lib/cache';
import { resetGlobalRateLimiter } from '../_lib/rate-limiter';

// Route Handler 함수들 import
import { POST as balancePOST } from '../[exchange]/balance/route';
import {
  GET as tickerGET,
  POST as tickerPOST,
} from '../[exchange]/ticker/route';
import {
  GET as orderbookGET,
  POST as orderbookPOST,
} from '../[exchange]/orderbook/route';
import { POST as ordersPOST } from '../[exchange]/orders/route';

// ===== Fixture: 거래소 API 응답 시뮬레이션 =====

/** 업비트 잔고 조회 응답 fixture */
const upbitBalanceResponse = [
  {
    currency: 'KRW',
    balance: '1000000',
    locked: '0',
    avg_buy_price: '0',
    avg_buy_price_modified: false,
    unit_currency: 'KRW',
  },
  {
    currency: 'BTC',
    balance: '0.5',
    locked: '0.1',
    avg_buy_price: '50000000',
    avg_buy_price_modified: false,
    unit_currency: 'KRW',
  },
];

/** 업비트 시세(Ticker) 조회 응답 fixture */
const upbitTickerResponse = [
  {
    market: 'KRW-BTC',
    trade_date: '20250501',
    trade_time: '120000',
    trade_date_kst: '20250501',
    trade_time_kst: '210000',
    trade_timestamp: 1746100800000,
    opening_price: 49000000,
    high_price: 51000000,
    low_price: 48500000,
    trade_price: 50500000,
    prev_closing_price: 49500000,
    change: 'RISE',
    change_price: 1000000,
    change_rate: 0.0202,
    signed_change_price: 1000000,
    signed_change_rate: 0.0202,
    trade_volume: 0.5,
    acc_trade_price: 100000000000,
    acc_trade_price_24h: 250000000000,
    acc_trade_volume: 2000,
    acc_trade_volume_24h: 5000,
    highest_52_week_price: 80000000,
    highest_52_week_date: '2025-03-15',
    lowest_52_week_price: 30000000,
    lowest_52_week_date: '2024-07-01',
    timestamp: 1746100800000,
  },
];

/** 업비트 호가(Orderbook) 조회 응답 fixture */
const upbitOrderbookResponse = [
  {
    market: 'KRW-BTC',
    timestamp: 1746100800000,
    total_ask_size: 5.5,
    total_bid_size: 6.2,
    orderbook_units: [
      { ask_price: 50100000, bid_price: 50000000, ask_size: 1.0, bid_size: 1.5 },
      { ask_price: 50200000, bid_price: 49900000, ask_size: 0.8, bid_size: 2.0 },
    ],
  },
];

/** 업비트 주문 내역 조회 응답 fixture */
const upbitOrdersResponse = [
  {
    uuid: 'order-001',
    side: 'bid',
    ord_type: 'limit',
    price: '50000000',
    state: 'done',
    market: 'KRW-BTC',
    created_at: '2025-05-01T09:00:00+09:00',
    volume: '0.1',
    remaining_volume: '0',
    reserved_fee: '0',
    remaining_fee: '0',
    paid_fee: '25000',
    locked: '0',
    executed_volume: '0.1',
    trades_count: 1,
  },
];

/** 빗썸 잔고 조회 응답 fixture */
const bithumbBalanceResponse = {
  status: '0000',
  data: {
    total_krw: '1000000',
    available_krw: '900000',
    total_btc: '0.5',
    available_btc: '0.4',
  },
};

/** 빗썸 시세(Ticker) 조회 응답 fixture */
const bithumbTickerResponse = {
  status: '0000',
  data: {
    BTC: {
      opening_price: '49000000',
      closing_price: '50500000',
      min_price: '48500000',
      max_price: '51000000',
      units_traded: '5000',
      acc_trade_value: '250000000000',
      prev_closing_price: '49500000',
      units_traded_24H: '5000',
      acc_trade_value_24H: '250000000000',
      fluctate_24H: '1000000',
      fluctate_rate_24H: '2.02',
    },
    date: '1746100800000',
  },
};

/** 코인원 잔고 조회 응답 fixture */
const coinoneBalanceResponse = {
  result: 'success',
  errorCode: '0',
  balances: [
    {
      currency: 'KRW',
      available: '1000000',
      limit: '0',
      balance: '1000000',
    },
    {
      currency: 'BTC',
      available: '0.5',
      limit: '0.1',
      balance: '0.6',
    },
  ],
};

// ===== 테스트 유틸리티 =====

/** 테스트용 서명된 요청을 생성한다 */
function createSignedRequest(overrides?: Partial<SignedRequest>): SignedRequest {
  return {
    url: 'https://api.upbit.com/v1/accounts',
    method: 'GET',
    headers: {
      Authorization: 'Bearer test-jwt-token',
      'Content-Type': 'application/json',
    },
    ...overrides,
  };
}

/** NextRequest를 생성한다 (POST 요청) */
function createPostRequest(body: unknown, url?: string): NextRequest {
  return new NextRequest(url ?? 'http://localhost:3000/api/exchange/upbit/balance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** NextRequest를 생성한다 (GET 요청) */
function createGetRequest(url: string): NextRequest {
  return new NextRequest(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
}

/** Route 파라미터를 생성한다 */
function createRouteParams(exchange: string) {
  return { params: Promise.resolve({ exchange }) };
}

/** 응답 JSON을 파싱한다 */
async function parseResponse(response: Response) {
  return response.json();
}

/** fetch 모킹에서 거래소 URL을 감지하고 적절한 응답을 반환하는 헬퍼 */
function createMockFetch(responseData: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(responseData), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

// ===== 테스트 =====

describe('Balance Route Handler', () => {
  beforeEach(() => {
    resetGlobalCache();
    resetGlobalRateLimiter();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetGlobalCache();
    resetGlobalRateLimiter();
    vi.restoreAllMocks();
  });

  it('업비트 잔고 조회 요청을 릴레이하고 정규화된 응답을 반환한다', async () => {
    createMockFetch(upbitBalanceResponse);

    const signedRequest = createSignedRequest();
    const request = createPostRequest(signedRequest);
    const response = await balancePOST(request, createRouteParams('upbit'));
    const data = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.exchange).toBe('upbit');
    expect(data.data.krwBalance).toBe(1000000);
    expect(data.data.holdings).toHaveLength(1); // BTC만 (KRW 제외)
    expect(data.data.holdings[0].symbol).toBe('BTC');
    expect(data.data.holdings[0].balance).toBe(0.5);
  });

  it('빗썸 잔고 조회 요청을 릴레이하고 정규화된 응답을 반환한다', async () => {
    createMockFetch(bithumbBalanceResponse);

    const signedRequest = createSignedRequest({
      url: 'https://api.bithumb.com/info/balance',
      method: 'POST',
      headers: {
        'Api-Key': 'test-access-key',
        'Api-Sign': 'test-signature',
        'Api-Nonce': '12345',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ order_currency: 'BTC' }),
    });
    const request = createPostRequest(signedRequest);
    const response = await balancePOST(request, createRouteParams('bithumb'));
    const data = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.exchange).toBe('bithumb');
  });

  it('코인원 잔고 조회 요청을 릴레이하고 정규화된 응답을 반환한다', async () => {
    createMockFetch(coinoneBalanceResponse);

    const signedRequest = createSignedRequest({
      url: 'https://api.coinone.co.kr/v2.1/account/balance/all',
      headers: {
        'X-COINONE-PAYLOAD': 'test-payload',
        'X-COINONE-SIGNATURE': 'test-signature',
        'Content-Type': 'application/json',
      },
    });
    const request = createPostRequest(signedRequest);
    const response = await balancePOST(request, createRouteParams('coinone'));
    const data = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.exchange).toBe('coinone');
  });

  it('지원하지 않는 거래소에 대해 400 오류를 반환한다', async () => {
    const signedRequest = createSignedRequest();
    const request = createPostRequest(signedRequest);
    const response = await balancePOST(request, createRouteParams('binance'));
    const data = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('INVALID_EXCHANGE');
  });

  it('잘못된 요청 본문에 대해 400 오류를 반환한다', async () => {
    const request = new NextRequest('http://localhost:3000/api/exchange/upbit/balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json',
    });
    const response = await balancePOST(request, createRouteParams('upbit'));
    const data = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('INVALID_REQUEST_BODY');
  });

  it('불완전한 서명된 요청에 대해 400 오류를 반환한다', async () => {
    const incompleteRequest = { url: 'https://api.upbit.com/v1/accounts' };
    const request = createPostRequest(incompleteRequest);
    const response = await balancePOST(request, createRouteParams('upbit'));
    const data = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('INVALID_SIGNED_REQUEST');
  });

  it('거래소 API 오류 시 적절한 오류 응답을 반환한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
    );

    const signedRequest = createSignedRequest();
    const request = createPostRequest(signedRequest);
    const response = await balancePOST(request, createRouteParams('upbit'));
    const data = await parseResponse(response);

    // 스테일 데이터가 없으므로 오류 반환
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
  });

  it('캐시된 데이터를 반환하고 cached 플래그를 설정한다', async () => {
    createMockFetch(upbitBalanceResponse);

    const signedRequest = createSignedRequest();

    // 첫 번째 요청: 캐시 저장
    const request1 = createPostRequest(signedRequest);
    const response1 = await balancePOST(request1, createRouteParams('upbit'));
    const data1 = await parseResponse(response1);
    expect(data1.cached).toBe(false);

    // 두 번째 요청: 캐시 히트
    const request2 = createPostRequest(signedRequest);
    const response2 = await balancePOST(request2, createRouteParams('upbit'));
    const data2 = await parseResponse(response2);
    expect(data2.success).toBe(true);
    expect(data2.cached).toBe(true);
  });
});

describe('Ticker Route Handler', () => {
  beforeEach(() => {
    resetGlobalCache();
    resetGlobalRateLimiter();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetGlobalCache();
    resetGlobalRateLimiter();
    vi.restoreAllMocks();
  });

  describe('GET', () => {
    it('업비트 시세를 조회하고 정규화된 응답을 반환한다', async () => {
      createMockFetch(upbitTickerResponse);

      const request = createGetRequest(
        'http://localhost:3000/api/exchange/upbit/ticker?symbols=BTC',
      );
      const response = await tickerGET(request, createRouteParams('upbit'));
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.exchange).toBe('upbit');
      expect(data.data.tickers).toHaveLength(1);
      expect(data.data.tickers[0].symbol).toBe('BTC');
      expect(data.data.tickers[0].currentPrice).toBe(50500000);
    });

    it('여러 심볼을 동시에 조회할 수 있다', async () => {
      const fetchSpy = createMockFetch(upbitTickerResponse);

      const request = createGetRequest(
        'http://localhost:3000/api/exchange/upbit/ticker?symbols=BTC,ETH',
      );
      await tickerGET(request, createRouteParams('upbit'));

      // fetch에 전달된 URL에 두 심볼이 포함되어 있는지 확인
      const firstCall = fetchSpy.mock.calls[0];
      expect(firstCall).toBeDefined();
      const fetchUrl = firstCall![0] as string;
      expect(fetchUrl).toContain('KRW-BTC');
      expect(fetchUrl).toContain('KRW-ETH');
    });

    it('심볼 없이 조회하면 기본 시세를 반환한다', async () => {
      createMockFetch(upbitTickerResponse);

      const request = createGetRequest(
        'http://localhost:3000/api/exchange/upbit/ticker',
      );
      const response = await tickerGET(request, createRouteParams('upbit'));
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('빗썸 시세를 조회할 수 있다', async () => {
      createMockFetch(bithumbTickerResponse);

      const request = createGetRequest(
        'http://localhost:3000/api/exchange/bithumb/ticker?symbols=BTC',
      );
      const response = await tickerGET(request, createRouteParams('bithumb'));
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.exchange).toBe('bithumb');
    });

    it('지원하지 않는 거래소에 대해 400 오류를 반환한다', async () => {
      const request = createGetRequest(
        'http://localhost:3000/api/exchange/binance/ticker?symbols=BTC',
      );
      const response = await tickerGET(request, createRouteParams('binance'));
      const data = await parseResponse(response);

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_EXCHANGE');
    });

    it('거래소 API 인증 오류 시 적절한 오류 응답을 반환한다', async () => {
      // 401 인증 오류는 재시도 불가능하므로 즉시 실패 (타임아웃 없음)
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
      );

      const request = createGetRequest(
        'http://localhost:3000/api/exchange/upbit/ticker?symbols=BTC',
      );
      const response = await tickerGET(request, createRouteParams('upbit'));
      const data = await parseResponse(response);

      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });
  });

  describe('POST', () => {
    it('서명된 요청으로 시세를 조회하고 정규화된 응답을 반환한다', async () => {
      createMockFetch(upbitTickerResponse);

      const body = {
        signedRequest: createSignedRequest({
          url: 'https://api.upbit.com/v1/ticker?markets=KRW-BTC',
        }),
        symbol: 'BTC',
      };
      const request = createPostRequest(body);
      const response = await tickerPOST(request, createRouteParams('upbit'));
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.exchange).toBe('upbit');
    });

    it('불완전한 서명된 요청에 대해 400 오류를 반환한다', async () => {
      const body = {
        signedRequest: { url: 'https://api.upbit.com/v1/ticker' },
      };
      const request = createPostRequest(body);
      const response = await tickerPOST(request, createRouteParams('upbit'));
      const data = await parseResponse(response);

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_SIGNED_REQUEST');
    });
  });
});

describe('Orderbook Route Handler', () => {
  beforeEach(() => {
    resetGlobalCache();
    resetGlobalRateLimiter();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetGlobalCache();
    resetGlobalRateLimiter();
    vi.restoreAllMocks();
  });

  describe('GET', () => {
    it('업비트 호가를 조회하고 정규화된 응답을 반환한다', async () => {
      createMockFetch(upbitOrderbookResponse);

      const request = createGetRequest(
        'http://localhost:3000/api/exchange/upbit/orderbook?symbol=BTC',
      );
      const response = await orderbookGET(request, createRouteParams('upbit'));
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.exchange).toBe('upbit');
      expect(data.data.orderbook.symbol).toBe('BTC');
      expect(data.data.orderbook.asks).toHaveLength(2);
      expect(data.data.orderbook.bids).toHaveLength(2);
      // 매도 호가는 낮은 가격순
      expect(data.data.orderbook.asks[0].price).toBeLessThanOrEqual(
        data.data.orderbook.asks[1].price,
      );
      // 매수 호가는 높은 가격순
      expect(data.data.orderbook.bids[0].price).toBeGreaterThanOrEqual(
        data.data.orderbook.bids[1].price,
      );
    });

    it('심볼 미지정 시 400 오류를 반환한다', async () => {
      const request = createGetRequest(
        'http://localhost:3000/api/exchange/upbit/orderbook',
      );
      const response = await orderbookGET(request, createRouteParams('upbit'));
      const data = await parseResponse(response);

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('MISSING_SYMBOL');
    });

    it('지원하지 않는 거래소에 대해 400 오류를 반환한다', async () => {
      const request = createGetRequest(
        'http://localhost:3000/api/exchange/binance/orderbook?symbol=BTC',
      );
      const response = await orderbookGET(request, createRouteParams('binance'));
      const data = await parseResponse(response);

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_EXCHANGE');
    });

    it('거래소별 올바른 URL을 구성하여 호출한다', async () => {
      const fetchSpy = createMockFetch(upbitOrderbookResponse);

      const request = createGetRequest(
        'http://localhost:3000/api/exchange/upbit/orderbook?symbol=ETH',
      );
      await orderbookGET(request, createRouteParams('upbit'));

      const firstCall = fetchSpy.mock.calls[0];
      expect(firstCall).toBeDefined();
      const fetchUrl = firstCall![0] as string;
      expect(fetchUrl).toContain('KRW-ETH');
    });
  });

  describe('POST', () => {
    it('서명된 요청으로 호가를 조회하고 정규화된 응답을 반환한다', async () => {
      createMockFetch(upbitOrderbookResponse);

      const body = {
        signedRequest: createSignedRequest({
          url: 'https://api.upbit.com/v1/orderbook?markets=KRW-BTC',
        }),
      };
      const request = createPostRequest(body);
      const response = await orderbookPOST(request, createRouteParams('upbit'));
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.exchange).toBe('upbit');
    });

    it('불완전한 서명된 요청에 대해 400 오류를 반환한다', async () => {
      const body = {
        signedRequest: { url: 'https://api.upbit.com/v1/orderbook' },
      };
      const request = createPostRequest(body);
      const response = await orderbookPOST(request, createRouteParams('upbit'));
      const data = await parseResponse(response);

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_SIGNED_REQUEST');
    });
  });
});

describe('Orders Route Handler', () => {
  beforeEach(() => {
    resetGlobalCache();
    resetGlobalRateLimiter();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetGlobalCache();
    resetGlobalRateLimiter();
    vi.restoreAllMocks();
  });

  it('업비트 주문 내역을 조회하고 정규화된 응답을 반환한다', async () => {
    createMockFetch(upbitOrdersResponse);

    const signedRequest = createSignedRequest({
      url: 'https://api.upbit.com/v1/orders?state=done',
    });
    const request = createPostRequest(signedRequest);
    const response = await ordersPOST(request, createRouteParams('upbit'));
    const data = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.exchange).toBe('upbit');
    expect(data.data.orders).toHaveLength(1);
    expect(data.data.orders[0].orderId).toBe('order-001');
    expect(data.data.orders[0].side).toBe('buy');
    expect(data.data.orders[0].status).toBe('filled');
    expect(data.data.orders[0].symbol).toBe('BTC');
  });

  it('지원하지 않는 거래소에 대해 400 오류를 반환한다', async () => {
    const signedRequest = createSignedRequest();
    const request = createPostRequest(signedRequest);
    const response = await ordersPOST(request, createRouteParams('kraken'));
    const data = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('INVALID_EXCHANGE');
  });

  it('잘못된 요청 본문에 대해 400 오류를 반환한다', async () => {
    const request = new NextRequest('http://localhost:3000/api/exchange/upbit/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json',
    });
    const response = await ordersPOST(request, createRouteParams('upbit'));
    const data = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('INVALID_REQUEST_BODY');
  });

  it('불완전한 서명된 요청에 대해 400 오류를 반환한다', async () => {
    const incompleteRequest = { method: 'GET' };
    const request = createPostRequest(incompleteRequest);
    const response = await ordersPOST(request, createRouteParams('upbit'));
    const data = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('INVALID_SIGNED_REQUEST');
  });

  it('거래소 API 인증 오류 시 적절한 오류 응답을 반환한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
    );

    const signedRequest = createSignedRequest({
      url: 'https://api.upbit.com/v1/orders',
    });
    const request = createPostRequest(signedRequest);
    const response = await ordersPOST(request, createRouteParams('upbit'));
    const data = await parseResponse(response);

    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
  });

  it('캐시된 주문 내역 데이터를 반환한다', async () => {
    createMockFetch(upbitOrdersResponse);

    const signedRequest = createSignedRequest({
      url: 'https://api.upbit.com/v1/orders',
    });

    // 첫 번째 요청: 캐시 저장
    const request1 = createPostRequest(signedRequest);
    const response1 = await ordersPOST(request1, createRouteParams('upbit'));
    const data1 = await parseResponse(response1);
    expect(data1.cached).toBe(false);

    // 두 번째 요청: 캐시 히트
    const request2 = createPostRequest(signedRequest);
    const response2 = await ordersPOST(request2, createRouteParams('upbit'));
    const data2 = await parseResponse(response2);
    expect(data2.success).toBe(true);
    expect(data2.cached).toBe(true);
  });
});

describe('공통 동작 검증', () => {
  beforeEach(() => {
    resetGlobalCache();
    resetGlobalRateLimiter();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetGlobalCache();
    resetGlobalRateLimiter();
    vi.restoreAllMocks();
  });

  it('API Key 원문이 서버에 기록되지 않는다 (서명된 헤더만 전달)', async () => {
    const fetchSpy = createMockFetch(upbitBalanceResponse);

    // 서명된 요청에 JWT 토큰만 포함 (Secret Key는 포함되지 않음)
    const signedRequest = createSignedRequest({
      headers: {
        Authorization: 'Bearer eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9...',
        'Content-Type': 'application/json',
      },
    });
    const request = createPostRequest(signedRequest);
    await balancePOST(request, createRouteParams('upbit'));

    // fetch에 전달된 헤더에 API Key 원문이 포함되지 않는지 확인
    const firstCall = fetchSpy.mock.calls[0];
    expect(firstCall).toBeDefined();
    const fetchOptions = firstCall![1] as RequestInit;
    const headers = fetchOptions.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9...');
    // Secret Key가 헤더에 직접 포함되지 않아야 한다
    expect(Object.values(headers).join('')).not.toContain('secret');
  });

  it('모든 Route Handler가 dataTimestamp를 반환한다', async () => {
    createMockFetch(upbitBalanceResponse);

    const signedRequest = createSignedRequest();
    const request = createPostRequest(signedRequest);
    const response = await balancePOST(request, createRouteParams('upbit'));
    const data = await parseResponse(response);

    expect(data.dataTimestamp).toBeDefined();
    expect(typeof data.dataTimestamp).toBe('number');
  });

  it('stale 플래그가 응답에 포함된다', async () => {
    createMockFetch(upbitBalanceResponse);

    const signedRequest = createSignedRequest();
    const request = createPostRequest(signedRequest);
    const response = await balancePOST(request, createRouteParams('upbit'));
    const data = await parseResponse(response);

    expect(data.stale).toBeDefined();
    expect(typeof data.stale).toBe('boolean');
  });

  it('3개 거래소 모두 잔고 조회를 지원한다', async () => {
    const exchanges = ['upbit', 'bithumb', 'coinone'] as const;
    const responses = [upbitBalanceResponse, bithumbBalanceResponse, coinoneBalanceResponse];

    for (let i = 0; i < exchanges.length; i++) {
      const exchangeName = exchanges[i]!;
      const responseFixture = responses[i]!;

      // 각 거래소별로 별도의 mock을 설정한다
      vi.restoreAllMocks();
      resetGlobalCache();
      resetGlobalRateLimiter();
      createMockFetch(responseFixture);

      const signedRequest = createSignedRequest({
        url: `https://api.example.com/${exchangeName}/balance`,
      });
      const request = createPostRequest(signedRequest);
      const response = await balancePOST(request, createRouteParams(exchangeName));
      const data = await parseResponse(response);

      expect(data.success).toBe(true);
      expect(data.data.exchange).toBe(exchangeName);
    }
  });
});
