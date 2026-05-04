/**
 * 실시간 시세 수신 훅 (useRealTimePrice)
 *
 * NestJS WebSocket Gateway(Socket.IO)에 연결하여 실시간 시세 데이터를 수신한다.
 * WebSocket 연결 실패 시 REST 폴링 모드로 자동 전환하는 폴백 로직을 포함한다.
 *
 * 주요 기능:
 * - Socket.IO 클라이언트를 통한 NestJS /price 네임스페이스 연결
 * - 심볼별 구독/구독해제 관리
 * - 수신된 PriceUpdate를 price-store에 반영
 * - WebSocket 연결 끊김 시 자동 재연결 (최대 5회, 지수 백오프)
 * - 재연결 실패 시 REST 폴링 모드로 자동 전환 (30초 간격)
 *
 * @see 요구사항 5.1 (마켓 페이지 시세 목록)
 * @see 요구사항 5.2 (실시간 시세 업데이트)
 * @see 요구사항 3.4 (김프 분석 실시간 업데이트)
 * @see 설계문서 6.2 Graceful Degradation (WebSocket -> 폴링 전환)
 */

'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { io, type Socket } from 'socket.io-client';

import type { ExchangeType, PriceUpdate } from '@bitscope/shared';
import {
  WS_MAX_RECONNECT_ATTEMPTS,
  DEFAULT_REFRESH_INTERVAL_MS,
  SUPPORTED_EXCHANGES,
} from '@bitscope/shared';

import { usePriceStore, type ConnectionStatus } from '@/store/price-store';
import { getWsBaseUrl } from '@/lib/api-url';

// ===== 상수 =====

/** Socket.IO 이벤트 이름 (서버 PriceGateway의 WS_EVENTS와 일치) */
const WS_EVENTS = {
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
  PRICE_UPDATE: 'price_update',
  ALERT: 'alert',
} as const;

/** 폴링 모드의 기본 간격 (밀리초) */
const POLLING_INTERVAL_MS = DEFAULT_REFRESH_INTERVAL_MS;

/** 폴링 모드에서 시세 조회에 사용할 Next.js Route Handler 엔드포인트 */
const TICKER_API_BASE = '/api/exchange';

// ===== 타입 정의 =====

/** useRealTimePrice 훅 옵션 */
export interface UseRealTimePriceOptions {
  /** 구독할 심볼 목록 (예: ["BTC", "ETH"]) */
  symbols: string[];
  /** 자동 연결 활성화 여부 (기본: true) */
  enabled?: boolean;
  /** 폴링 모드 간격 (밀리초, 기본: 30_000) */
  pollingInterval?: number;
}

/** useRealTimePrice 반환 타입 */
export interface UseRealTimePriceReturn {
  /** WebSocket 연결 상태 */
  connectionStatus: ConnectionStatus;
  /** 폴링 모드 활성화 여부 */
  isPollingMode: boolean;
  /** 재연결 시도 횟수 */
  reconnectAttempts: number;
  /** 마지막 오류 메시지 */
  lastError: string | null;
  /** 현재 구독 중인 심볼 목록 */
  subscribedSymbols: string[];
  /** 현재 활성 상태인지 여부 (WebSocket 또는 폴링) */
  isActive: boolean;
  /** 수동으로 재연결을 시도한다. */
  reconnect: () => void;
  /** 구독 심볼을 추가한다. */
  subscribe: (symbols: string[]) => void;
  /** 구독 심볼을 제거한다. */
  unsubscribe: (symbols: string[]) => void;
}

// ===== 폴링 모드 헬퍼 =====

/**
 * REST API를 통해 시세 데이터를 폴링한다.
 *
 * WebSocket 연결 실패 시 대체 수단으로 사용된다.
 * 각 거래소의 ticker Route Handler를 호출하여 시세를 조회한다.
 *
 * @param symbols 조회할 심볼 목록
 * @param updatePrices 가격 업데이트 함수
 */
async function pollTickers(
  symbols: string[],
  updatePrices: (updates: PriceUpdate[]) => void,
): Promise<void> {
  if (symbols.length === 0) return;

  const exchanges: ExchangeType[] = [...SUPPORTED_EXCHANGES];
  const allUpdates: PriceUpdate[] = [];

  // 각 거래소별로 병렬 조회
  const results = await Promise.allSettled(
    exchanges.map(async (exchange) => {
      const params = new URLSearchParams();
      for (const s of symbols) {
        params.append('symbols', s);
      }

      const url = `${TICKER_API_BASE}/${exchange}/ticker?${params.toString()}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });

      if (!res.ok) return [];

      const data = await res.json();

      // Route Handler의 ticker 응답을 PriceUpdate 형태로 변환
      if (data && Array.isArray(data.tickers)) {
        return data.tickers.map(
          (t: {
            exchange: ExchangeType;
            symbol: string;
            currentPrice: number;
            changeRate: number;
            volume24h: number;
            timestamp: number;
          }) => ({
            exchange: t.exchange ?? exchange,
            symbol: t.symbol,
            price: t.currentPrice,
            changeRate: t.changeRate,
            volume24h: t.volume24h,
            timestamp: t.timestamp ?? Date.now(),
          }),
        ) as PriceUpdate[];
      }

      return [];
    }),
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      allUpdates.push(...result.value);
    }
  }

  if (allUpdates.length > 0) {
    updatePrices(allUpdates);
  }
}

// ===== 훅 구현 =====

/**
 * 실시간 시세 수신 React 훅
 *
 * Socket.IO를 통해 NestJS PriceGateway에 연결하고, 지정된 심볼의
 * 실시간 시세를 수신하여 price-store에 반영한다.
 *
 * WebSocket 연결 실패 시 자동으로 REST 폴링 모드로 전환하며,
 * 주기적으로 WebSocket 재연결을 시도한다.
 *
 * @param options 훅 옵션
 * @returns 연결 상태, 폴링 모드, 구독 관리 함수 등
 *
 * @example
 * ```tsx
 * function MarketPage() {
 *   const { connectionStatus, isPollingMode } = useRealTimePrice({
 *     symbols: ['BTC', 'ETH', 'XRP'],
 *   });
 *
 *   const btcPrice = usePriceStore((s) => s.getPrice('upbit', 'BTC'));
 *
 *   return (
 *     <div>
 *       <span>연결: {connectionStatus}</span>
 *       {btcPrice && <span>BTC: {btcPrice.price.toLocaleString()}</span>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useRealTimePrice(
  options: UseRealTimePriceOptions,
): UseRealTimePriceReturn {
  const { symbols, enabled = true, pollingInterval = POLLING_INTERVAL_MS } = options;

  // Zustand store 액션
  const updatePrice = usePriceStore((s) => s.updatePrice);
  const updatePrices = usePriceStore((s) => s.updatePrices);
  const setConnectionStatus = usePriceStore((s) => s.setConnectionStatus);
  const setPollingMode = usePriceStore((s) => s.setPollingMode);
  const setReconnectAttempts = usePriceStore((s) => s.setReconnectAttempts);
  const setLastError = usePriceStore((s) => s.setLastError);
  const setSubscribedSymbols = usePriceStore((s) => s.setSubscribedSymbols);
  const addSubscribedSymbols = usePriceStore((s) => s.addSubscribedSymbols);
  const removeSubscribedSymbols = usePriceStore((s) => s.removeSubscribedSymbols);
  const resetAll = usePriceStore((s) => s.resetAll);

  // Zustand store 상태 (개별 셀렉터로 불필요한 리렌더링 방지)
  const connectionStatus = usePriceStore((s) => s.connectionStatus);
  const isPollingMode = usePriceStore((s) => s.isPollingMode);
  const reconnectAttempts = usePriceStore((s) => s.reconnectAttempts);
  const lastError = usePriceStore((s) => s.lastError);
  const subscribedSymbols = usePriceStore((s) => s.subscribedSymbols);
  const isActive = usePriceStore((s) => s.getIsActive());

  // 내부 참조
  const socketRef = useRef<Socket | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const symbolsRef = useRef<string[]>(symbols);
  const enabledRef = useRef(enabled);

  // symbols 참조를 최신 상태로 유지
  useEffect(() => {
    symbolsRef.current = symbols;
  }, [symbols]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // 안정적인 symbols 문자열 키 (의존성 비교용)
  const symbolsKey = useMemo(() => [...symbols].sort().join(','), [symbols]);

  /**
   * 폴링 모드를 시작한다.
   *
   * WebSocket 연결 실패 시 대체 수단으로
   * 주기적으로 REST API를 통해 시세를 조회한다.
   */
  const startPolling = useCallback(() => {
    // 이미 폴링 중이면 무시
    if (pollingTimerRef.current) return;

    setPollingMode(true);

    // 즉시 1회 폴링 실행
    pollTickers(symbolsRef.current, updatePrices);

    // 주기적 폴링 시작
    pollingTimerRef.current = setInterval(() => {
      pollTickers(symbolsRef.current, updatePrices);
    }, pollingInterval);
  }, [pollingInterval, setPollingMode, updatePrices]);

  /**
   * 폴링 모드를 중지한다.
   */
  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    setPollingMode(false);
  }, [setPollingMode]);

  /**
   * Socket.IO 연결을 생성하고 이벤트 핸들러를 등록한다.
   */
  const connectSocket = useCallback(() => {
    // 기존 소켓이 있으면 정리
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setConnectionStatus('connecting');
    setLastError(null);

    const wsUrl = getWsBaseUrl();

    const socket = io(`${wsUrl}/price`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: WS_MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 16000,
      timeout: 10000,
    });

    socketRef.current = socket;

    // 연결 성공
    socket.on('connect', () => {
      setConnectionStatus('connected');
      setReconnectAttempts(0);
      setLastError(null);

      // 폴링 모드에서 WebSocket 복귀 시 폴링 중지
      stopPolling();

      // 현재 심볼 구독
      const currentSymbols = symbolsRef.current;
      if (currentSymbols.length > 0) {
        socket.emit(WS_EVENTS.SUBSCRIBE, { symbols: currentSymbols });
        setSubscribedSymbols(currentSymbols);
      }
    });

    // 시세 업데이트 수신
    socket.on(WS_EVENTS.PRICE_UPDATE, (data: PriceUpdate) => {
      updatePrice(data);
    });

    // 연결 해제
    socket.on('disconnect', (reason) => {
      // 서버 측에서 의도적으로 연결을 끊은 경우
      if (reason === 'io server disconnect') {
        setConnectionStatus('disconnected');
        setLastError('서버에 의해 연결이 종료되었습니다.');
      } else {
        // 일시적 끊김 - Socket.IO가 자동 재연결 시도
        setConnectionStatus('reconnecting');
      }
    });

    // 재연결 시도
    socket.io.on('reconnect_attempt', (attempt) => {
      setConnectionStatus('reconnecting');
      setReconnectAttempts(attempt);
    });

    // 재연결 성공
    socket.io.on('reconnect', () => {
      setConnectionStatus('connected');
      setReconnectAttempts(0);
      setLastError(null);

      // 폴링 중이었다면 중지
      stopPolling();

      // 심볼 재구독
      const currentSymbols = symbolsRef.current;
      if (currentSymbols.length > 0) {
        socket.emit(WS_EVENTS.SUBSCRIBE, { symbols: currentSymbols });
      }
    });

    // 재연결 실패 (최대 시도 횟수 초과)
    socket.io.on('reconnect_failed', () => {
      setConnectionStatus('disconnected');
      setLastError(
        `WebSocket 재연결 실패 (${WS_MAX_RECONNECT_ATTEMPTS}회 시도). 폴링 모드로 전환합니다.`,
      );

      // 폴링 모드로 전환
      startPolling();
    });

    // 연결 오류
    socket.on('connect_error', (error) => {
      setLastError(`연결 오류: ${error.message}`);
    });

    return socket;
  }, [
    setConnectionStatus,
    setLastError,
    setReconnectAttempts,
    setSubscribedSymbols,
    updatePrice,
    stopPolling,
    startPolling,
  ]);

  /**
   * 수동으로 재연결을 시도한다.
   *
   * 현재 폴링 모드인 경우 WebSocket 연결을 다시 시도한다.
   */
  const reconnect = useCallback(() => {
    // 폴링 중지
    stopPolling();

    // 재연결 카운터 초기화
    setReconnectAttempts(0);
    setLastError(null);

    // 새 소켓 연결
    connectSocket();
  }, [stopPolling, setReconnectAttempts, setLastError, connectSocket]);

  /**
   * 심볼을 추가 구독한다.
   */
  const subscribe = useCallback(
    (newSymbols: string[]) => {
      if (newSymbols.length === 0) return;

      addSubscribedSymbols(newSymbols);

      if (socketRef.current?.connected) {
        socketRef.current.emit(WS_EVENTS.SUBSCRIBE, {
          symbols: newSymbols,
        });
      }
    },
    [addSubscribedSymbols],
  );

  /**
   * 심볼 구독을 해제한다.
   */
  const unsubscribe = useCallback(
    (removeSymbols: string[]) => {
      if (removeSymbols.length === 0) return;

      removeSubscribedSymbols(removeSymbols);

      if (socketRef.current?.connected) {
        socketRef.current.emit(WS_EVENTS.UNSUBSCRIBE, {
          symbols: removeSymbols,
        });
      }
    },
    [removeSubscribedSymbols],
  );

  // ===== 메인 Effect: Socket.IO 연결 및 정리 =====

  useEffect(() => {
    if (!enabled || symbols.length === 0) {
      // 비활성화 시 모든 연결/폴링 정리
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      stopPolling();
      setConnectionStatus('disconnected');
      return;
    }

    // Socket.IO 연결 시작
    connectSocket();

    // 클린업
    return () => {
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // ===== 심볼 변경 감지 Effect =====

  useEffect(() => {
    if (!enabled || symbols.length === 0) return;

    const socket = socketRef.current;
    if (!socket?.connected) {
      // 소켓이 연결되어 있지 않으면 symbolsRef만 업데이트
      // (연결 시 자동으로 구독됨)
      return;
    }

    // 현재 구독 중인 심볼과 비교하여 변경분만 처리
    const currentSet = new Set(subscribedSymbols);
    const newSet = new Set(symbols);

    // 새로 구독할 심볼
    const toSubscribe = symbols.filter((s) => !currentSet.has(s));
    // 구독 해제할 심볼
    const toUnsubscribe = subscribedSymbols.filter((s) => !newSet.has(s));

    if (toUnsubscribe.length > 0) {
      socket.emit(WS_EVENTS.UNSUBSCRIBE, { symbols: toUnsubscribe });
    }

    if (toSubscribe.length > 0) {
      socket.emit(WS_EVENTS.SUBSCRIBE, { symbols: toSubscribe });
    }

    setSubscribedSymbols(symbols);
    // symbolsKey를 의존성으로 사용하여 symbols 배열의 내용이 변경될 때만 실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey, enabled]);

  return {
    connectionStatus,
    isPollingMode,
    reconnectAttempts,
    lastError,
    subscribedSymbols,
    isActive,
    reconnect,
    subscribe,
    unsubscribe,
  };
}
