/**
 * 마켓 스크리너 전용 타입 정의
 */

import type { FuturesExchangeType } from './futures';

/** 정렬 탭 */
export type SortTab = 'topGainers' | 'topLosers' | 'topVolume' | 'newListings';

/** 시가총액 필터 */
export type CapFilter = 'all' | 'large' | 'mid' | 'small';

/** 섹터 필터 */
export type SectorFilter = 'all' | 'DeFi' | 'L1' | 'L2' | 'Metaverse' | 'Meme' | 'Dino' | 'AI';

/** 차트 기간 */
export type ChartPeriod = '1d' | '1w' | '1m';

/** 시가총액 분류 */
export type MarketCapCategory = 'large' | 'mid' | 'small';

/** 코인 섹터 */
export type CoinSector = 'DeFi' | 'L1' | 'L2' | 'Metaverse' | 'Meme' | 'Dino' | 'AI';

/** 정규화된 개별 거래소 ticker */
export interface NormalizedTicker {
  exchange: FuturesExchangeType;
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  openInterest: number;
  fundingRate: number;
}

/** 거래소별 분류 합산 */
export interface ExchangeTotal {
  exchange: FuturesExchangeType;
  totalVolume: number;
  totalOI: number;
  color: string;
}

/** 집계된 코인 데이터 */
export interface AggregatedCoin {
  symbol: string;
  /** 코인 풀네임 (검색용, 매핑에 있는 경우만) */
  name?: string;
  price: number;
  change24h: number;
  volume24h: number;
  openInterest: number;
  fundingRate: number;
  exchangeCount: number;
  marketCap?: MarketCapCategory;
  sectors: CoinSector[];
  isNewListing?: boolean;
  listDate?: number;
}

/** 마켓 스크리너 API 응답 */
export interface MarketScreenerResponse {
  success: boolean;
  data: {
    coins: AggregatedCoin[];
    exchangeVolumes: ExchangeTotal[];
    exchangeOI: ExchangeTotal[];
  };
  errors: Partial<Record<FuturesExchangeType, string>>;
  exchangeCount: number;
  cached: boolean;
  timestamp: number;
}

/** 신규 상장 코인 */
export interface NewListingCoin {
  symbol: string;
  exchange: FuturesExchangeType;
  listDate: number;
}

/** 신규 상장 API 응답 */
export interface NewListingsResponse {
  success: boolean;
  data: NewListingCoin[];
  timestamp: number;
}

/** 수익률 분포 구간 */
export interface ReturnBucket {
  rangeLabel: string;
  rangeMin: number;
  rangeMax: number;
  count: number;
  coins: Array<{ symbol: string; change: number }>;
}

/** 섹터 성과 */
export interface SectorPerformanceData {
  sector: CoinSector;
  label: string;
  avgReturn: number;
  coinCount: number;
}

/** Kline 변화율 응답 */
export interface KlineChangesResponse {
  success: boolean;
  data: Record<string, number>;
  period: ChartPeriod;
  timestamp: number;
}
