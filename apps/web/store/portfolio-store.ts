/**
 * 포트폴리오 상태 저장소 (Zustand)
 *
 * 대시보드에서 사용하는 포트폴리오 통합 상태를 관리한다.
 * 거래소별 로딩 상태를 분리하여 관리하고,
 * 정렬/필터링 상태, 선택된 코인 등 UI 상태를 포함한다.
 *
 * @see 요구사항 2.1 (통합 총 평가금액, 투자금액, 손익, 수익률)
 * @see 요구사항 2.6 (특정 거래소 오류 시 나머지 정상 표시)
 * @see 요구사항 2.9 (정렬 기준 변경 시 즉시 재정렬)
 * @see 요구사항 2.10 (거래소별, 수익/손실 구분 필터)
 * @see 요구사항 2.11 (거래소별 로딩 상태 개별 표시)
 */

import { create } from 'zustand';
import type {
  ExchangeType,
  ExchangePortfolio,
  AggregatedPortfolio,
  MergedHolding,
  Holding,
  SortCriteria,
  SortDirection,
  HoldingFilter,
  CoinSummary,
} from '@bitscope/shared';
import {
  aggregatePortfolios,
  getCoinSummary,
  sortMergedHoldings,
  filterMergedHoldings,
} from '@/lib/portfolio/aggregator';
import type { BalanceResponse, WalletSummary } from '@/lib/api-client';

// ===== 타입 정의 =====

/** 거래소별 포트폴리오 상태 */
export interface ExchangePortfolioState {
  /** 거래소 식별자 */
  exchange: ExchangeType;
  /** 잔고 데이터 (성공 시) */
  data: BalanceResponse | null;
  /** 로딩 상태 */
  isLoading: boolean;
  /** 오류 메시지 */
  errorMessage: string | null;
  /** 마지막 성공 업데이트 시각 */
  lastUpdated: Date | null;
}

/** 뷰 모드: 통합 뷰(코인별 합산) 또는 거래소별 뷰 */
export type ViewMode = 'merged' | 'byExchange';

/** 포트폴리오 저장소 상태 인터페이스 */
interface PortfolioState {
  // ===== 거래소별 포트폴리오 데이터 =====

  /** 거래소별 포트폴리오 상태 맵 */
  exchangeStates: Partial<Record<ExchangeType, ExchangePortfolioState>>;

  /** 통합 포트폴리오 (aggregatePortfolios 결과) */
  aggregatedPortfolio: AggregatedPortfolio | null;

  /** 거래소별 지갑 요약 (해외 거래소의 Spot/Futures/Margin/Earn 합산) */
  walletSummaries: Partial<Record<ExchangeType, WalletSummary>>;

  // ===== UI 상태 =====

  /** 뷰 모드 (통합 / 거래소별) */
  viewMode: ViewMode;

  /** 정렬 기준 */
  sortCriteria: SortCriteria;

  /** 정렬 방향 */
  sortDirection: SortDirection;

  /** 필터 조건 */
  filter: HoldingFilter;

  /** 선택된 코인 심볼 (상세 보기용) */
  selectedCoin: string | null;

  // ===== 액션 =====

  /** 거래소별 로딩 상태를 설정한다. */
  setExchangeLoading: (exchange: ExchangeType, isLoading: boolean) => void;

  /** 거래소별 성공 데이터를 설정하고 통합 포트폴리오를 재계산한다. */
  setExchangeData: (exchange: ExchangeType, data: BalanceResponse) => void;

  /** 거래소별 오류 상태를 설정한다. */
  setExchangeError: (exchange: ExchangeType, errorMessage: string) => void;

  /** 모든 거래소 데이터를 한번에 업데이트하고 통합 포트폴리오를 재계산한다. */
  updateAllExchangeData: (
    results: { exchange: ExchangeType; data: BalanceResponse | null; error: string | null }[],
  ) => void;

  /** 뷰 모드를 변경한다. */
  setViewMode: (mode: ViewMode) => void;

  /** 정렬 기준을 변경한다. */
  setSortCriteria: (criteria: SortCriteria) => void;

  /** 정렬 방향을 변경한다. */
  setSortDirection: (direction: SortDirection) => void;

  /** 정렬 기준과 방향을 함께 변경한다. 같은 기준을 클릭하면 방향을 토글한다. */
  toggleSort: (criteria: SortCriteria) => void;

  /** 필터 조건을 변경한다. */
  setFilter: (filter: HoldingFilter) => void;

  /** 코인을 선택하여 상세 보기를 활성화한다. */
  selectCoin: (symbol: string | null) => void;

  /** 모든 포트폴리오 상태를 초기화한다 (지갑 변경 / 로그아웃 시). */
  resetPortfolio: () => void;

  // ===== 계산된 값 (셀렉터) =====

  /** 정렬 및 필터가 적용된 MergedHolding 배열을 반환한다. */
  getFilteredAndSortedMergedHoldings: () => MergedHolding[];

  /** 선택된 코인의 거래소별 상세 요약을 반환한다. */
  getSelectedCoinSummary: () => CoinSummary | null;

  /** 전체 로딩 중 여부 (하나라도 로딩 중이면 true). */
  getIsLoading: () => boolean;

  /** 부분 오류 여부 (일부 거래소만 오류인 경우). */
  getHasPartialError: () => boolean;

  /** 모든 거래소가 오류인지 여부. */
  getIsAllError: () => boolean;

  /** 마지막 업데이트 시각 (가장 최근 성공 시각). */
  getLastUpdated: () => Date | null;

  /** 거래소별 지갑 요약을 반환한다. */
  getWalletSummaries: () => Partial<Record<ExchangeType, WalletSummary>>;
}

// ===== 헬퍼 함수 =====

/**
 * 거래소별 BalanceResponse를 ExchangePortfolio로 변환한다.
 *
 * useAllExchangeBalances에서 받은 BalanceResponse를
 * aggregatePortfolios에서 사용하는 ExchangePortfolio 형태로 변환한다.
 */
function balanceResponseToPortfolio(
  exchange: ExchangeType,
  data: BalanceResponse,
): ExchangePortfolio {
  const totalEvaluation = data.holdings.reduce(
    (sum, h) => sum + h.evaluationAmount,
    0,
  );
  const totalInvestment = data.holdings.reduce(
    (sum, h) => sum + h.balance * h.avgBuyPrice,
    0,
  );
  const totalProfitLoss = totalEvaluation - totalInvestment;
  const profitLossRate =
    totalInvestment > 0 ? (totalProfitLoss / totalInvestment) * 100 : 0;

  return {
    exchange,
    holdings: data.holdings,
    totalEvaluation,
    totalInvestment,
    totalProfitLoss,
    profitLossRate,
    krwBalance: data.krwBalance,
    lastUpdated: new Date(data.timestamp),
    status: 'connected',
  };
}

/**
 * 오류 상태의 ExchangePortfolio를 생성한다.
 */
function createErrorPortfolio(
  exchange: ExchangeType,
  errorMessage: string,
): ExchangePortfolio {
  return {
    exchange,
    holdings: [],
    totalEvaluation: 0,
    totalInvestment: 0,
    totalProfitLoss: 0,
    profitLossRate: 0,
    krwBalance: 0,
    lastUpdated: new Date(),
    status: 'error',
    errorMessage,
  };
}

/**
 * 로딩 상태의 ExchangePortfolio를 생성한다.
 */
function createLoadingPortfolio(exchange: ExchangeType): ExchangePortfolio {
  return {
    exchange,
    holdings: [],
    totalEvaluation: 0,
    totalInvestment: 0,
    totalProfitLoss: 0,
    profitLossRate: 0,
    krwBalance: 0,
    lastUpdated: new Date(),
    status: 'loading',
  };
}

/**
 * exchangeStates 맵에서 ExchangePortfolio 배열을 생성하여
 * aggregatePortfolios를 호출한다.
 */
function recalculateAggregatedPortfolio(
  exchangeStates: Partial<Record<ExchangeType, ExchangePortfolioState>>,
): AggregatedPortfolio | null {
  const states = Object.values(exchangeStates).filter(
    (s): s is ExchangePortfolioState => s !== undefined,
  );

  if (states.length === 0) {
    return null;
  }

  const portfolios: ExchangePortfolio[] = states.map((state) => {
    if (state.data) {
      return balanceResponseToPortfolio(state.exchange, state.data);
    }
    if (state.errorMessage) {
      return createErrorPortfolio(state.exchange, state.errorMessage);
    }
    return createLoadingPortfolio(state.exchange);
  });

  return aggregatePortfolios(portfolios);
}

// ===== Zustand 저장소 =====

/**
 * 포트폴리오 Zustand 저장소
 *
 * 대시보드에서 사용하는 통합 포트폴리오 상태를 관리한다.
 * 거래소별 로딩 상태를 분리 관리하여 Graceful Degradation을 지원한다.
 *
 * @example
 * ```tsx
 * function Dashboard() {
 *   const {
 *     aggregatedPortfolio,
 *     exchangeStates,
 *     getFilteredAndSortedMergedHoldings,
 *     toggleSort,
 *   } = usePortfolioStore();
 *
 *   const holdings = getFilteredAndSortedMergedHoldings();
 *   // ...
 * }
 * ```
 */
export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  // 초기 상태
  exchangeStates: {},
  aggregatedPortfolio: null,
  walletSummaries: {},
  viewMode: 'merged',
  sortCriteria: 'evaluationAmount',
  sortDirection: 'desc',
  filter: {},
  selectedCoin: null,

  // ===== 액션 =====

  setExchangeLoading: (exchange, isLoading) => {
    set((state) => {
      const current = state.exchangeStates[exchange];
      const updated: ExchangePortfolioState = {
        exchange,
        data: current?.data ?? null,
        isLoading,
        errorMessage: isLoading ? null : (current?.errorMessage ?? null),
        lastUpdated: current?.lastUpdated ?? null,
      };
      const newStates = { ...state.exchangeStates, [exchange]: updated };
      return {
        exchangeStates: newStates,
        aggregatedPortfolio: recalculateAggregatedPortfolio(newStates),
      };
    });
  },

  setExchangeData: (exchange, data) => {
    set((state) => {
      const updated: ExchangePortfolioState = {
        exchange,
        data,
        isLoading: false,
        errorMessage: null,
        lastUpdated: new Date(),
      };
      const newStates = { ...state.exchangeStates, [exchange]: updated };
      const newWalletSummaries = { ...state.walletSummaries };
      if (data.walletSummary) {
        newWalletSummaries[exchange] = data.walletSummary;
      }
      return {
        exchangeStates: newStates,
        aggregatedPortfolio: recalculateAggregatedPortfolio(newStates),
        walletSummaries: newWalletSummaries,
      };
    });
  },

  setExchangeError: (exchange, errorMessage) => {
    set((state) => {
      const current = state.exchangeStates[exchange];
      const updated: ExchangePortfolioState = {
        exchange,
        data: current?.data ?? null, // 기존 데이터 유지 (마지막 성공 데이터)
        isLoading: false,
        errorMessage,
        lastUpdated: current?.lastUpdated ?? null,
      };
      const newStates = { ...state.exchangeStates, [exchange]: updated };
      return {
        exchangeStates: newStates,
        aggregatedPortfolio: recalculateAggregatedPortfolio(newStates),
      };
    });
  },

  updateAllExchangeData: (results) => {
    set((state) => {
      const newStates = { ...state.exchangeStates };
      const newWalletSummaries = { ...state.walletSummaries };

      for (const result of results) {
        const current = newStates[result.exchange];
        if (result.data) {
          newStates[result.exchange] = {
            exchange: result.exchange,
            data: result.data,
            isLoading: false,
            errorMessage: null,
            lastUpdated: new Date(),
          };
          if (result.data.walletSummary) {
            newWalletSummaries[result.exchange] = result.data.walletSummary;
          }
        } else if (result.error) {
          newStates[result.exchange] = {
            exchange: result.exchange,
            data: current?.data ?? null, // 기존 데이터 유지
            isLoading: false,
            errorMessage: result.error,
            lastUpdated: current?.lastUpdated ?? null,
          };
        }
      }

      return {
        exchangeStates: newStates,
        aggregatedPortfolio: recalculateAggregatedPortfolio(newStates),
        walletSummaries: newWalletSummaries,
      };
    });
  },

  setViewMode: (mode) => set({ viewMode: mode }),

  setSortCriteria: (criteria) => set({ sortCriteria: criteria }),

  setSortDirection: (direction) => set({ sortDirection: direction }),

  toggleSort: (criteria) => {
    set((state) => {
      if (state.sortCriteria === criteria) {
        // 같은 기준 클릭 시 방향 토글
        return {
          sortDirection: state.sortDirection === 'asc' ? 'desc' : 'asc',
        };
      }
      // 새로운 기준 선택 시 내림차순으로 초기화
      return { sortCriteria: criteria, sortDirection: 'desc' };
    });
  },

  setFilter: (filter) => set({ filter }),

  selectCoin: (symbol) => set({ selectedCoin: symbol }),

  resetPortfolio: () =>
    set({
      exchangeStates: {},
      aggregatedPortfolio: null,
      walletSummaries: {},
      viewMode: 'merged',
      sortCriteria: 'evaluationAmount',
      sortDirection: 'desc',
      filter: {},
      selectedCoin: null,
    }),

  // ===== 계산된 값 =====

  getFilteredAndSortedMergedHoldings: () => {
    const { aggregatedPortfolio, sortCriteria, sortDirection, filter } = get();
    if (!aggregatedPortfolio) return [];

    let holdings = aggregatedPortfolio.mergedHoldings;

    // 필터 적용
    if (
      (filter.exchanges && filter.exchanges.length > 0) ||
      (filter.profitLossType && filter.profitLossType !== 'all')
    ) {
      holdings = filterMergedHoldings(holdings, filter);
    }

    // 정렬 적용
    holdings = sortMergedHoldings(holdings, sortCriteria, sortDirection);

    return holdings;
  },

  getSelectedCoinSummary: () => {
    const { selectedCoin, aggregatedPortfolio } = get();
    if (!selectedCoin || !aggregatedPortfolio) return null;
    return getCoinSummary(selectedCoin, aggregatedPortfolio.portfolios);
  },

  getIsLoading: () => {
    const { exchangeStates } = get();
    return Object.values(exchangeStates).some((s) => s?.isLoading);
  },

  getHasPartialError: () => {
    const { exchangeStates } = get();
    const states = Object.values(exchangeStates).filter(
      (s): s is ExchangePortfolioState => s !== undefined,
    );
    if (states.length === 0) return false;
    const errorCount = states.filter((s) => s.errorMessage !== null).length;
    return errorCount > 0 && errorCount < states.length;
  },

  getIsAllError: () => {
    const { exchangeStates } = get();
    const states = Object.values(exchangeStates).filter(
      (s): s is ExchangePortfolioState => s !== undefined,
    );
    if (states.length === 0) return false;
    return states.every((s) => s.errorMessage !== null);
  },

  getLastUpdated: () => {
    const { exchangeStates } = get();
    const timestamps = Object.values(exchangeStates)
      .filter((s): s is ExchangePortfolioState => s?.lastUpdated !== null && s !== undefined)
      .map((s) => s.lastUpdated!.getTime());

    if (timestamps.length === 0) return null;
    return new Date(Math.max(...timestamps));
  },

  getWalletSummaries: () => {
    return get().walletSummaries;
  },
}));
