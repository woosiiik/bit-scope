/**
 * 선물 마켓 데이터 타입 정의
 *
 * 바이낸스 Futures 공개 API에서 수집하는 5가지 지표 타입을 정의한다.
 */

/** 선물 지표 종류 */
export type FuturesIndicatorType =
  | 'longShortRatio'
  | 'liquidations'
  | 'openInterest'
  | 'fundingRate'
  | 'topTraderRatio';

/** 롱숏 비율 항목 */
export interface LongShortRatioEntry {
  symbol: string;
  longAccount: number;
  shortAccount: number;
  longShortRatio: number;
  timestamp: number;
}

/** Taker 매수/매도 비율 항목 (강제 청산 대체) */
export interface TakerBuySellEntry {
  symbol: string;
  buySellRatio: number;
  buyVol: number;
  sellVol: number;
  timestamp: number;
}

/** 미결제 약정 항목 */
export interface OpenInterestEntry {
  symbol: string;
  sumOpenInterest: number;
  sumOpenInterestValue: number;
  timestamp: number;
}

/** 펀딩 비율 항목 */
export interface FundingRateEntry {
  symbol: string;
  fundingRate: number;
  fundingTime: number;
}

/** 탑 트레이더 롱숏 비율 항목 */
export interface TopTraderRatioEntry {
  symbol: string;
  longAccount: number;
  shortAccount: number;
  longShortRatio: number;
  timestamp: number;
}

/** 심볼별 선물 데이터 캐시 */
export interface CachedFuturesData {
  symbol: string;
  longShortRatio: LongShortRatioEntry[];
  takerBuySell: TakerBuySellEntry[];
  openInterest: OpenInterestEntry[];
  fundingRate: FundingRateEntry[];
  topTraderRatio: TopTraderRatioEntry[];
  lastUpdated: number;
}

/** 선물 지표 응답 (프론트 API용) */
export interface FuturesIndicatorsResponse {
  symbol: string;
  indicators: CachedFuturesData;
}

// ─── 선물 거래 페이지 전용 타입 ───────────────────────────────

/** 선물 거래 지원 거래소 타입 (해외 거래소만) */
export type FuturesExchangeType = 'binance' | 'bybit' | 'okx' | 'gate' | 'bitget';

/** 선물 코인 정보 */
export interface FuturesCoin {
  /** 통합 심볼 (예: 'BTCUSDT') */
  symbol: string;
  /** 기본 자산 (예: 'BTC') */
  baseAsset: string;
  /** 표시 라벨 (예: 'BTC/USDT') */
  label: string;
}

/** 선물 오더북 엔트리 */
export interface FuturesOrderbookEntry {
  /** 가격 (USDT) */
  price: number;
  /** 수량 */
  quantity: number;
}

/** 정규화된 선물 오더북 */
export interface FuturesOrderbook {
  /** 거래소 */
  exchange: FuturesExchangeType;
  /** 심볼 */
  symbol: string;
  /** 매도 호가 (가격 오름차순) */
  asks: FuturesOrderbookEntry[];
  /** 매수 호가 (가격 내림차순) */
  bids: FuturesOrderbookEntry[];
  /** 타임스탬프 */
  timestamp: number;
}

/** 포지션 방향 */
export type PositionSide = 'LONG' | 'SHORT';

/** 정규화된 오픈 포지션 */
export interface FuturesPosition {
  /** 거래소 */
  exchange: FuturesExchangeType;
  /** 심볼 (예: 'BTCUSDT') */
  symbol: string;
  /** 방향 */
  side: PositionSide;
  /** 진입가 */
  entryPrice: number;
  /** 현재가 (마크 프라이스) */
  markPrice: number;
  /** 수량 (절대값) */
  quantity: number;
  /** 미실현 PnL (USDT) */
  unrealizedPnl: number;
  /** 레버리지 배수 */
  leverage: number;
  /** 청산가 */
  liquidationPrice: number;
  /** 마진 모드 (cross / isolated) */
  marginType: 'cross' | 'isolated';
  /** 타임스탬프 */
  timestamp: number;
}

/** 주문 유형 */
export type FuturesOrderType = 'LIMIT' | 'MARKET' | 'STOP' | 'STOP_MARKET' | 'TAKE_PROFIT' | 'TAKE_PROFIT_MARKET';

/** 주문 방향 */
export type FuturesOrderSide = 'BUY' | 'SELL';

/** 정규화된 오픈 오더 */
export interface FuturesOpenOrder {
  /** 거래소 */
  exchange: FuturesExchangeType;
  /** 주문 ID */
  orderId: string;
  /** 심볼 */
  symbol: string;
  /** 방향 (BUY/SELL) */
  side: FuturesOrderSide;
  /** 포지션 방향 (LONG/SHORT) */
  positionSide: PositionSide;
  /** 주문 유형 */
  orderType: FuturesOrderType;
  /** 주문 가격 (USDT) */
  price: number;
  /** 주문 수량 */
  quantity: number;
  /** 주문 상태 */
  status: string;
  /** 주문 생성 시간 */
  createdAt: number;
}

/** 거래소별 선물 심볼 매핑 설정 */
export interface FuturesSymbolConfig {
  /** 거래소 API에 사용할 심볼 변환 함수 */
  formatApiSymbol: (baseAsset: string) => string;
  /** TradingView 차트 심볼 변환 함수 */
  formatTradingViewSymbol: (baseAsset: string) => string;
}
