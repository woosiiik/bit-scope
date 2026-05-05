/**
 * PriceGateway 단위 테스트
 *
 * Socket.IO 게이트웨이의 클라이언트 구독/구독해제,
 * 시세 브로드캐스트, 알림 전송 등을 검증한다.
 */

import type { PriceUpdate, AlertNotification } from '@bitscope/shared';

import { PriceGateway, WS_EVENTS } from './price.gateway';
import { PRICE_EVENTS } from './price-monitor.service';

/** Socket 모킹 */
function createMockSocket(id: string) {
  return {
    id,
    join: jest.fn(),
    leave: jest.fn(),
  };
}

/** Server 모킹 */
function createMockServer() {
  const mockEmit = jest.fn();
  const toRooms: string[] = [];

  return {
    to: jest.fn((room: string) => {
      toRooms.push(room);
      return { emit: mockEmit };
    }),
    emit: jest.fn(),
    _mockEmit: mockEmit,
    _toRooms: toRooms,
  };
}

describe('PriceGateway', () => {
  let gateway: PriceGateway;
  let mockServer: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    gateway = new PriceGateway();
    mockServer = createMockServer();
    (gateway as unknown as { server: unknown }).server = mockServer;
  });

  describe('afterInit', () => {
    it('초기화가 오류 없이 완료되어야 한다', () => {
      expect(() => gateway.afterInit(mockServer as never)).not.toThrow();
    });
  });

  describe('handleConnection / handleDisconnect', () => {
    it('클라이언트 연결 시 카운트가 증가해야 한다', () => {
      const socket = createMockSocket('client-1');
      gateway.handleConnection(socket as never);

      expect(gateway.getConnectedClientsCount()).toBe(1);
    });

    it('클라이언트 연결 해제 시 카운트가 감소해야 한다', () => {
      const socket1 = createMockSocket('client-1');
      const socket2 = createMockSocket('client-2');

      gateway.handleConnection(socket1 as never);
      gateway.handleConnection(socket2 as never);
      expect(gateway.getConnectedClientsCount()).toBe(2);

      gateway.handleDisconnect(socket1 as never);
      expect(gateway.getConnectedClientsCount()).toBe(1);
    });
  });

  describe('handleSubscription', () => {
    it('클라이언트를 심볼 Room에 join시켜야 한다', () => {
      const socket = createMockSocket('client-1');

      const result = gateway.handleSubscription(
        socket as never,
        { symbols: ['BTC', 'ETH'] },
      );

      expect(socket.join).toHaveBeenCalledWith('symbol:BTC');
      expect(socket.join).toHaveBeenCalledWith('symbol:ETH');
      expect(result.data.subscribed).toEqual(['BTC', 'ETH']);
    });

    it('빈 심볼 배열이면 빈 결과를 반환해야 한다', () => {
      const socket = createMockSocket('client-1');

      const result = gateway.handleSubscription(
        socket as never,
        { symbols: [] },
      );

      expect(socket.join).not.toHaveBeenCalled();
      expect(result.data.subscribed).toEqual([]);
    });

    it('null/undefined symbols이면 빈 결과를 반환해야 한다', () => {
      const socket = createMockSocket('client-1');

      const result = gateway.handleSubscription(
        socket as never,
        {} as { symbols: string[] },
      );

      expect(result.data.subscribed).toEqual([]);
    });

    it('유효하지 않은 심볼은 필터링해야 한다', () => {
      const socket = createMockSocket('client-1');

      const result = gateway.handleSubscription(
        socket as never,
        { symbols: ['BTC', '', '  ', 'ETH'] },
      );

      // 비어있는 문자열은 필터링됨
      expect(result.data.subscribed).toEqual(['BTC', 'ETH']);
      expect(socket.join).toHaveBeenCalledTimes(2);
    });

    it('심볼을 대문자 Room으로 join해야 한다', () => {
      const socket = createMockSocket('client-1');

      gateway.handleSubscription(
        socket as never,
        { symbols: ['btc'] },
      );

      expect(socket.join).toHaveBeenCalledWith('symbol:BTC');
    });
  });

  describe('handleUnsubscription', () => {
    it('클라이언트를 심볼 Room에서 leave시켜야 한다', () => {
      const socket = createMockSocket('client-1');

      const result = gateway.handleUnsubscription(
        socket as never,
        { symbols: ['BTC', 'ETH'] },
      );

      expect(socket.leave).toHaveBeenCalledWith('symbol:BTC');
      expect(socket.leave).toHaveBeenCalledWith('symbol:ETH');
      expect(result.data.unsubscribed).toEqual(['BTC', 'ETH']);
    });

    it('빈 심볼 배열이면 빈 결과를 반환해야 한다', () => {
      const socket = createMockSocket('client-1');

      const result = gateway.handleUnsubscription(
        socket as never,
        { symbols: [] },
      );

      expect(socket.leave).not.toHaveBeenCalled();
      expect(result.data.unsubscribed).toEqual([]);
    });
  });

  describe('handlePriceUpdate', () => {
    it('시세 업데이트를 해당 심볼 Room에 브로드캐스트해야 한다', () => {
      const update: PriceUpdate = {
        exchange: 'upbit',
        symbol: 'BTC',
        price: 100000000,
        changeRate: 1.5,
        volume24h: 1234.56,
        timestamp: Date.now(),
      };

      gateway.handlePriceUpdate(update);

      expect(mockServer.to).toHaveBeenCalledWith('symbol:BTC');
      expect(mockServer._mockEmit).toHaveBeenCalledWith(
        WS_EVENTS.PRICE_UPDATE,
        update,
      );
    });

    it('server가 없으면 오류 없이 무시해야 한다', () => {
      (gateway as unknown as { server: unknown }).server = null;

      const update: PriceUpdate = {
        exchange: 'upbit',
        symbol: 'BTC',
        price: 100000000,
        changeRate: 1.5,
        volume24h: 1234.56,
        timestamp: Date.now(),
      };

      expect(() => gateway.handlePriceUpdate(update)).not.toThrow();
    });
  });

  describe('broadcastAlert', () => {
    it('특정 사용자의 Room에 알림을 전송해야 한다', () => {
      const walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
      const notification: AlertNotification = {
        alertId: 'alert-1',
        symbol: 'BTC',
        exchange: 'upbit',
        currency: 'KRW',
        condition: 'above',
        targetValue: 100000000,
        triggeredValue: 101000000,
        message: 'BTC가 목표 가격에 도달했습니다.',
        triggeredAt: new Date(),
      };

      gateway.broadcastAlert(walletAddress, notification);

      expect(mockServer.to).toHaveBeenCalledWith(
        `user:${walletAddress.toLowerCase()}`,
      );
      expect(mockServer._mockEmit).toHaveBeenCalledWith(
        WS_EVENTS.ALERT,
        notification,
      );
    });

    it('server가 없으면 오류 없이 무시해야 한다', () => {
      (gateway as unknown as { server: unknown }).server = null;

      expect(() =>
        gateway.broadcastAlert('0x1234', {
          alertId: 'alert-1',
          symbol: 'BTC',
          exchange: 'upbit',
          currency: 'KRW',
          condition: 'above',
          targetValue: 100000000,
          triggeredValue: 101000000,
          message: 'test',
          triggeredAt: new Date(),
        }),
      ).not.toThrow();
    });
  });
});
