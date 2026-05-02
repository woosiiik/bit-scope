/**
 * BithumbWsClient 단위 테스트
 *
 * 빗썸 WebSocket 클라이언트의 연결, 구독, 메시지 처리, 정규화를 검증한다.
 * 실제 WebSocket 연결 대신 ws 모듈을 모킹한다.
 */

import { EventEmitter } from 'events';
import { BithumbWsClient } from './bithumb-ws.client';
import type { PriceUpdate } from '@bitscope/shared';

/** WebSocket 모킹 클래스 */
class MockWebSocket extends EventEmitter {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState: number = MockWebSocket.CONNECTING;
  sentMessages: string[] = [];

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(_code?: number, _reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close', 1000, Buffer.from(''));
  }

  ping(): void {
    // no-op
  }

  removeAllListeners(): this {
    super.removeAllListeners();
    return this;
  }

  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.emit('open');
  }

  simulateMessage(data: unknown): void {
    const buffer = Buffer.from(JSON.stringify(data));
    this.emit('message', buffer);
  }

  simulateClose(code: number, reason: string): void {
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close', code, Buffer.from(reason));
  }
}

let mockWsInstance: MockWebSocket;

jest.mock('ws', () => {
  const MockWsConstructor = jest.fn().mockImplementation(() => {
    mockWsInstance = new MockWebSocket();
    return mockWsInstance;
  });

  // WebSocket 정적 상수를 mock 생성자에 추가
  Object.assign(MockWsConstructor, {
    OPEN: 1,
    CONNECTING: 0,
    CLOSING: 2,
    CLOSED: 3,
  });

  return MockWsConstructor;
});

describe('BithumbWsClient', () => {
  let client: BithumbWsClient;

  beforeEach(() => {
    client = new BithumbWsClient();
    jest.useFakeTimers();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await client.stop();
    client.removeAllListeners();
  });

  describe('거래소 타입', () => {
    it('bithumb를 반환해야 한다', () => {
      expect(client.getExchangeType()).toBe('bithumb');
    });
  });

  describe('연결 및 구독', () => {
    it('WebSocket 연결 후 ticker 구독 메시지를 전송해야 한다', async () => {
      const startPromise = client.start(['BTC', 'ETH']);
      mockWsInstance.simulateOpen();
      await startPromise;

      expect(client.isConnected()).toBe(true);
      expect(mockWsInstance.sentMessages).toHaveLength(1);

      const subscriptionMsg = JSON.parse(mockWsInstance.sentMessages[0]);
      expect(subscriptionMsg.type).toBe('ticker');
      expect(subscriptionMsg.symbols).toEqual(['BTC_KRW', 'ETH_KRW']);
      expect(subscriptionMsg.tickTypes).toEqual(['24H']);
    });

    it('심볼을 빗썸 형식(XXX_KRW)으로 변환해야 한다', async () => {
      const startPromise = client.start(['XRP', 'SOL', 'DOGE']);
      mockWsInstance.simulateOpen();
      await startPromise;

      const subscriptionMsg = JSON.parse(mockWsInstance.sentMessages[0]);
      expect(subscriptionMsg.symbols).toEqual([
        'XRP_KRW',
        'SOL_KRW',
        'DOGE_KRW',
      ]);
    });
  });

  describe('메시지 처리', () => {
    it('ticker 메시지를 PriceUpdate로 변환하여 발행해야 한다', async () => {
      const startPromise = client.start(['BTC']);
      mockWsInstance.simulateOpen();
      await startPromise;

      const priceUpdateHandler = jest.fn();
      client.on('priceUpdate', priceUpdateHandler);

      const tickerData = {
        type: 'ticker',
        content: {
          symbol: 'BTC_KRW',
          closePrice: '100000000',
          openPrice: '98000000',
          highPrice: '101000000',
          lowPrice: '97000000',
          prevClosePrice: '99000000',
          volume: '1234.567',
          value: '123456789000',
          chgRate: '1.01',
          chgAmt: '1000000',
          date: '20260501',
          time: '143025',
        },
      };

      mockWsInstance.simulateMessage(tickerData);

      expect(priceUpdateHandler).toHaveBeenCalledTimes(1);

      const update: PriceUpdate = priceUpdateHandler.mock.calls[0][0];
      expect(update.exchange).toBe('bithumb');
      expect(update.symbol).toBe('BTC');
      expect(update.price).toBe(100000000);
      expect(update.changeRate).toBe(1.01);
      expect(update.volume24h).toBe(1234.567);
      expect(typeof update.timestamp).toBe('number');
    });

    it('status 응답 메시지는 무시해야 한다', async () => {
      const startPromise = client.start(['BTC']);
      mockWsInstance.simulateOpen();
      await startPromise;

      const priceUpdateHandler = jest.fn();
      client.on('priceUpdate', priceUpdateHandler);

      // 구독 확인 응답
      mockWsInstance.simulateMessage({
        status: '0000',
        resmsg: 'Connected Successfully',
      });

      expect(priceUpdateHandler).not.toHaveBeenCalled();
    });

    it('content가 없는 ticker 메시지는 무시해야 한다', async () => {
      const startPromise = client.start(['BTC']);
      mockWsInstance.simulateOpen();
      await startPromise;

      const priceUpdateHandler = jest.fn();
      client.on('priceUpdate', priceUpdateHandler);

      mockWsInstance.simulateMessage({
        type: 'ticker',
      });

      expect(priceUpdateHandler).not.toHaveBeenCalled();
    });

    it('가격이 0이거나 NaN인 데이터는 무시해야 한다', async () => {
      const startPromise = client.start(['BTC']);
      mockWsInstance.simulateOpen();
      await startPromise;

      const priceUpdateHandler = jest.fn();
      client.on('priceUpdate', priceUpdateHandler);

      mockWsInstance.simulateMessage({
        type: 'ticker',
        content: {
          symbol: 'BTC_KRW',
          closePrice: '0',
          openPrice: '0',
          highPrice: '0',
          lowPrice: '0',
          prevClosePrice: '0',
          volume: '0',
          value: '0',
          chgRate: '0',
          chgAmt: '0',
          date: '20260501',
          time: '143025',
        },
      });

      expect(priceUpdateHandler).not.toHaveBeenCalled();
    });

    it('심볼에서 _KRW 접미사를 올바르게 제거해야 한다', async () => {
      const startPromise = client.start(['ETH']);
      mockWsInstance.simulateOpen();
      await startPromise;

      const priceUpdateHandler = jest.fn();
      client.on('priceUpdate', priceUpdateHandler);

      mockWsInstance.simulateMessage({
        type: 'ticker',
        content: {
          symbol: 'ETH_KRW',
          closePrice: '5000000',
          openPrice: '4900000',
          highPrice: '5100000',
          lowPrice: '4800000',
          prevClosePrice: '4950000',
          volume: '5678.9',
          value: '28394500000',
          chgRate: '2.00',
          chgAmt: '100000',
          date: '20260501',
          time: '120000',
        },
      });

      const update: PriceUpdate = priceUpdateHandler.mock.calls[0][0];
      expect(update.symbol).toBe('ETH');
    });
  });

  describe('타임스탬프 파싱', () => {
    it('빗썸 날짜/시간 문자열을 올바르게 파싱해야 한다', async () => {
      const startPromise = client.start(['BTC']);
      mockWsInstance.simulateOpen();
      await startPromise;

      const priceUpdateHandler = jest.fn();
      client.on('priceUpdate', priceUpdateHandler);

      mockWsInstance.simulateMessage({
        type: 'ticker',
        content: {
          symbol: 'BTC_KRW',
          closePrice: '100000000',
          openPrice: '98000000',
          highPrice: '101000000',
          lowPrice: '97000000',
          prevClosePrice: '99000000',
          volume: '1234.567',
          value: '123456789000',
          chgRate: '1.01',
          chgAmt: '1000000',
          date: '20260101',
          time: '120000',
        },
      });

      const update: PriceUpdate = priceUpdateHandler.mock.calls[0][0];
      // 2026-01-01T12:00:00+09:00
      const expectedDate = new Date('2026-01-01T12:00:00+09:00');
      expect(update.timestamp).toBe(expectedDate.getTime());
    });
  });

  describe('심볼 구독 변경', () => {
    it('subscribe 시 추가 심볼에 대해 구독 메시지를 전송해야 한다', async () => {
      const startPromise = client.start(['BTC']);
      mockWsInstance.simulateOpen();
      await startPromise;

      client.subscribe(['ETH']);

      // 초기 구독 + 추가 구독
      expect(mockWsInstance.sentMessages.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('연결 해제', () => {
    it('WebSocket close 시 disconnected 이벤트를 발행해야 한다', async () => {
      const startPromise = client.start(['BTC']);
      mockWsInstance.simulateOpen();
      await startPromise;

      const disconnectedHandler = jest.fn();
      client.on('disconnected', disconnectedHandler);

      mockWsInstance.simulateClose(1006, '비정상 종료');

      expect(disconnectedHandler).toHaveBeenCalledTimes(1);
      expect(client.isConnected()).toBe(false);
    });
  });
});
