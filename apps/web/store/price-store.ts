/**
 * 실시간 가격 상태 저장소 (Zustand)
 *
 * NestJS WebSocket Gateway에서 수신한 실시간 시세 데이터를 관리한다.
 * 거래소+심볼 조합을 키로 사용하여 최신 가격 데이터를 유지하고,
 * 연결 상태 및 폴링 모드 전환 상태를 추적한다.
 *
 * @see 요구사항 5.1 (마켓 페이지 시세 목록)
 * @see 요구사항 5.2 (실시간 시세 업데이트)
 * @see 요구사항 3.4 (김프 분석 실시간 업데이트)
 * @see 설계문서 3.1.5 ExchangeApiClient
 */

import { create } from 'zustand';
import type { ExchangeType, PriceUpdate } from '@bitscope/shared';

// ===== 타입 정의 =====

/**
 * 개별 가격 항목
 *
 * 특정 거래소의 특정 심볼에 대한 최신 시세 데이터이다.
 */
export interface PriceEntry {
  /** 거래소 */
  exchange: ExchangeType;
  /** 코인 심볼 (예: "BTC") */
  symbol: string;
  /** 현재가 */
  price: number;
  /** 24시간 변동률 (%) */
  changeRate: number;
  /** 24시간 거래량 */
  volume24h: number;
  /** 거래소 측 타임스탬프 (밀리초) */
  timestamp: number;
  /** 클라이언트에서 수신한 시각 (밀리초) */
  receivedAt: number;
}

/** WebSocket 연결 상태 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/** 가격 키 (거래소:심볼) */
type PriceKey = `${ExchangeType}:${string}`;

/** 가격 저장소 상태 인터페이스 */
interface PriceState {
  // ===== 가격 데이터 =====

  /** 가격 맵: "거래소:심볼" -> PriceEntry */
  prices: Record<string, PriceEntry>;

  // ===== 연결 상태 =====

  /** WebSocket 연결 상태 */
  connectionStatus: ConnectionStatus;

  /** 폴링 모드 활성화 여부 (WebSocket 연결 실패 시 REST 폴링으로 전환) */
  isPollingMode: boolean;

  /** 재연결 시도 횟수 */
  reconnectAttempts: number;

  /** 마지막 연결 오류 메시지 */
  lastError: string | null;

  // ===== 구독 관리 =====

  /** 현재 구독 중인 심볼 목록 */
  subscribedSymbols: string[];

  // ===== 액션 =====

  /**
   * 시세 업데이트를 반영한다.
   *
   * NestJS WebSocket Gateway에서 수신한 PriceUpdate를 저장소에 저장한다.
   */
  updatePrice: (update: PriceUpdate) => void;

  /**
   * 여러 시세 업데이트를 한번에 반영한다.
   *
   * 폴링 모드에서 여러 시세를 동시에 업데이트할 때 사용한다.
   */
  updatePrices: (updates: PriceUpdate[]) => void;

  /** WebSocket 연결 상태를 변경한다. */
  setConnectionStatus: (status: ConnectionStatus) => void;

  /** 폴링 모드 여부를 설정한다. */
  setPollingMode: (isPolling: boolean) => void;

  /** 재연결 시도 횟수를 설정한다. */
  setReconnectAttempts: (attempts: number) => void;

  /** 마지막 오류 메시지를 설정한다. */
  setLastError: (error: string | null) => void;

  /** 구독 중인 심볼 목록을 설정한다. */
  setSubscribedSymbols: (symbols: string[]) => void;

  /** 구독 심볼을 추가한다. */
  addSubscribedSymbols: (symbols: string[]) => void;

  /** 구독 심볼을 제거한다. */
  removeSubscribedSymbols: (symbols: string[]) => void;

  /** 모든 가격 데이터를 초기화한다. */
  resetPrices: () => void;

  /** 전체 상태를 초기화한다 (연결 해제 시). */
  resetAll: () => void;

  // ===== 셀렉터 =====

  /**
   * 특정 거래소+심볼의 가격 항목을 조회한다.
   *
   * @param exchange 거래소
   * @param symbol 코인 심볼
   * @returns 가격 항목 또는 null
   */
  getPrice: (exchange: ExchangeType, symbol: string) => PriceEntry | null;

  /**
   * 특정 심볼의 모든 거래소 가격을 조회한다.
   *
   * @param symbol 코인 심볼
   * @returns 거래소별 가격 항목 배열
   */
  getPricesBySymbol: (symbol: string) => PriceEntry[];

  /**
   * 특정 거래소의 모든 가격을 조회한다.
   *
   * @param exchange 거래소
   * @returns 해당 거래소의 가격 항목 배열
   */
  getPricesByExchange: (exchange: ExchangeType) => PriceEntry[];

  /**
   * 현재 연결이 활성 상태인지 확인한다.
   * (WebSocket 연결 또는 폴링 모드 중 하나라도 활성이면 true)
   */
  getIsActive: () => boolean;
}

// ===== 헬퍼 함수 =====

/** 거래소+심볼 조합 키를 생성한다. */
function makePriceKey(exchange: ExchangeType, symbol: string): PriceKey {
  return `${exchange}:${symbol}`;
}

/** PriceUpdate를 PriceEntry로 변환한다. */
function toPriceEntry(update: PriceUpdate): PriceEntry {
  return {
    exchange: update.exchange,
    symbol: update.symbol,
    price: update.price,
    changeRate: update.changeRate,
    volume24h: update.volume24h,
    timestamp: update.timestamp,
    receivedAt: Date.now(),
  };
}

// ===== Zustand 저장소 =====

/**
 * 실시간 가격 Zustand 저장소
 *
 * WebSocket 또는 폴링으로 수신한 실시간 시세 데이터를 관리한다.
 * useRealTimePrice 훅과 함께 사용하여 컴포넌트에 가격 데이터를 제공한다.
 *
 * @example
 * ```tsx
 * function PriceDisplay({ symbol }: { symbol: string }) {
 *   const { getPrice, connectionStatus } = usePriceStore();
 *   const price = getPrice('upbit', symbol);
 *
 *   if (!price) return <span>--</span>;
 *   return <span>{price.price.toLocaleString()} KRW</span>;
 * }
 * ```
 */
export const usePriceStore = create<PriceState>((set, get) => ({
  // 초기 상태
  prices: {},
  connectionStatus: 'disconnected',
  isPollingMode: false,
  reconnectAttempts: 0,
  lastError: null,
  subscribedSymbols: [],

  // ===== 액션 =====

  updatePrice: (update) => {
    const key = makePriceKey(update.exchange, update.symbol);
    const entry = toPriceEntry(update);

    set((state) => ({
      prices: {
        ...state.prices,
        [key]: entry,
      },
    }));
  },

  updatePrices: (updates) => {
    if (updates.length === 0) return;

    set((state) => {
      const newPrices = { ...state.prices };
      for (const update of updates) {
        const key = makePriceKey(update.exchange, update.symbol);
        newPrices[key] = toPriceEntry(update);
      }
      return { prices: newPrices };
    });
  },

  setConnectionStatus: (status) => {
    set({ connectionStatus: status });
  },

  setPollingMode: (isPolling) => {
    set({ isPollingMode: isPolling });
  },

  setReconnectAttempts: (attempts) => {
    set({ reconnectAttempts: attempts });
  },

  setLastError: (error) => {
    set({ lastError: error });
  },

  setSubscribedSymbols: (symbols) => {
    set({ subscribedSymbols: [...symbols] });
  },

  addSubscribedSymbols: (symbols) => {
    set((state) => {
      const existing = new Set(state.subscribedSymbols);
      for (const s of symbols) {
        existing.add(s);
      }
      return { subscribedSymbols: Array.from(existing) };
    });
  },

  removeSubscribedSymbols: (symbols) => {
    set((state) => {
      const toRemove = new Set(symbols);
      return {
        subscribedSymbols: state.subscribedSymbols.filter(
          (s) => !toRemove.has(s),
        ),
      };
    });
  },

  resetPrices: () => {
    set({ prices: {} });
  },

  resetAll: () => {
    set({
      prices: {},
      connectionStatus: 'disconnected',
      isPollingMode: false,
      reconnectAttempts: 0,
      lastError: null,
      subscribedSymbols: [],
    });
  },

  // ===== 셀렉터 =====

  getPrice: (exchange, symbol) => {
    const key = makePriceKey(exchange, symbol);
    return get().prices[key] ?? null;
  },

  getPricesBySymbol: (symbol) => {
    const { prices } = get();
    const entries: PriceEntry[] = [];

    for (const [key, entry] of Object.entries(prices)) {
      if (key.endsWith(`:${symbol}`)) {
        entries.push(entry);
      }
    }

    return entries;
  },

  getPricesByExchange: (exchange) => {
    const { prices } = get();
    const entries: PriceEntry[] = [];

    for (const [key, entry] of Object.entries(prices)) {
      if (key.startsWith(`${exchange}:`)) {
        entries.push(entry);
      }
    }

    return entries;
  },

  getIsActive: () => {
    const { connectionStatus, isPollingMode } = get();
    return connectionStatus === 'connected' || isPollingMode;
  },
}));
