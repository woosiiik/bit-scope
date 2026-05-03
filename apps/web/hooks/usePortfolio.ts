/**
 * 포트폴리오 통합 조회 훅 (usePortfolio)
 *
 * 등록된 거래소를 병렬로 조회하고, 결과를 포트폴리오 저장소에 반영하며,
 * 자동 갱신(기본 30초) 및 수동 새로고침 기능을 제공한다.
 * 포트폴리오 조회 완료 시 NestJS 백엔드에 스냅샷을 비동기로 전송하여
 * DB에 이력을 축적한다.
 *
 * 핵심 흐름:
 * 1. useAllExchangeBalances로 등록된 모든 거래소의 잔고를 병렬 조회
 * 2. 조회 결과를 usePortfolioStore에 반영하여 통합 포트폴리오 생성
 * 3. 정렬/필터링은 store의 상태에 따라 자동으로 적용
 * 4. 포트폴리오 데이터 업데이트 시 useSnapshotSync를 통해 NestJS에 스냅샷 전송
 *
 * @see 요구사항 2.1 (통합 총 평가금액, 투자금액, 손익, 수익률)
 * @see 요구사항 2.4 (자동 갱신 기본 30초)
 * @see 요구사항 2.5 (수동 새로고침)
 * @see 요구사항 2.6 (특정 거래소 오류 시 나머지 정상 표시)
 * @see 요구사항 2.11 (거래소별 로딩 상태 개별 표시)
 * @see 요구사항 4.9 (클라이언트가 포트폴리오 스냅샷을 NestJS에 전송)
 * @see 요구사항 12.14, 12.15 (클라이언트 접속 시 스냅샷 축적)
 */

'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { ExchangeType, SortCriteria, HoldingFilter, MergedHolding, CoinSummary } from '@bitscope/shared';
import { usePortfolioStore, type ViewMode, type ExchangePortfolioState } from '@/store/portfolio-store';
import { useSettingsStore } from '@/store/settings-store';
import {
  useAllExchangeBalances,
  type UseAllExchangeBalancesReturn,
} from './useExchangeApi';
import { useSnapshotSync } from './useSnapshotSync';

// ===== 훅 옵션 =====

/** usePortfolio 훅 옵션 */
export interface UsePortfolioOptions {
  /** 지갑 주소 */
  walletAddress: string;
  /** 훅 활성화 여부 (기본: true) */
  enabled?: boolean;
}

/** usePortfolio 반환 타입 */
export interface UsePortfolioReturn {
  // ===== 통합 데이터 =====

  /** 총 평가금액 */
  totalEvaluation: number;
  /** 총 투자금액 */
  totalInvestment: number;
  /** 총 손익 */
  totalProfitLoss: number;
  /** 총 수익률 (%) */
  profitLossRate: number;
  /** 총 원화 잔고 */
  totalKrwBalance: number;

  /** 정렬/필터 적용된 MergedHolding 배열 */
  mergedHoldings: MergedHolding[];

  // ===== 거래소별 상태 =====

  /** 거래소별 포트폴리오 상태 맵 */
  exchangeStates: Partial<Record<ExchangeType, ExchangePortfolioState>>;

  // ===== 로딩 / 오류 상태 =====

  /** 전체 로딩 중 여부 (하나라도 로딩 중이면 true) */
  isLoading: boolean;
  /** 초기 로딩 중 여부 (데이터가 아직 없는 상태) */
  isInitialLoading: boolean;
  /** 거래소별 로딩 상태 맵 */
  loadingStates: Partial<Record<ExchangeType, boolean>>;
  /** 부분 오류 여부 */
  hasPartialError: boolean;
  /** 모든 거래소 오류 여부 */
  isAllError: boolean;
  /** 거래소별 오류 맵 */
  errors: Partial<Record<ExchangeType, string>>;
  /** 마지막 업데이트 시각 */
  lastUpdated: Date | null;

  // ===== UI 상태 =====

  /** 현재 뷰 모드 */
  viewMode: ViewMode;
  /** 현재 정렬 기준 */
  sortCriteria: SortCriteria;
  /** 현재 정렬 방향 */
  sortDirection: 'asc' | 'desc';
  /** 현재 필터 조건 */
  filter: HoldingFilter;
  /** 선택된 코인 심볼 */
  selectedCoin: string | null;
  /** 선택된 코인의 상세 요약 */
  selectedCoinSummary: CoinSummary | null;

  // ===== 스냅샷 동기화 상태 =====

  /** 큐에 대기 중인 스냅샷 수 */
  snapshotPendingCount: number;
  /** 마지막 스냅샷 전송 성공 시각 */
  snapshotLastSentAt: Date | null;
  /** 스냅샷 전송 중 여부 */
  snapshotIsSending: boolean;

  // ===== 액션 =====

  /** 모든 거래소 데이터 수동 새로고침 */
  refetchAll: () => void;
  /** 특정 거래소 데이터 수동 새로고침 */
  refetchExchange: (exchange: ExchangeType) => void;
  /** 뷰 모드 변경 */
  setViewMode: (mode: ViewMode) => void;
  /** 정렬 토글 (같은 기준 클릭 시 방향 전환) */
  toggleSort: (criteria: SortCriteria) => void;
  /** 필터 변경 */
  setFilter: (filter: HoldingFilter) => void;
  /** 코인 선택 (상세 보기) */
  selectCoin: (symbol: string | null) => void;
  /** 포트폴리오 스냅샷을 NestJS에 즉시 전송한다 */
  sendSnapshotNow: () => Promise<void>;
}

/**
 * 포트폴리오 통합 조회 훅
 *
 * 등록된 모든 거래소의 잔고를 병렬로 조회하고,
 * 통합 포트폴리오를 생성하여 대시보드에 제공한다.
 *
 * @param options 훅 옵션
 * @returns 통합 포트폴리오 데이터, 상태, 액션
 *
 * @example
 * ```tsx
 * function Dashboard() {
 *   const {
 *     totalEvaluation,
 *     mergedHoldings,
 *     isLoading,
 *     refetchAll,
 *     toggleSort,
 *   } = usePortfolio({ walletAddress: '0x...' });
 *
 *   return (
 *     <div>
 *       <h1>총 평가금액: {totalEvaluation}</h1>
 *       <button onClick={refetchAll}>새로고침</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function usePortfolio(options: UsePortfolioOptions): UsePortfolioReturn {
  const { walletAddress, enabled = true } = options;

  // 설정에서 자동 갱신 주기 가져오기
  const refreshInterval = useSettingsStore((s) => s.settings.refreshInterval);
  const refreshIntervalMs = refreshInterval * 1000;

  // 포트폴리오 저장소 - 액션만 개별 선택하여 불필요한 리렌더 방지
  const updateAllExchangeData = usePortfolioStore((s) => s.updateAllExchangeData);
  const aggregatedPortfolio = usePortfolioStore((s) => s.aggregatedPortfolio);
  const exchangeStates = usePortfolioStore((s) => s.exchangeStates);
  const viewMode = usePortfolioStore((s) => s.viewMode);
  const sortCriteria = usePortfolioStore((s) => s.sortCriteria);
  const sortDirection = usePortfolioStore((s) => s.sortDirection);
  const filter = usePortfolioStore((s) => s.filter);
  const selectedCoin = usePortfolioStore((s) => s.selectedCoin);
  const setViewMode = usePortfolioStore((s) => s.setViewMode);
  const toggleSort = usePortfolioStore((s) => s.toggleSort);
  const setFilter = usePortfolioStore((s) => s.setFilter);
  const selectCoin = usePortfolioStore((s) => s.selectCoin);
  const getFilteredAndSortedMergedHoldings = usePortfolioStore((s) => s.getFilteredAndSortedMergedHoldings);
  const getSelectedCoinSummary = usePortfolioStore((s) => s.getSelectedCoinSummary);
  const getHasPartialError = usePortfolioStore((s) => s.getHasPartialError);
  const getIsAllError = usePortfolioStore((s) => s.getIsAllError);
  const getLastUpdated = usePortfolioStore((s) => s.getLastUpdated);

  // 이전 결과의 직렬화된 키 (내용 기반 비교용)
  const prevResultsKeyRef = useRef<string>('');

  // 모든 거래소 잔고 병렬 조회
  const balancesResult: UseAllExchangeBalancesReturn = useAllExchangeBalances({
    walletAddress,
    enabled,
    refetchInterval: refreshIntervalMs,
  });

  // 조회 결과를 포트폴리오 저장소에 동기화
  // 로딩 중인 결과는 제외하고 완료된 것만 store에 반영
  useEffect(() => {
    const { results } = balancesResult;

    // 데이터 또는 오류가 있는 결과만 필터링 (로딩 중인 빈 결과 제외)
    const completedResults = results.filter((r) => r.data !== null || r.error !== null);
    if (completedResults.length === 0) return;

    // 내용 기반 비교
    const resultsKey = completedResults
      .map((r) => `${r.exchange}:${r.data ? JSON.stringify(r.data).length : 'null'}:${r.error?.message ?? ''}`)
      .join('|');

    if (prevResultsKeyRef.current === resultsKey) return;
    prevResultsKeyRef.current = resultsKey;

    const storeResults = completedResults.map((r) => ({
      exchange: r.exchange,
      data: r.data,
      error: r.error ? r.error.message : null,
    }));

    updateAllExchangeData(storeResults);
  }, [balancesResult.results, updateAllExchangeData]);

  // 통합 데이터 계산
  const totalEvaluation = aggregatedPortfolio?.totalEvaluation ?? 0;
  const totalInvestment = aggregatedPortfolio?.totalInvestment ?? 0;
  const totalProfitLoss = aggregatedPortfolio?.totalProfitLoss ?? 0;
  const profitLossRate = aggregatedPortfolio?.profitLossRate ?? 0;
  const totalKrwBalance = aggregatedPortfolio?.totalKrwBalance ?? 0;

  // 정렬/필터 적용된 holdings
  // getFilteredAndSortedMergedHoldings()는 get()을 사용하므로 Zustand 구독이 안 됨
  // filter, sortCriteria, sortDirection, aggregatedPortfolio를 직접 구독하고 useMemo로 계산
  const mergedHoldings = useMemo(() => {
    return getFilteredAndSortedMergedHoldings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aggregatedPortfolio, filter, sortCriteria, sortDirection]);

  // 오류 상태 집계
  const errors: Partial<Record<ExchangeType, string>> = {};
  for (const [exchange, state] of Object.entries(exchangeStates)) {
    if (state?.errorMessage) {
      errors[exchange as ExchangeType] = state.errorMessage;
    }
  }

  // 초기 로딩 (데이터가 아직 없고 로딩 중인 상태)
  const isInitialLoading =
    balancesResult.isLoading && !aggregatedPortfolio;

  // 선택된 코인 요약
  const selectedCoinSummary = getSelectedCoinSummary();

  // 스냅샷 동기화: 포트폴리오 조회 완료 시 NestJS에 비동기 전송
  const snapshotSync = useSnapshotSync({
    walletAddress,
    aggregatedPortfolio,
    enabled,
  });

  return {
    // 통합 데이터
    totalEvaluation,
    totalInvestment,
    totalProfitLoss,
    profitLossRate,
    totalKrwBalance,
    mergedHoldings,

    // 거래소별 상태
    exchangeStates,

    // 로딩/오류 상태
    isLoading: balancesResult.isLoading,
    isInitialLoading,
    loadingStates: balancesResult.loadingStates,
    hasPartialError: getHasPartialError(),
    isAllError: getIsAllError(),
    errors,
    lastUpdated: getLastUpdated(),

    // UI 상태
    viewMode,
    sortCriteria,
    sortDirection,
    filter,
    selectedCoin,
    selectedCoinSummary,

    // 스냅샷 동기화 상태
    snapshotPendingCount: snapshotSync.pendingQueueCount,
    snapshotLastSentAt: snapshotSync.lastSentAt,
    snapshotIsSending: snapshotSync.isSending,

    // 액션
    refetchAll: balancesResult.refetchAll,
    refetchExchange: balancesResult.refetchExchange,
    setViewMode,
    toggleSort,
    setFilter,
    selectCoin,
    sendSnapshotNow: snapshotSync.sendNow,
  };
}
