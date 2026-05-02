/**
 * BaseExchangeClient 단위 테스트
 *
 * 추상 클래스의 공통 로직(재연결, 이벤트 발행, 심볼 관리)을 검증한다.
 */

import { BaseExchangeClient } from './base-exchange.client';
import type { PriceUpdate } from '@bitscope/shared';

/** 테스트용 구체 클래스 */
class TestExchangeClient extends BaseExchangeClient {
  public connectCallCount = 0;
  public disconnectCallCount = 0;
  public subscribeCalls: string[][] = [];
  public unsubscribeCalls: string[][] = [];
  public shouldFailConnect = false;

  constructor(maxReconnectAttempts = 3) {
    super('upbit', maxReconnectAttempts);
  }

  protected async doConnect(): Promise<void> {
    this.connectCallCount++;
    if (this.shouldFailConnect) {
      throw new Error('연결 실패');
    }
    this.onConnected();
  }

  protected async doDisconnect(): Promise<void> {
    this.disconnectCallCount++;
    this.connected = false;
  }

  protected doSubscribe(symbols: string[]): void {
    this.subscribeCalls.push(symbols);
  }

  protected doUnsubscribe(symbols: string[]): void {
    this.unsubscribeCalls.push(symbols);
  }

  // 테스트 헬퍼: onDisconnected를 외부에서 호출
  public triggerDisconnect(reason?: string): void {
    this.onDisconnected(reason);
  }

  // 테스트 헬퍼: emitPriceUpdate를 외부에서 호출
  public triggerPriceUpdate(update: PriceUpdate): void {
    this.emitPriceUpdate(update);
  }

  // 테스트 헬퍼: running 플래그 접근
  public getRunning(): boolean {
    return this.running;
  }

  // 테스트 헬퍼: 재연결 시도 횟수 조회
  public getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }
}

describe('BaseExchangeClient', () => {
  let client: TestExchangeClient;

  beforeEach(() => {
    client = new TestExchangeClient();
    jest.useFakeTimers();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await client.stop();
    client.removeAllListeners();
  });

  describe('getExchangeType()', () => {
    it('설정된 거래소 타입을 반환해야 한다', () => {
      expect(client.getExchangeType()).toBe('upbit');
    });
  });

  describe('start()', () => {
    it('doConnect를 호출하고 running 상태를 설정해야 한다', async () => {
      await client.start(['BTC', 'ETH']);

      expect(client.connectCallCount).toBe(1);
      expect(client.isConnected()).toBe(true);
      expect(client.getRunning()).toBe(true);
    });

    it('구독 심볼 목록을 저장해야 한다', async () => {
      await client.start(['BTC', 'ETH', 'XRP']);

      // subscribe 호출로 확인 (connected 상태에서 추가 심볼)
      client.subscribe(['SOL']);
      expect(client.subscribeCalls).toHaveLength(1);
      expect(client.subscribeCalls[0]).toEqual(['SOL']);
    });

    it('connected 이벤트를 발행해야 한다', async () => {
      const connectedHandler = jest.fn();
      client.on('connected', connectedHandler);

      await client.start(['BTC']);

      expect(connectedHandler).toHaveBeenCalledTimes(1);
    });

    it('재연결 시도 횟수를 리셋해야 한다', async () => {
      await client.start(['BTC']);

      expect(client.getReconnectAttempts()).toBe(0);
    });
  });

  describe('stop()', () => {
    it('doDisconnect를 호출하고 running을 false로 설정해야 한다', async () => {
      await client.start(['BTC']);
      await client.stop();

      expect(client.disconnectCallCount).toBe(1);
      expect(client.getRunning()).toBe(false);
    });
  });

  describe('subscribe()', () => {
    it('연결된 상태에서 새 심볼을 구독하면 doSubscribe를 호출해야 한다', async () => {
      await client.start(['BTC']);

      client.subscribe(['ETH', 'XRP']);

      expect(client.subscribeCalls).toHaveLength(1);
      expect(client.subscribeCalls[0]).toEqual(['ETH', 'XRP']);
    });

    it('이미 구독 중인 심볼은 무시해야 한다', async () => {
      await client.start(['BTC', 'ETH']);

      client.subscribe(['BTC', 'ETH']);

      expect(client.subscribeCalls).toHaveLength(0);
    });

    it('연결되지 않은 상태에서는 doSubscribe를 호출하지 않아야 한다', () => {
      client.subscribe(['BTC']);

      expect(client.subscribeCalls).toHaveLength(0);
    });
  });

  describe('unsubscribe()', () => {
    it('연결된 상태에서 심볼을 구독 해제하면 doUnsubscribe를 호출해야 한다', async () => {
      await client.start(['BTC', 'ETH', 'XRP']);

      client.unsubscribe(['ETH']);

      expect(client.unsubscribeCalls).toHaveLength(1);
      expect(client.unsubscribeCalls[0]).toEqual(['ETH']);
    });
  });

  describe('자동 재연결', () => {
    it('연결 해제 시 running 상태이면 재연결을 스케줄해야 한다', async () => {
      await client.start(['BTC']);

      client.triggerDisconnect('테스트 연결 해제');

      expect(client.isConnected()).toBe(false);

      // 지수 백오프: 첫 시도 1초 후
      jest.advanceTimersByTime(1000);

      // doConnect가 다시 호출됨 (start에서 1번 + 재연결 1번)
      expect(client.connectCallCount).toBe(2);
    });

    it('재연결 성공 시 재연결 카운터를 리셋해야 한다', async () => {
      await client.start(['BTC']);

      client.triggerDisconnect('테스트');
      jest.advanceTimersByTime(1000);

      expect(client.getReconnectAttempts()).toBe(0);
      expect(client.isConnected()).toBe(true);
    });

    it('최대 재연결 횟수를 초과하면 error 이벤트를 발행해야 한다', async () => {
      const maxAttempts = 3;
      client = new TestExchangeClient(maxAttempts);
      client.shouldFailConnect = false;

      await client.start(['BTC']);

      // 연결 실패하도록 설정
      client.shouldFailConnect = true;

      const errorHandler = jest.fn();
      client.on('error', errorHandler);

      // 연결 해제를 1회 트리거 -> scheduleReconnect가 시작됨
      client.triggerDisconnect('테스트');

      // 지수 백오프로 재연결 시도 (비동기 콜백이므로 runAllTimersAsync 사용)
      // 시도 1 ~ maxAttempts까지 재시도 + 1번 더 (초과 판단)
      for (let i = 0; i < maxAttempts + 2; i++) {
        await jest.advanceTimersByTimeAsync(30_000);
      }

      expect(errorHandler).toHaveBeenCalled();
      const errorMsg = errorHandler.mock.calls[0][0].message;
      expect(errorMsg).toContain('최대 재연결 시도 횟수');
    });

    it('stop 호출 후에는 재연결을 시도하지 않아야 한다', async () => {
      await client.start(['BTC']);
      await client.stop();

      client.triggerDisconnect('테스트');
      jest.advanceTimersByTime(10000);

      // stop 후에는 doConnect가 추가 호출되지 않아야 함
      expect(client.connectCallCount).toBe(1);
    });
  });

  describe('이벤트 발행', () => {
    it('priceUpdate 이벤트를 발행해야 한다', async () => {
      await client.start(['BTC']);

      const handler = jest.fn();
      client.on('priceUpdate', handler);

      const update: PriceUpdate = {
        exchange: 'upbit',
        symbol: 'BTC',
        price: 100000000,
        changeRate: 2.5,
        volume24h: 1000,
        timestamp: Date.now(),
      };

      client.triggerPriceUpdate(update);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(update);
    });

    it('disconnected 이벤트를 발행해야 한다', async () => {
      await client.start(['BTC']);

      const handler = jest.fn();
      client.on('disconnected', handler);

      client.triggerDisconnect('테스트 사유');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('테스트 사유');
    });
  });
});
