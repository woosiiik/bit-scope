/**
 * 김치 프리미엄 훅 단위 테스트
 *
 * useKimchiPremium 훅(useTopPremiums, usePremium, usePremiumHistory)의
 * NestJS 프리미엄 API 호출, 데이터 변환, 오류 처리 로직을 검증한다.
 *
 * @see 요구사항 3.1 (3개 거래소 실시간 시세 비교 테이블)
 * @see 요구사항 3.2 (가격 차이 절대값, 백분율 계산)
 * @see 요구사항 3.4 (실시간 시세 업데이트)
 * @see 요구사항 3.6 (김프 추이 차트 24시간/7일/30일)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { KimchiPremiumData, KimchiPremiumHistory } from '@bitscope/shared';
import {
  useTopPremiums,
  usePremium,
  usePremiumHistory,
  premiumQueryKeys,
  type PremiumHistoryPeriod,
} from '../useKimchiPremium';

// ===== 모의 데이터 =====

/** 프리미엄 목록 모의 응답 데이터 */
const MOCK_TOP_PREMIUMS: KimchiPremiumData[] = [
  {
    symbol: 'BTC',
    prices: { upbit: 100_000_000, bithumb: 99_500_000, coinone: 99_800_000 },
    maxPrice: { exchange: 'upbit', price: 100_000_000 },
    minPrice: { exchange: 'bithumb', price: 99_500_000 },
    premiumAmount: 500_000,
    premiumRate: 0.5025,
    timestamp: Date.now(),
  },
  {
    symbol: 'ETH',
    prices: { upbit: 5_000_000, bithumb: 4_980_000, coinone: 4_990_000 },
    maxPrice: { exchange: 'upbit', price: 5_000_000 },
    minPrice: { exchange: 'bithumb', price: 4_980_000 },
    premiumAmount: 20_000,
    premiumRate: 0.4016,
    timestamp: Date.now(),
  },
];

/** 특정 코인 프리미엄 모의 응답 데이터 */
const MOCK_SINGLE_PREMIUM: KimchiPremiumData = {
  symbol: 'BTC',
  prices: { upbit: 100_000_000, bithumb: 99_500_000, coinone: 99_800_000 },
  maxPrice: { exchange: 'upbit', price: 100_000_000 },
  minPrice: { exchange: 'bithumb', price: 99_500_000 },
  premiumAmount: 500_000,
  premiumRate: 0.5025,
  timestamp: Date.now(),
};

/** 프리미엄 이력 모의 응답 데이터 (API 응답은 문자열 날짜) */
const MOCK_HISTORY_RESPONSE = [
  {
    symbol: 'BTC',
    upbitPrice: 100_000_000,
    bithumbPrice: 99_500_000,
    coinonePrice: 99_800_000,
    premiumRate: 0.5025,
    recordedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    symbol: 'BTC',
    upbitPrice: 100_200_000,
    bithumbPrice: 99_600_000,
    coinonePrice: 99_900_000,
    premiumRate: 0.6024,
    recordedAt: '2025-01-01T01:00:00.000Z',
  },
  {
    symbol: 'BTC',
    upbitPrice: 99_800_000,
    bithumbPrice: 99_700_000,
    coinonePrice: 99_750_000,
    premiumRate: 0.1002,
    recordedAt: '2025-01-01T02:00:00.000Z',
  },
];

// ===== fetch 모킹 =====

/** global fetch를 모킹한다. */
const mockFetch = vi.fn();

// ===== 테스트 헬퍼 =====

/**
 * TanStack Query Provider로 훅을 래핑하는 wrapper를 생성한다.
 */
function createQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

/**
 * 성공 응답을 반환하는 fetch 모킹 설정
 */
function mockFetchSuccess(data: unknown): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  });
}

/**
 * 실패 응답을 반환하는 fetch 모킹 설정
 */
function mockFetchError(status: number, statusText: string): void {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    statusText,
  });
}

// ===== 테스트 =====

describe('useKimchiPremium', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ----- 쿼리 키 팩토리 -----

  describe('premiumQueryKeys', () => {
    it('all 키를 올바르게 생성한다', () => {
      expect(premiumQueryKeys.all).toEqual(['premium']);
    });

    it('topPremiums 키를 기본 limit으로 생성한다', () => {
      expect(premiumQueryKeys.topPremiums()).toEqual(['premium', 'top', 20]);
    });

    it('topPremiums 키를 지정 limit으로 생성한다', () => {
      expect(premiumQueryKeys.topPremiums(15)).toEqual(['premium', 'top', 15]);
    });

    it('premium 키를 심볼과 함께 생성한다', () => {
      expect(premiumQueryKeys.premium('BTC')).toEqual([
        'premium',
        'current',
        'BTC',
      ]);
    });

    it('history 키를 심볼과 기간과 함께 생성한다', () => {
      expect(premiumQueryKeys.history('ETH', '7d')).toEqual([
        'premium',
        'history',
        'ETH',
        '7d',
      ]);
    });
  });

  // ----- useTopPremiums -----

  describe('useTopPremiums', () => {
    it('프리미엄 상위 목록을 정상적으로 조회한다', async () => {
      mockFetchSuccess(MOCK_TOP_PREMIUMS);

      const wrapper = createQueryWrapper();
      const { result } = renderHook(
        () => useTopPremiums({ limit: 10, refetchInterval: false as unknown as number }),
        { wrapper },
      );

      // 초기 로딩 상태
      expect(result.current.isLoading).toBe(true);

      // 데이터 로드 완료 대기
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toHaveLength(2);
      expect(result.current.data![0]!.symbol).toBe('BTC');
      expect(result.current.data![1]!.symbol).toBe('ETH');
    });

    it('기본 limit(20)으로 API를 호출한다', async () => {
      mockFetchSuccess([]);

      const wrapper = createQueryWrapper();
      renderHook(
        () => useTopPremiums({ refetchInterval: false as unknown as number }),
        { wrapper },
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('limit=20');
    });

    it('지정된 limit으로 API를 호출한다', async () => {
      mockFetchSuccess([]);

      const wrapper = createQueryWrapper();
      renderHook(
        () => useTopPremiums({ limit: 5, refetchInterval: false as unknown as number }),
        { wrapper },
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('limit=5');
    });

    it('API 오류 시 에러 상태를 반환한다', async () => {
      // retry: 2 설정이 훅에 있으므로 3번 실패해야 에러 상태가 된다
      mockFetchError(500, 'Internal Server Error');
      mockFetchError(500, 'Internal Server Error');
      mockFetchError(500, 'Internal Server Error');

      const wrapper = createQueryWrapper();
      const { result } = renderHook(
        () => useTopPremiums({ refetchInterval: false as unknown as number }),
        { wrapper },
      );

      await waitFor(
        () => {
          expect(result.current.isError).toBe(true);
        },
        { timeout: 5000 },
      );

      expect(result.current.error).toBeDefined();
      expect(result.current.error!.message).toContain('프리미엄 목록 조회 실패');
    });

    it('enabled가 false이면 API를 호출하지 않는다', async () => {
      const wrapper = createQueryWrapper();
      const { result } = renderHook(
        () => useTopPremiums({ enabled: false }),
        { wrapper },
      );

      // 로딩이 시작되지 않아야 한다 (fetchStatus가 'idle')
      expect(result.current.fetchStatus).toBe('idle');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('프리미엄 데이터의 필드가 올바른 타입으로 반환된다', async () => {
      mockFetchSuccess(MOCK_TOP_PREMIUMS);

      const wrapper = createQueryWrapper();
      const { result } = renderHook(
        () => useTopPremiums({ refetchInterval: false as unknown as number }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.data).toBeDefined();
      });

      const btcData = result.current.data![0]!;
      expect(typeof btcData.symbol).toBe('string');
      expect(typeof btcData.premiumRate).toBe('number');
      expect(typeof btcData.premiumAmount).toBe('number');
      expect(typeof btcData.timestamp).toBe('number');
      expect(btcData.prices).toBeDefined();
      expect(btcData.maxPrice).toBeDefined();
      expect(btcData.minPrice).toBeDefined();
    });
  });

  // ----- usePremium -----

  describe('usePremium', () => {
    it('특정 코인의 프리미엄을 정상적으로 조회한다', async () => {
      mockFetchSuccess(MOCK_SINGLE_PREMIUM);

      const wrapper = createQueryWrapper();
      const { result } = renderHook(
        () => usePremium({ symbol: 'BTC', refetchInterval: false as unknown as number }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.data).toBeDefined();
      });

      expect(result.current.data!.symbol).toBe('BTC');
      expect(result.current.data!.premiumRate).toBe(0.5025);
      expect(result.current.data!.maxPrice.exchange).toBe('upbit');
      expect(result.current.data!.minPrice.exchange).toBe('bithumb');
    });

    it('심볼을 URL 경로에 포함하여 호출한다', async () => {
      mockFetchSuccess(MOCK_SINGLE_PREMIUM);

      const wrapper = createQueryWrapper();
      renderHook(
        () => usePremium({ symbol: 'ETH', refetchInterval: false as unknown as number }),
        { wrapper },
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('/premium/ETH');
    });

    it('404 응답 시 null을 반환한다', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const wrapper = createQueryWrapper();
      const { result } = renderHook(
        () => usePremium({ symbol: 'UNKNOWN', refetchInterval: false as unknown as number }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toBeNull();
    });

    it('빈 심볼이면 쿼리를 실행하지 않는다', async () => {
      const wrapper = createQueryWrapper();
      const { result } = renderHook(
        () => usePremium({ symbol: '' }),
        { wrapper },
      );

      expect(result.current.fetchStatus).toBe('idle');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('enabled가 false이면 API를 호출하지 않는다', async () => {
      const wrapper = createQueryWrapper();
      renderHook(
        () => usePremium({ symbol: 'BTC', enabled: false }),
        { wrapper },
      );

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ----- usePremiumHistory -----

  describe('usePremiumHistory', () => {
    it('프리미엄 이력을 정상적으로 조회한다', async () => {
      mockFetchSuccess(MOCK_HISTORY_RESPONSE);

      const wrapper = createQueryWrapper();
      const { result } = renderHook(
        () => usePremiumHistory({ symbol: 'BTC', period: '24h' }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.data).toBeDefined();
      });

      expect(result.current.data).toHaveLength(3);
    });

    it('recordedAt 문자열을 Date 객체로 변환한다', async () => {
      mockFetchSuccess(MOCK_HISTORY_RESPONSE);

      const wrapper = createQueryWrapper();
      const { result } = renderHook(
        () => usePremiumHistory({ symbol: 'BTC', period: '24h' }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.data).toBeDefined();
      });

      const firstItem = result.current.data![0]!;
      expect(firstItem.recordedAt).toBeInstanceOf(Date);
      expect(firstItem.recordedAt.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    });

    it('24h 기간으로 API를 호출한다', async () => {
      mockFetchSuccess(MOCK_HISTORY_RESPONSE);

      const wrapper = createQueryWrapper();
      renderHook(
        () => usePremiumHistory({ symbol: 'BTC', period: '24h' }),
        { wrapper },
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('/premium/BTC/history');
      expect(calledUrl).toContain('period=24h');
    });

    it('7d 기간으로 API를 호출한다', async () => {
      mockFetchSuccess([]);

      const wrapper = createQueryWrapper();
      renderHook(
        () => usePremiumHistory({ symbol: 'ETH', period: '7d' }),
        { wrapper },
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('/premium/ETH/history');
      expect(calledUrl).toContain('period=7d');
    });

    it('30d 기간으로 API를 호출한다', async () => {
      mockFetchSuccess([]);

      const wrapper = createQueryWrapper();
      renderHook(
        () => usePremiumHistory({ symbol: 'BTC', period: '30d' }),
        { wrapper },
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('period=30d');
    });

    it('이력 데이터의 수치 필드가 올바른 타입으로 반환된다', async () => {
      mockFetchSuccess(MOCK_HISTORY_RESPONSE);

      const wrapper = createQueryWrapper();
      const { result } = renderHook(
        () => usePremiumHistory({ symbol: 'BTC', period: '24h' }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.data).toBeDefined();
      });

      const item = result.current.data![0]!;
      expect(typeof item.upbitPrice).toBe('number');
      expect(typeof item.bithumbPrice).toBe('number');
      expect(typeof item.coinonePrice).toBe('number');
      expect(typeof item.premiumRate).toBe('number');
      expect(typeof item.symbol).toBe('string');
    });

    it('API 오류 시 에러 상태를 반환한다', async () => {
      // retry: 2 설정이 훅에 있으므로 3번 실패해야 에러 상태가 된다
      mockFetchError(500, 'Internal Server Error');
      mockFetchError(500, 'Internal Server Error');
      mockFetchError(500, 'Internal Server Error');

      const wrapper = createQueryWrapper();
      const { result } = renderHook(
        () => usePremiumHistory({ symbol: 'BTC', period: '24h' }),
        { wrapper },
      );

      await waitFor(
        () => {
          expect(result.current.isError).toBe(true);
        },
        { timeout: 5000 },
      );

      expect(result.current.error).toBeDefined();
      expect(result.current.error!.message).toContain('프리미엄 이력 조회 실패');
    });

    it('빈 심볼이면 쿼리를 실행하지 않는다', async () => {
      const wrapper = createQueryWrapper();
      const { result } = renderHook(
        () => usePremiumHistory({ symbol: '', period: '24h' }),
        { wrapper },
      );

      expect(result.current.fetchStatus).toBe('idle');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('enabled가 false이면 API를 호출하지 않는다', async () => {
      const wrapper = createQueryWrapper();
      renderHook(
        () => usePremiumHistory({ symbol: 'BTC', period: '24h', enabled: false }),
        { wrapper },
      );

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('빈 이력 배열을 정상적으로 처리한다', async () => {
      mockFetchSuccess([]);

      const wrapper = createQueryWrapper();
      const { result } = renderHook(
        () => usePremiumHistory({ symbol: 'BTC', period: '24h' }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.data).toBeDefined();
      });

      expect(result.current.data).toHaveLength(0);
    });
  });

  // ----- API URL 구성 -----

  describe('API URL 구성', () => {
    it('환경 변수가 없으면 기본 URL을 사용한다', async () => {
      // 기본적으로 window.location을 기반으로 URL을 구성함
      mockFetchSuccess([]);

      const wrapper = createQueryWrapper();
      renderHook(
        () => useTopPremiums({ refetchInterval: false as unknown as number }),
        { wrapper },
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      // URL에 /premium 경로가 포함되어야 한다
      expect(calledUrl).toContain('/premium');
    });

    it('프리미엄 API 경로가 올바르게 포함된다', async () => {
      mockFetchSuccess(MOCK_SINGLE_PREMIUM);

      const wrapper = createQueryWrapper();
      renderHook(
        () => usePremium({ symbol: 'BTC', refetchInterval: false as unknown as number }),
        { wrapper },
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toMatch(/\/premium\/BTC$/);
    });

    it('이력 API 경로가 올바르게 포함된다', async () => {
      mockFetchSuccess([]);

      const wrapper = createQueryWrapper();
      renderHook(
        () => usePremiumHistory({ symbol: 'ETH', period: '7d' }),
        { wrapper },
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toMatch(/\/premium\/ETH\/history\?period=7d$/);
    });
  });
});
