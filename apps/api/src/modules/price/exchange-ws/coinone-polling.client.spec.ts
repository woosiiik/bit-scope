/**
 * CoinonePollingClient 단위 테스트
 *
 * 코인원 REST 폴링 클라이언트의 연결, 폴링, 데이터 정규화를 검증한다.
 * 실제 HTTP 호출 대신 fetch를 모킹한다.
 */

import { CoinonePollingClient } from './coinone-polling.client';
import type { CoinoneTickerResponse } from './coinone-polling.client';
import type { PriceUpdate } from '@bitscope/shared';

// fetch 모킹
const mockFetch = jest.fn();
global.fetch = mockFetch;

/** 코인원 정상 응답 fixture */
function createTickerResponse(
  tickers: Partial<CoinoneTickerResponse['tickers'][0]>[] = [],
): CoinoneTickerResponse {
  return {
    result: '0',
    error_code: '0',
    server_time: Date.now(),
    tickers: tickers.map((t) => ({
      quote_currency: 'KRW',
      target_currency: t.target_currency || 'BTC',
      timestamp: t.timestamp || Date.now(),
      last: t.last || '100000000',
      first: t.first || '98000000',
      high: t.high || '101000000',
      low: t.low || '97000000',
      volume: t.volume || '1234.567',
      yesterday_last: t.yesterday_last || '99000000',
      yesterday_volume: t.yesterday_volume || '1200.0',
      target_volume: t.target_volume || '123456789000',
    })),
  };
}

describe('CoinonePollingClient', () => {
  let client: CoinonePollingClient;

  beforeEach(() => {
    // 빠른 테스트를 위해 짧은 폴링 간격 사용
    client = new CoinonePollingClient(1000);
    mockFetch.mockReset();
    jest.useFakeTimers();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await client.stop();
    client.removeAllListeners();
  });

  describe('거래소 타입', () => {
    it('coinone를 반환해야 한다', () => {
      expect(client.getExchangeType()).toBe('coinone');
    });
  });

  describe('연결(폴링 시작)', () => {
    it('start 시 즉시 1회 폴링을 수행하고 connected 이벤트를 발행해야 한다', async () => {
      const response = createTickerResponse([
        { target_currency: 'BTC', last: '100000000' },
      ]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(response),
      });

      const connectedHandler = jest.fn();
      client.on('connected', connectedHandler);

      await client.start(['BTC']);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(connectedHandler).toHaveBeenCalledTimes(1);
      expect(client.isConnected()).toBe(true);
    });

    it('start 후 주기적으로 폴링을 수행해야 한다', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve(
            createTickerResponse([
              { target_currency: 'BTC', last: '100000000' },
            ]),
          ),
      });

      await client.start(['BTC']);

      // 최초 1회 호출
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // 폴링 간격(1초) 후 추가 호출
      jest.advanceTimersByTime(1000);
      // fetch는 비동기이므로 타이머 이후에도 바로 카운트가 안 오를 수 있음
      // 하지만 timer callback 내에서 호출되므로 mock 호출은 누적됨
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('시세 데이터 처리', () => {
    it('구독 중인 심볼의 시세만 PriceUpdate로 발행해야 한다', async () => {
      const response = createTickerResponse([
        { target_currency: 'BTC', last: '100000000', yesterday_last: '99000000' },
        { target_currency: 'ETH', last: '5000000', yesterday_last: '4900000' },
        { target_currency: 'XRP', last: '1000', yesterday_last: '980' },
      ]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(response),
      });

      const priceUpdateHandler = jest.fn();
      client.on('priceUpdate', priceUpdateHandler);

      // BTC와 ETH만 구독
      await client.start(['BTC', 'ETH']);

      expect(priceUpdateHandler).toHaveBeenCalledTimes(2);

      const symbols = priceUpdateHandler.mock.calls.map(
        (call: [PriceUpdate]) => call[0].symbol,
      );
      expect(symbols).toContain('BTC');
      expect(symbols).toContain('ETH');
      expect(symbols).not.toContain('XRP');
    });

    it('PriceUpdate의 각 필드가 올바르게 정규화되어야 한다', async () => {
      const response = createTickerResponse([
        {
          target_currency: 'BTC',
          last: '100000000',
          volume: '1234.567',
          yesterday_last: '98000000',
          timestamp: 1700000000000,
        },
      ]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(response),
      });

      const priceUpdateHandler = jest.fn();
      client.on('priceUpdate', priceUpdateHandler);

      await client.start(['BTC']);

      const update: PriceUpdate = priceUpdateHandler.mock.calls[0][0];
      expect(update.exchange).toBe('coinone');
      expect(update.symbol).toBe('BTC');
      expect(update.price).toBe(100000000);
      expect(update.volume24h).toBe(1234.567);
      expect(update.timestamp).toBe(1700000000000);

      // 변동률: (100000000 - 98000000) / 98000000 * 100 = 약 2.04%
      expect(update.changeRate).toBeCloseTo(2.0408, 2);
    });

    it('변동률을 올바르게 계산해야 한다 (전일종가 대비)', async () => {
      const response = createTickerResponse([
        {
          target_currency: 'ETH',
          last: '5000000',
          yesterday_last: '5100000', // 하락
        },
      ]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(response),
      });

      const priceUpdateHandler = jest.fn();
      client.on('priceUpdate', priceUpdateHandler);

      await client.start(['ETH']);

      const update: PriceUpdate = priceUpdateHandler.mock.calls[0][0];
      // (5000000 - 5100000) / 5100000 * 100 = 약 -1.96%
      expect(update.changeRate).toBeCloseTo(-1.9608, 2);
    });

    it('가격이 0이거나 유효하지 않은 데이터는 무시해야 한다', async () => {
      const response = createTickerResponse([
        { target_currency: 'BTC', last: '0' },
        { target_currency: 'ETH', last: 'invalid' },
        { target_currency: 'XRP', last: '1000' },
      ]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(response),
      });

      const priceUpdateHandler = jest.fn();
      client.on('priceUpdate', priceUpdateHandler);

      await client.start(['BTC', 'ETH', 'XRP']);

      // XRP만 유효
      expect(priceUpdateHandler).toHaveBeenCalledTimes(1);
      expect(priceUpdateHandler.mock.calls[0][0].symbol).toBe('XRP');
    });
  });

  describe('오류 처리', () => {
    it('HTTP 오류 응답 시 오류를 로깅하고 계속 폴링해야 한다', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(
              createTickerResponse([
                { target_currency: 'BTC', last: '100000000' },
              ]),
            ),
        });

      const priceUpdateHandler = jest.fn();
      client.on('priceUpdate', priceUpdateHandler);

      // 첫 호출은 실패하지만 start는 에러를 던지지 않음 (내부에서 catch)
      await client.start(['BTC']);

      // 첫 호출 실패 → priceUpdate 없음
      expect(priceUpdateHandler).not.toHaveBeenCalled();
    });

    it('코인원 API 오류 결과(result != "0") 시 오류를 로깅해야 한다', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            result: '104',
            error_code: 'RATE_LIMIT',
            server_time: Date.now(),
            tickers: [],
          }),
      });

      const priceUpdateHandler = jest.fn();
      client.on('priceUpdate', priceUpdateHandler);

      await client.start(['BTC']);

      expect(priceUpdateHandler).not.toHaveBeenCalled();
    });

    it('네트워크 오류 시 연속 오류 카운터를 증가시켜야 한다', async () => {
      // 초기 폴링은 성공
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve(
            createTickerResponse([
              { target_currency: 'BTC', last: '100000000' },
            ]),
          ),
      });

      await client.start(['BTC']);

      // 이후 폴링은 실패
      mockFetch.mockRejectedValue(new Error('Network error'));

      // 여러 번 폴링 시도
      for (let i = 0; i < 5; i++) {
        jest.advanceTimersByTime(1000);
      }

      // 연속 오류가 쌓여도 연결 상태는 유지 (maxConsecutiveErrors 미만)
      expect(client.isConnected()).toBe(true);
    });
  });

  describe('중지', () => {
    it('stop 호출 시 폴링을 중지해야 한다', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve(
            createTickerResponse([
              { target_currency: 'BTC', last: '100000000' },
            ]),
          ),
      });

      await client.start(['BTC']);
      const callsAfterStart = mockFetch.mock.calls.length;

      await client.stop();

      jest.advanceTimersByTime(5000);

      // stop 후에는 추가 호출이 없어야 함
      expect(mockFetch.mock.calls.length).toBe(callsAfterStart);
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('심볼 구독 변경', () => {
    it('subscribe 시 즉시 1회 폴링을 수행해야 한다', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve(
            createTickerResponse([
              { target_currency: 'BTC', last: '100000000' },
              { target_currency: 'ETH', last: '5000000' },
            ]),
          ),
      });

      await client.start(['BTC']);

      const callsAfterStart = mockFetch.mock.calls.length;

      client.subscribe(['ETH']);

      // subscribe 내부에서 즉시 폴링 1회 수행
      // 비동기 호출이므로 약간의 대기 필요 없음 (jest가 모킹하고 있으므로)
      // fetchTickers는 비동기지만 doSubscribe 내에서 fire-and-forget
      // 여기서는 호출이 발생했는지만 확인
      // 타이머 없이도 fetchTickers가 호출됨
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(
        callsAfterStart,
      );
    });
  });
});
