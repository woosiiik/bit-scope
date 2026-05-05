/**
 * 하이퍼리퀴드 API 응답 정규화 모듈
 *
 * 하이퍼리퀴드 거래소의 API 응답을 통일된 내부 데이터 모델로 변환한다.
 * 각 API 엔드포인트(잔고, 시세, 호가, 주문 내역)별로 정규화 함수를 제공한다.
 *
 * 하이퍼리퀴드 API 특성:
 * - 모든 요청이 POST /info에 type 파라미터로 구분된다.
 * - API Key가 불필요하다 (지갑 주소만으로 조회).
 * - 자산은 USDC 기준이다 (USDT가 아님).
 * - 선물(Perps) + Spot 잔고를 통합 제공한다.
 *
 * 잔고 응답 구조:
 * - clearinghouseState: Perps 계좌 (accountValue, totalRawUsd)
 * - spotClearinghouseState: Spot 계좌 (balances 배열)
 *
 * Route Handler에서 두 API를 모두 호출하여 합쳐서 전달한다.
 * 정규화 함수는 합쳐진 응답을 처리한다.
 *
 * @see https://hyperliquid.gitbook.io/
 */

import type { Holding, Ticker, OrderbookEntry } from '@bitscope/shared';
import type {
  NormalizedBalance,
  NormalizedTicker,
  NormalizedOrderbook,
  NormalizedOrderHistory,
  OrderHistoryItem,
  WalletSummary,
} from './types';

// ===== 하이퍼리퀴드 API 원본 응답 타입 =====

/** 하이퍼리퀴드 Perps 계좌 마진 요약 */
export interface HyperliquidMarginSummary {
  accountValue: string;
  totalNtlPos: string;
  totalRawUsd: string;
  totalMarginUsed: string;
}

/** 하이퍼리퀴드 Perps 포지션 항목 */
export interface HyperliquidAssetPosition {
  position: {
    coin: string;
    szi: string;
    entryPx: string;
    positionValue: string;
    unrealizedPnl: string;
    leverage: {
      type: string;
      value: number;
    };
  };
  type: string;
}

/** 하이퍼리퀴드 clearinghouseState 응답 */
export interface HyperliquidClearinghouseState {
  marginSummary: HyperliquidMarginSummary;
  crossMarginSummary: HyperliquidMarginSummary;
  withdrawable: string;
  assetPositions: HyperliquidAssetPosition[];
  time: number;
}

/** 하이퍼리퀴드 Spot 잔고 항목 */
export interface HyperliquidSpotBalance {
  coin: string;
  token: number;
  total: string;
  hold: string;
  entryNtl: string;
}

/** 하이퍼리퀴드 spotClearinghouseState 응답 */
export interface HyperliquidSpotClearinghouseState {
  balances: HyperliquidSpotBalance[];
}

/**
 * Route Handler에서 합쳐서 전달하는 통합 응답 구조
 *
 * clearinghouseState + spotClearinghouseState를 합친다.
 */
export interface HyperliquidCombinedBalanceResponse {
  perps: HyperliquidClearinghouseState;
  spot: HyperliquidSpotClearinghouseState;
}

// ===== 정규화 함수 =====

/**
 * 하이퍼리퀴드 잔고 조회 응답을 정규화한다.
 *
 * Route Handler에서 clearinghouseState와 spotClearinghouseState를 합쳐서
 * { perps, spot } 형태로 전달한다.
 *
 * - Perps: marginSummary.accountValue를 전체 계좌 가치로 사용
 * - Spot: balances 배열에서 개별 코인 보유 내역을 추출
 * - USDC 잔고는 krwBalance 필드에 저장 (환산은 대시보드에서 처리)
 *
 * @param rawResponse 합쳐진 하이퍼리퀴드 API 원본 응답
 * @returns 정규화된 잔고 데이터
 */
export function normalizeHyperliquidBalance(rawResponse: unknown): NormalizedBalance {
  const response = rawResponse as HyperliquidCombinedBalanceResponse;

  if (!response || (!response.perps && !response.spot)) {
    return {
      exchange: 'hyperliquid',
      holdings: [],
      krwBalance: 0,
      timestamp: Date.now(),
    };
  }

  const holdings: Holding[] = [];
  let totalUsdcBalance = 0;

  // Perps 계좌 정보 추출
  const perpsAccountValue = parseFloat(response.perps?.marginSummary?.accountValue) || 0;
  const perpsRawUsd = parseFloat(response.perps?.marginSummary?.totalRawUsd) || 0;

  // Perps USDC 잔고를 holdings에 추가 (포지션 제외 순수 USDC)
  if (perpsRawUsd > 0) {
    holdings.push({
      exchange: 'hyperliquid',
      symbol: 'USDC',
      currency: 'USDT', // USDT로 통일 (1 USDC ≈ 1 USDT, 환산 로직 재활용)
      balance: perpsRawUsd,
      lockedBalance: 0,
      avgBuyPrice: 0, // 스테이블코인은 매수평균가 불필요
      currentPrice: 1,
      evaluationAmount: perpsRawUsd,
      profitLoss: 0,
      profitLossRate: 0,
    });
    totalUsdcBalance += perpsRawUsd;
  }

  // Spot 잔고 처리
  if (response.spot?.balances && Array.isArray(response.spot.balances)) {
    for (const item of response.spot.balances) {
      const total = parseFloat(item.total) || 0;
      const hold = parseFloat(item.hold) || 0;

      if (total <= 0) continue;

      // USDT0는 하이퍼리퀴드의 브릿지된 USDT 토큰
      const isStablecoin = ['USDC', 'USDT', 'USDT0'].includes(item.coin);

      if (isStablecoin) {
        totalUsdcBalance += total;
      }

      // Perps에서 이미 USDC를 추가했으므로 Spot의 USDC는 기존 항목에 합산
      const existingHolding = holdings.find(
        (h) => h.symbol === item.coin && h.exchange === 'hyperliquid',
      );

      if (existingHolding) {
        // 기존 항목에 Spot 잔고 합산
        existingHolding.balance += total - hold;
        existingHolding.lockedBalance += hold;
        if (isStablecoin) {
          existingHolding.evaluationAmount += total;
        }
      } else {
        holdings.push({
          exchange: 'hyperliquid',
          symbol: item.coin,
          currency: 'USDT', // USDT로 통일 (환산 로직 재활용)
          balance: total - hold,
          lockedBalance: hold,
          avgBuyPrice: isStablecoin ? 0 : 0, // 스테이블코인은 매수평균가 불필요
          currentPrice: isStablecoin ? 1 : 0,
          evaluationAmount: isStablecoin ? total : 0,
          profitLoss: 0,
          profitLossRate: 0,
        });
      }
    }
  }

  // Spot 잔고 합계 (스테이블코인 기준)
  const spotBalanceUsdc = response.spot?.balances
    ? response.spot.balances.reduce((sum, item) => sum + (parseFloat(item.total) || 0) * (['USDC', 'USDT', 'USDT0'].includes(item.coin) ? 1 : 0), 0)
    : 0;

  // walletSummary 구성: Perps와 Spot 분리
  const walletSummary: WalletSummary = {
    totalEquityUsdt: perpsAccountValue + spotBalanceUsdc,
    wallets: [],
  };

  if (perpsAccountValue > 0) {
    walletSummary.wallets.push({ name: 'Perps', balanceUsdt: perpsAccountValue });
  }
  if (spotBalanceUsdc > 0) {
    walletSummary.wallets.push({ name: 'Spot', balanceUsdt: spotBalanceUsdc });
  }
  if (walletSummary.wallets.length === 0) {
    walletSummary.wallets.push({ name: 'Total', balanceUsdt: 0 });
  }

  return {
    exchange: 'hyperliquid',
    holdings,
    krwBalance: totalUsdcBalance, // USDC+USDT 합산 (환산은 프론트에서 처리)
    timestamp: Date.now(),
    walletSummary,
  };
}

/**
 * 하이퍼리퀴드 시세(Ticker) 조회 응답을 정규화한다.
 *
 * POST /info { type: "allMids" } 응답을 NormalizedTicker로 변환한다.
 * 응답: { "BTC": "67000.0", "ETH": "3500.0", ... }
 *
 * @param rawResponse 하이퍼리퀴드 allMids API 원본 응답
 * @returns 정규화된 시세 데이터
 */
export function normalizeHyperliquidTicker(rawResponse: unknown): NormalizedTicker {
  const response = rawResponse as Record<string, string>;

  if (!response || typeof response !== 'object') {
    return {
      exchange: 'hyperliquid',
      tickers: [],
      timestamp: Date.now(),
    };
  }

  const tickers: Ticker[] = [];

  for (const [symbol, priceStr] of Object.entries(response)) {
    // @숫자 형태의 스팟 토큰 내부 인덱스는 제외 (예: @1, @12)
    if (symbol.startsWith('@')) {
      continue;
    }

    const price = parseFloat(priceStr) || 0;

    if (price <= 0) {
      continue;
    }

    tickers.push({
      exchange: 'hyperliquid',
      symbol,
      currentPrice: price,
      openPrice: 0,
      highPrice: 0,
      lowPrice: 0,
      prevClosePrice: 0,
      changeRate: 0,
      changePrice: 0,
      volume24h: 0,
      volumeAmount24h: 0,
      timestamp: Date.now(),
    });
  }

  return {
    exchange: 'hyperliquid',
    tickers,
    timestamp: Date.now(),
  };
}

/**
 * 하이퍼리퀴드 호가(Orderbook) 조회 응답을 정규화한다.
 *
 * POST /info { type: "l2Book", coin: "BTC" } 응답을 NormalizedOrderbook로 변환한다.
 *
 * @param rawResponse 하이퍼리퀴드 l2Book API 원본 응답
 * @returns 정규화된 호가 데이터
 */
export function normalizeHyperliquidOrderbook(rawResponse: unknown): NormalizedOrderbook {
  const response = rawResponse as {
    levels?: [Array<{ px: string; sz: string; n: number }>, Array<{ px: string; sz: string; n: number }>];
  };

  const bids: OrderbookEntry[] = [];
  const asks: OrderbookEntry[] = [];

  if (response?.levels && Array.isArray(response.levels) && response.levels.length >= 2) {
    // levels[0] = bids, levels[1] = asks
    for (const entry of response.levels[0]) {
      bids.push({
        price: parseFloat(entry.px) || 0,
        quantity: parseFloat(entry.sz) || 0,
      });
    }
    for (const entry of response.levels[1]) {
      asks.push({
        price: parseFloat(entry.px) || 0,
        quantity: parseFloat(entry.sz) || 0,
      });
    }
  }

  return {
    exchange: 'hyperliquid',
    orderbook: {
      exchange: 'hyperliquid',
      symbol: '',
      bids,
      asks,
      timestamp: Date.now(),
    },
    timestamp: Date.now(),
  };
}

/**
 * 하이퍼리퀴드 주문 내역 응답을 정규화한다.
 *
 * POST /info { type: "userFills", user: "0x..." } 응답을 NormalizedOrderHistory로 변환한다.
 *
 * @param rawResponse 하이퍼리퀴드 userFills API 원본 응답
 * @returns 정규화된 주문 내역 데이터
 */
export function normalizeHyperliquidOrderHistory(rawResponse: unknown): NormalizedOrderHistory {
  const response = rawResponse as Array<{
    coin: string;
    px: string;
    sz: string;
    side: string;
    time: number;
    hash: string;
    dir: string;
  }>;

  if (!Array.isArray(response)) {
    return {
      exchange: 'hyperliquid',
      orders: [],
      timestamp: Date.now(),
    };
  }

  const orders: OrderHistoryItem[] = [];

  for (const item of response) {
    if (!item?.hash) {
      continue;
    }

    orders.push({
      orderId: item.hash,
      symbol: item.coin,
      currency: 'USDC',
      side: item.side === 'B' ? 'buy' : 'sell',
      price: parseFloat(item.px) || 0,
      quantity: parseFloat(item.sz) || 0,
      executedQuantity: parseFloat(item.sz) || 0,
      status: 'filled',
      orderedAt: new Date(item.time || Date.now()),
    });
  }

  return {
    exchange: 'hyperliquid',
    orders,
    timestamp: Date.now(),
  };
}
