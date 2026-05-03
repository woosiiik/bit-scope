/**
 * 워치리스트(관심 코인) 관리 훅 (useWatchlist)
 *
 * 관심 코인 추가/제거, 목록 조회 기능을 제공한다.
 * 데이터는 localStorage에 지갑 주소별로 분리 저장되어
 * 계정 간 데이터가 격리된다.
 *
 * 주요 기능:
 * - 관심 코인 추가/제거 (localStorage 저장)
 * - 관심 코인 목록 조회
 * - 특정 코인의 관심 여부 확인
 * - 관심 코인 가격 알림 설정 연동을 위한 인터페이스
 *
 * @see 요구사항 10.1 (관심 코인 추가 시 워치리스트 저장 및 표시)
 * @see 요구사항 10.2 (현재가, 24시간 변동률, 거래량 실시간 업데이트)
 * @see 요구사항 10.3 (관심 코인 가격 알림 설정)
 * @see 요구사항 10.4 (워치리스트에서 코인 제거)
 * @see 설계문서 4.3 localStorage 데이터 구조
 */

'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';

import type { WatchlistItem, AlertConfig } from '@bitscope/shared';

// ===== 상수 =====

/**
 * localStorage 키 접두사
 *
 * 지갑 주소별로 분리 저장되며,
 * 키 형식은 `bitscope:{walletAddress}:watchlist` 이다.
 */
function getStorageKey(walletAddress: string): string {
  return `bitscope:${walletAddress.toLowerCase()}:watchlist`;
}

// ===== localStorage 직렬화 형식 =====

/**
 * localStorage에 저장되는 워치리스트 항목의 직렬화 형태
 *
 * Date 객체는 ISO 8601 문자열로 변환된다.
 */
interface SerializedWatchlistItem {
  symbol: string;
  addedAt: string; // ISO 8601
  alertConfigs: AlertConfig[];
}

// ===== localStorage 헬퍼 =====

/**
 * localStorage에서 워치리스트를 로드한다.
 *
 * @param walletAddress 지갑 주소
 * @returns 워치리스트 항목 배열 또는 빈 배열
 */
function loadWatchlistFromStorage(walletAddress: string): WatchlistItem[] {
  if (typeof window === 'undefined') return [];

  try {
    const key = getStorageKey(walletAddress);
    const raw = localStorage.getItem(key);
    if (!raw) return [];

    const parsed: SerializedWatchlistItem[] = JSON.parse(raw);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => typeof item.symbol === 'string' && item.symbol.trim() !== '')
      .map((item) => ({
        symbol: item.symbol.toUpperCase(),
        addedAt: new Date(item.addedAt),
        alertConfigs: Array.isArray(item.alertConfigs) ? item.alertConfigs : [],
      }));
  } catch {
    return [];
  }
}

/**
 * localStorage에 워치리스트를 저장한다.
 *
 * @param walletAddress 지갑 주소
 * @param items 워치리스트 항목 배열
 */
function saveWatchlistToStorage(walletAddress: string, items: WatchlistItem[]): void {
  if (typeof window === 'undefined') return;

  try {
    const key = getStorageKey(walletAddress);
    const serialized: SerializedWatchlistItem[] = items.map((item) => ({
      symbol: item.symbol,
      addedAt: item.addedAt.toISOString(),
      alertConfigs: item.alertConfigs,
    }));
    localStorage.setItem(key, JSON.stringify(serialized));
  } catch {
    // localStorage 용량 초과 등의 오류는 무시
  }
}

// ===== 타입 정의 =====

/** useWatchlist 훅 옵션 */
export interface UseWatchlistOptions {
  /** 지갑 주소 (필수) */
  walletAddress: string;
}

/** useWatchlist 반환 타입 */
export interface UseWatchlistReturn {
  /** 워치리스트 항목 목록 */
  watchlist: WatchlistItem[];
  /** 워치리스트 심볼 목록 (편의용) */
  watchlistSymbols: string[];
  /** 워치리스트에 코인을 추가한다. */
  addCoin: (symbol: string) => void;
  /** 워치리스트에서 코인을 제거한다. */
  removeCoin: (symbol: string) => void;
  /** 특정 코인이 워치리스트에 포함되어 있는지 확인한다. */
  isInWatchlist: (symbol: string) => boolean;
  /** 워치리스트의 코인 수를 반환한다. */
  count: number;
  /** 워치리스트 토글 (있으면 제거, 없으면 추가) */
  toggleCoin: (symbol: string) => void;
  /** 특정 코인의 알림 설정을 업데이트한다. */
  updateAlertConfigs: (symbol: string, configs: AlertConfig[]) => void;
}

// ===== 훅 구현 =====

/**
 * 워치리스트(관심 코인) 관리 React 훅
 *
 * localStorage에 지갑 주소별로 관심 코인 목록을 저장하고 관리한다.
 * 코인 추가/제거, 목록 조회, 알림 설정 연동 기능을 제공한다.
 *
 * @param options 훅 옵션
 * @returns 워치리스트 데이터 및 관리 함수
 *
 * @example
 * ```tsx
 * function WatchlistPage() {
 *   const { wallet } = useWalletAuth();
 *   const { watchlist, addCoin, removeCoin, isInWatchlist } = useWatchlist({
 *     walletAddress: wallet.address,
 *   });
 *
 *   return (
 *     <div>
 *       {watchlist.map((item) => (
 *         <div key={item.symbol}>
 *           <span>{item.symbol}</span>
 *           <button onClick={() => removeCoin(item.symbol)}>제거</button>
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 *
 * @see 요구사항 10.1 (관심 코인 추가/저장/표시)
 * @see 요구사항 10.4 (관심 코인 제거)
 */
export function useWatchlist(options: UseWatchlistOptions): UseWatchlistReturn {
  const { walletAddress } = options;

  // 워치리스트 상태
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);

  // 초기 로드: 지갑 주소 변경 시 localStorage에서 워치리스트를 다시 로드한다.
  useEffect(() => {
    if (!walletAddress) {
      setWatchlist([]);
      return;
    }

    const items = loadWatchlistFromStorage(walletAddress);
    setWatchlist(items);
  }, [walletAddress]);

  // 워치리스트 심볼 목록 (편의용 메모이즈드 배열)
  const watchlistSymbols = useMemo(
    () => watchlist.map((item) => item.symbol),
    [watchlist],
  );

  // 워치리스트 심볼 Set (빠른 lookup)
  const watchlistSet = useMemo(
    () => new Set(watchlistSymbols),
    [watchlistSymbols],
  );

  /**
   * 워치리스트에 코인을 추가한다.
   *
   * 이미 존재하는 코인은 무시한다.
   *
   * @param symbol 코인 심볼 (예: "BTC")
   * @see 요구사항 10.1 (관심 목록에 추가/저장)
   */
  const addCoin = useCallback(
    (symbol: string) => {
      if (!walletAddress) return;

      const normalizedSymbol = symbol.toUpperCase();
      setWatchlist((prev) => {
        // 이미 존재하면 무시
        if (prev.some((item) => item.symbol === normalizedSymbol)) {
          return prev;
        }

        const newItem: WatchlistItem = {
          symbol: normalizedSymbol,
          addedAt: new Date(),
          alertConfigs: [],
        };

        const updated = [...prev, newItem];
        saveWatchlistToStorage(walletAddress, updated);
        return updated;
      });
    },
    [walletAddress],
  );

  /**
   * 워치리스트에서 코인을 제거한다.
   *
   * @param symbol 코인 심볼 (예: "BTC")
   * @see 요구사항 10.4 (관심 목록에서 코인 제거)
   */
  const removeCoin = useCallback(
    (symbol: string) => {
      if (!walletAddress) return;

      const normalizedSymbol = symbol.toUpperCase();
      setWatchlist((prev) => {
        const updated = prev.filter((item) => item.symbol !== normalizedSymbol);
        saveWatchlistToStorage(walletAddress, updated);
        return updated;
      });
    },
    [walletAddress],
  );

  /**
   * 특정 코인이 워치리스트에 포함되어 있는지 확인한다.
   *
   * @param symbol 코인 심볼
   * @returns 포함 여부
   */
  const isInWatchlist = useCallback(
    (symbol: string): boolean => {
      return watchlistSet.has(symbol.toUpperCase());
    },
    [watchlistSet],
  );

  /**
   * 워치리스트 토글 (있으면 제거, 없으면 추가)
   *
   * @param symbol 코인 심볼
   */
  const toggleCoin = useCallback(
    (symbol: string) => {
      if (isInWatchlist(symbol)) {
        removeCoin(symbol);
      } else {
        addCoin(symbol);
      }
    },
    [isInWatchlist, removeCoin, addCoin],
  );

  /**
   * 특정 코인의 알림 설정을 업데이트한다.
   *
   * @param symbol 코인 심볼
   * @param configs 업데이트할 알림 설정 배열
   * @see 요구사항 10.3 (관심 코인 가격 알림 설정)
   */
  const updateAlertConfigs = useCallback(
    (symbol: string, configs: AlertConfig[]) => {
      if (!walletAddress) return;

      const normalizedSymbol = symbol.toUpperCase();
      setWatchlist((prev) => {
        const updated = prev.map((item) =>
          item.symbol === normalizedSymbol
            ? { ...item, alertConfigs: configs }
            : item,
        );
        saveWatchlistToStorage(walletAddress, updated);
        return updated;
      });
    },
    [walletAddress],
  );

  return {
    watchlist,
    watchlistSymbols,
    addCoin,
    removeCoin,
    isInWatchlist,
    count: watchlist.length,
    toggleCoin,
    updateAlertConfigs,
  };
}
