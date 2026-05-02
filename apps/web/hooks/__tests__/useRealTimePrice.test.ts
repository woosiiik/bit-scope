/**
 * 실시간 시세 수신 훅 단위 테스트
 *
 * useRealTimePrice 훅의 Socket.IO 연결 관리,
 * 심볼 구독/해제, 폴링 모드 전환 로직을 검증한다.
 *
 * Socket.IO 클라이언트를 모킹하여 테스트한다.
 *
 * @see 요구사항 5.1, 5.2 (실시간 시세 업데이트)
 * @see 요구사항 3.4 (김프 분석 실시간 업데이트)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePriceStore } from '@/store/price-store';

// ===== Socket.IO 모킹 =====

/**
 * Socket.IO Manager의 이벤트 핸들러를 관리하는 모의 객체
 */
const mockManagerHandlers = new Map<string, Set<(...args: unknown[]) => void>>();

/**
 * Socket 이벤트 핸들러를 관리하는 모의 객체
 */
const mockSocketHandlers = new Map<string, Set<(...args: unknown[]) => void>>();

/** 모의 Socket.IO Manager (socket.io) */
const mockManager = {
  on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    if (!mockManagerHandlers.has(event)) {
      mockManagerHandlers.set(event, new Set());
    }
    mockManagerHandlers.get(event)!.add(handler);
    return mockManager;
  }),
  off: vi.fn((event: string, handler?: (...args: unknown[]) => void) => {
    if (handler) {
      mockManagerHandlers.get(event)?.delete(handler);
    } else {
      mockManagerHandlers.delete(event);
    }
    return mockManager;
  }),
};

/** 모의 Socket.IO 소켓 */
const mockSocket = {
  connected: false,
  id: 'test-socket-id',
  io: mockManager,
  on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    if (!mockSocketHandlers.has(event)) {
      mockSocketHandlers.set(event, new Set());
    }
    mockSocketHandlers.get(event)!.add(handler);
    return mockSocket;
  }),
  off: vi.fn(),
  emit: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  removeAllListeners: vi.fn(() => {
    mockSocketHandlers.clear();
    return mockSocket;
  }),
};

/** 소켓에 등록된 이벤트를 시뮬레이션 발화한다. */
function emitSocketEvent(event: string, ...args: unknown[]) {
  const handlers = mockSocketHandlers.get(event);
  if (handlers) {
    for (const handler of handlers) {
      handler(...args);
    }
  }
}

/** Manager에 등록된 이벤트를 시뮬레이션 발화한다. */
function emitManagerEvent(event: string, ...args: unknown[]) {
  const handlers = mockManagerHandlers.get(event);
  if (handlers) {
    for (const handler of handlers) {
      handler(...args);
    }
  }
}

/** io 함수의 호출 횟수를 추적하는 카운터 */
let ioCallCount = 0;

/** io 함수에 전달된 인자를 저장하는 배열 */
let ioCallArgs: unknown[][] = [];

// socket.io-client 모듈 모킹
vi.mock('socket.io-client', () => ({
  io: vi.fn((...args: unknown[]) => {
    ioCallCount++;
    ioCallArgs.push(args);
    return mockSocket;
  }),
}));

// useRealTimePrice 훅 import (모킹 후)
import { useRealTimePrice } from '../useRealTimePrice';

beforeEach(() => {
  // 모든 모의 객체 초기화
  vi.clearAllMocks();
  mockSocketHandlers.clear();
  mockManagerHandlers.clear();
  mockSocket.connected = false;
  ioCallCount = 0;
  ioCallArgs = [];

  // 가격 저장소 초기화
  usePriceStore.setState({
    prices: {},
    connectionStatus: 'disconnected',
    isPollingMode: false,
    reconnectAttempts: 0,
    lastError: null,
    subscribedSymbols: [],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useRealTimePrice', () => {
  describe('초기 연결', () => {
    it('enabled=true이고 심볼이 있으면 Socket.IO에 연결해야 한다', () => {
      renderHook(() =>
        useRealTimePrice({
          symbols: ['BTC', 'ETH'],
          enabled: true,
        }),
      );

      // io가 호출되었는지 확인
      expect(ioCallCount).toBeGreaterThanOrEqual(1);

      // /price 네임스페이스로 호출되었는지 확인
      const lastArgs = ioCallArgs[ioCallArgs.length - 1]!;
      expect(lastArgs[0]).toContain('/price');

      // 옵션에 websocket과 reconnection이 포함되어 있는지 확인
      const options = lastArgs[1] as Record<string, unknown>;
      expect(options.transports).toEqual(['websocket', 'polling']);
      expect(options.reconnection).toBe(true);
    });

    it('enabled=false이면 연결하지 않아야 한다', () => {
      renderHook(() =>
        useRealTimePrice({
          symbols: ['BTC'],
          enabled: false,
        }),
      );

      expect(ioCallCount).toBe(0);
    });

    it('심볼이 빈 배열이면 연결하지 않아야 한다', () => {
      renderHook(() =>
        useRealTimePrice({
          symbols: [],
          enabled: true,
        }),
      );

      expect(ioCallCount).toBe(0);
    });
  });

  describe('연결 성공', () => {
    it('connect 이벤트 시 상태를 connected로 변경해야 한다', () => {
      const { result } = renderHook(() =>
        useRealTimePrice({
          symbols: ['BTC', 'ETH'],
        }),
      );

      // 연결 시뮬레이션
      act(() => {
        mockSocket.connected = true;
        emitSocketEvent('connect');
      });

      expect(result.current.connectionStatus).toBe('connected');
    });

    it('connect 시 심볼을 구독해야 한다', () => {
      renderHook(() =>
        useRealTimePrice({
          symbols: ['BTC', 'ETH'],
        }),
      );

      // 연결 시뮬레이션
      act(() => {
        mockSocket.connected = true;
        emitSocketEvent('connect');
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('subscribe', {
        symbols: ['BTC', 'ETH'],
      });
    });

    it('connect 시 재연결 횟수를 0으로 리셋해야 한다', () => {
      usePriceStore.getState().setReconnectAttempts(3);

      const { result } = renderHook(() =>
        useRealTimePrice({
          symbols: ['BTC'],
        }),
      );

      act(() => {
        mockSocket.connected = true;
        emitSocketEvent('connect');
      });

      expect(result.current.reconnectAttempts).toBe(0);
    });
  });

  describe('시세 수신', () => {
    it('price_update 이벤트 수신 시 price store를 업데이트해야 한다', () => {
      renderHook(() =>
        useRealTimePrice({
          symbols: ['BTC'],
        }),
      );

      // 연결
      act(() => {
        mockSocket.connected = true;
        emitSocketEvent('connect');
      });

      // 시세 업데이트 수신
      act(() => {
        emitSocketEvent('price_update', {
          exchange: 'upbit',
          symbol: 'BTC',
          price: 55000000,
          changeRate: 2.5,
          volume24h: 1234.56,
          timestamp: Date.now(),
        });
      });

      const price = usePriceStore.getState().getPrice('upbit', 'BTC');
      expect(price).not.toBeNull();
      expect(price!.price).toBe(55000000);
      expect(price!.changeRate).toBe(2.5);
    });
  });

  describe('연결 해제 처리', () => {
    it('서버 측 연결 종료 시 disconnected 상태로 변경해야 한다', () => {
      const { result } = renderHook(() =>
        useRealTimePrice({
          symbols: ['BTC'],
        }),
      );

      // 연결 -> 서버 측 연결 종료
      act(() => {
        mockSocket.connected = true;
        emitSocketEvent('connect');
      });

      act(() => {
        mockSocket.connected = false;
        emitSocketEvent('disconnect', 'io server disconnect');
      });

      expect(result.current.connectionStatus).toBe('disconnected');
    });

    it('일시적 끊김 시 reconnecting 상태로 변경해야 한다', () => {
      const { result } = renderHook(() =>
        useRealTimePrice({
          symbols: ['BTC'],
        }),
      );

      act(() => {
        mockSocket.connected = true;
        emitSocketEvent('connect');
      });

      act(() => {
        mockSocket.connected = false;
        emitSocketEvent('disconnect', 'transport close');
      });

      expect(result.current.connectionStatus).toBe('reconnecting');
    });
  });

  describe('재연결', () => {
    it('reconnect_attempt 이벤트 시 재연결 횟수를 추적해야 한다', () => {
      const { result } = renderHook(() =>
        useRealTimePrice({
          symbols: ['BTC'],
        }),
      );

      act(() => {
        emitManagerEvent('reconnect_attempt', 3);
      });

      expect(result.current.reconnectAttempts).toBe(3);
      expect(result.current.connectionStatus).toBe('reconnecting');
    });

    it('reconnect 성공 시 connected 상태로 변경해야 한다', () => {
      const { result } = renderHook(() =>
        useRealTimePrice({
          symbols: ['BTC'],
        }),
      );

      // 재연결 중
      act(() => {
        emitManagerEvent('reconnect_attempt', 2);
      });

      // 재연결 성공
      act(() => {
        mockSocket.connected = true;
        emitManagerEvent('reconnect');
      });

      expect(result.current.connectionStatus).toBe('connected');
      expect(result.current.reconnectAttempts).toBe(0);
    });

    it('reconnect 성공 시 심볼을 재구독해야 한다', () => {
      renderHook(() =>
        useRealTimePrice({
          symbols: ['BTC', 'ETH'],
        }),
      );

      // 초기 연결 + 구독
      act(() => {
        mockSocket.connected = true;
        emitSocketEvent('connect');
      });

      // emit 호출 기록 초기화
      mockSocket.emit.mockClear();

      // 재연결 성공
      act(() => {
        emitManagerEvent('reconnect');
      });

      // 심볼 재구독 확인
      expect(mockSocket.emit).toHaveBeenCalledWith('subscribe', {
        symbols: ['BTC', 'ETH'],
      });
    });

    it('reconnect_failed 시 폴링 모드로 전환해야 한다', () => {
      const { result } = renderHook(() =>
        useRealTimePrice({
          symbols: ['BTC'],
        }),
      );

      act(() => {
        emitManagerEvent('reconnect_failed');
      });

      expect(result.current.connectionStatus).toBe('disconnected');
      expect(result.current.isPollingMode).toBe(true);
      expect(result.current.lastError).toBeTruthy();
    });
  });

  describe('오류 처리', () => {
    it('connect_error 이벤트 시 오류 메시지를 설정해야 한다', () => {
      const { result } = renderHook(() =>
        useRealTimePrice({
          symbols: ['BTC'],
        }),
      );

      act(() => {
        emitSocketEvent('connect_error', new Error('Connection refused'));
      });

      expect(result.current.lastError).toContain('Connection refused');
    });
  });

  describe('수동 재연결', () => {
    it('reconnect 함수 호출 시 재연결을 시도해야 한다', () => {
      const { result } = renderHook(() =>
        useRealTimePrice({
          symbols: ['BTC'],
        }),
      );

      // 초기 연결 호출 수 기록
      const initialCallCount = ioCallCount;

      // 수동 재연결
      act(() => {
        result.current.reconnect();
      });

      // io가 다시 호출되었는지 확인 (새 소켓 생성)
      expect(ioCallCount).toBeGreaterThan(initialCallCount);
    });
  });

  describe('구독 관리', () => {
    it('subscribe 함수로 심볼을 추가 구독해야 한다', () => {
      const { result } = renderHook(() =>
        useRealTimePrice({
          symbols: ['BTC'],
        }),
      );

      // 연결
      act(() => {
        mockSocket.connected = true;
        emitSocketEvent('connect');
      });

      mockSocket.emit.mockClear();

      // 추가 구독
      act(() => {
        result.current.subscribe(['ETH', 'XRP']);
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('subscribe', {
        symbols: ['ETH', 'XRP'],
      });
    });

    it('unsubscribe 함수로 심볼 구독을 해제해야 한다', () => {
      const { result } = renderHook(() =>
        useRealTimePrice({
          symbols: ['BTC', 'ETH'],
        }),
      );

      // 연결
      act(() => {
        mockSocket.connected = true;
        emitSocketEvent('connect');
      });

      mockSocket.emit.mockClear();

      // 구독 해제
      act(() => {
        result.current.unsubscribe(['ETH']);
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('unsubscribe', {
        symbols: ['ETH'],
      });
    });
  });

  describe('클린업', () => {
    it('언마운트 시 소켓을 정리해야 한다', () => {
      const { unmount } = renderHook(() =>
        useRealTimePrice({
          symbols: ['BTC'],
        }),
      );

      unmount();

      expect(mockSocket.removeAllListeners).toHaveBeenCalled();
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('반환 값', () => {
    it('초기 반환 값이 올바라야 한다', () => {
      const { result } = renderHook(() =>
        useRealTimePrice({
          symbols: ['BTC'],
        }),
      );

      // connectionStatus는 'connecting'일 수 있음 (연결 시도 중)
      expect(result.current.isPollingMode).toBe(false);
      expect(result.current.reconnectAttempts).toBe(0);
      expect(result.current.lastError).toBeNull();
      expect(typeof result.current.reconnect).toBe('function');
      expect(typeof result.current.subscribe).toBe('function');
      expect(typeof result.current.unsubscribe).toBe('function');
    });
  });
});
