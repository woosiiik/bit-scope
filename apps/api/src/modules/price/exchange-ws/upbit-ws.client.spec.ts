/**
 * UpbitWsClient 단위 테스트
 *
 * 업비트 WebSocket 클라이언트의 연결, 구독, 메시지 처리, 정규화를 검증한다.
 * 실제 WebSocket 연결 대신 ws 모듈을 모킹한다.
 */

import { EventEmitter } from 'events';
import { UpbitWsClient } from './upbit-ws.client';
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

  /** 테스트 헬퍼: 연결 성공 시뮬레이션 */
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.emit('open');
  }

  /** 테스트 헬퍼: 메시지 수신 시뮬레이션 */
  simulateMessage(data: unknown): void {
    const buffer = Buffer.from(JSON.stringify(data));
    this.emit('message', buffer);
  }

  /** 테스트 헬퍼: 연결 해제 시뮬레이션 */
  simulateClose(code: number, reason: string): void {
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close', code, Buffer.from(reason));
  }

  /** 테스트 헬퍼: 오류 시뮬레이션 */
  simulateError(message: string): void {
    this.emit('error', new Error(message));
  }
}

// ws 모듈을 모킹
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

describe('UpbitWsClient', () => {
  let client: UpbitWsClient;

  beforeEach(() => {
    client = new UpbitWsClient();
    jest.useFakeTimers();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await client.stop();
    client.removeAllListeners();
  });

  describe('거래소 타입', () => {
    it('upbit를 반환해야 한다', () => {
      expect(client.getExchangeType()).toBe('upbit');
    });
  });

  describe('연결 및 구독', () => {
    it('WebSocket 연결 후 ticker 구독 메시지를 전송해야 한다', async () => {
      const startPromise = client.start(['BTC', 'ETH']);
      mockWsInstance.simulateOpen();
      await startPromise;

      expect(client.isConnected()).toBe(true);

      // 구독 메시지 확인
      expect(mockWsInstance.sentMessages).toHaveLength(1);
      const subscriptionMsg = JSON.parse(mockWsInstance.sentMessages[0]!);

      expect(subscriptionMsg).toHaveLength(2);
      expect(subscriptionMsg[0]).toHaveProperty('ticket');
      expect(subscriptionMsg[1].type).toBe('ticker');
      expect(subscriptionMsg[1].codes).toEqual(['KRW-BTC', 'KRW-ETH']);
      expect(subscriptionMsg[1].isOnlyRealtime).toBe(true);
    });

    it('심볼을 업비트 마켓 코드(KRW-XXX)로 변환해야 한다', async () => {
      const startPromise = client.start(['XRP', 'SOL', 'DOGE']);
      mockWsInstance.simulateOpen();
      await startPromise;

      const subscriptionMsg = JSON.parse(mockWsInstance.sentMessages[0]!);
      expect(subscriptionMsg[1].codes).toEqual([
        'KRW-XRP',
        'KRW-SOL',
        'KRW-DOGE',
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
        code: 'KRW-BTC',
        trade_price: 100000000,
        opening_price: 98000000,
        high_price: 101000000,
        low_price: 97000000,
        prev_closing_price: 99000000,
        acc_trade_volume_24h: 1234.567,
        acc_trade_price_24h: 123456789000,
        signed_change_rate: 0.0101, // 1.01%
        signed_change_price: 1000000,
        timestamp: 1700000000000,
      };

      mockWsInstance.simulateMessage(tickerData);

      expect(priceUpdateHandler).toHaveBeenCalledTimes(1);

      const update: PriceUpdate = priceUpdateHandler.mock.calls[0][0];
      expect(update.exchange).toBe('upbit');
      expect(update.symbol).toBe('BTC');
      expect(update.price).toBe(100000000);
      expect(update.changeRate).toBeCloseTo(1.01); // 0.0101 * 100
      expect(update.volume24h).toBe(1234.567);
      expect(update.timestamp).toBe(1700000000000);
    });

    it('ticker가 아닌 메시지는 무시해야 한다', async () => {
      const startPromise = client.start(['BTC']);
      mockWsInstance.simulateOpen();
      await startPromise;

      const priceUpdateHandler = jest.fn();
      client.on('priceUpdate', priceUpdateHandler);

      // orderbook 타입 메시지
      mockWsInstance.simulateMessage({
        type: 'orderbook',
        code: 'KRW-BTC',
      });

      expect(priceUpdateHandler).not.toHaveBeenCalled();
    });

    it('잘못된 JSON 메시지는 오류 없이 무시해야 한다', async () => {
      const startPromise = client.start(['BTC']);
      mockWsInstance.simulateOpen();
      await startPromise;

      // 잘못된 데이터 전송
      mockWsInstance.emit('message', Buffer.from('not-json'));

      // 오류가 발생하지 않아야 함
      expect(client.isConnected()).toBe(true);
    });

    it('마켓 코드에서 심볼을 올바르게 추출해야 한다', async () => {
      const startPromise = client.start(['ETH']);
      mockWsInstance.simulateOpen();
      await startPromise;

      const priceUpdateHandler = jest.fn();
      client.on('priceUpdate', priceUpdateHandler);

      mockWsInstance.simulateMessage({
        type: 'ticker',
        code: 'KRW-ETH',
        trade_price: 5000000,
        opening_price: 4900000,
        high_price: 5100000,
        low_price: 4800000,
        prev_closing_price: 4950000,
        acc_trade_volume_24h: 5678.9,
        acc_trade_price_24h: 28394500000,
        signed_change_rate: 0.02,
        signed_change_price: 100000,
        timestamp: 1700000000000,
      });

      const update: PriceUpdate = priceUpdateHandler.mock.calls[0][0];
      expect(update.symbol).toBe('ETH');
    });
  });

  describe('심볼 구독 변경', () => {
    it('subscribe 시 전체 심볼로 재구독해야 한다', async () => {
      const startPromise = client.start(['BTC']);
      mockWsInstance.simulateOpen();
      await startPromise;

      // 초기 구독: 1번
      expect(mockWsInstance.sentMessages).toHaveLength(1);

      client.subscribe(['ETH']);

      // 재구독: 2번째 메시지
      expect(mockWsInstance.sentMessages).toHaveLength(2);
      const resubMsg = JSON.parse(mockWsInstance.sentMessages[1]!);
      expect(resubMsg[1].codes).toEqual(['KRW-BTC', 'KRW-ETH']);
    });

    it('unsubscribe 시 남은 심볼로 재구독해야 한다', async () => {
      const startPromise = client.start(['BTC', 'ETH', 'XRP']);
      mockWsInstance.simulateOpen();
      await startPromise;

      client.unsubscribe(['ETH']);

      const resubMsg = JSON.parse(
        mockWsInstance.sentMessages[mockWsInstance.sentMessages.length - 1]!,
      );
      expect(resubMsg[1].codes).toEqual(['KRW-BTC', 'KRW-XRP']);
    });
  });

  describe('연결 해제 및 재연결', () => {
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
