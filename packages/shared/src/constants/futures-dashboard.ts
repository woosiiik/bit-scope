/**
 * 멀티 거래소 선물 대시보드 상수 정의
 */

import type { FuturesExchangeType } from '../types/futures';
import type { FuturesDashboardIndicator } from '../types/futures-dashboard';

/** 거래소별 고정 HEX 색상 */
export const EXCHANGE_COLORS: Record<FuturesExchangeType, string> = {
  binance: '#F0B90B',
  bybit: '#F7A600',
  okx: '#CCCCCC',
  gate: '#2354E6',
  bitget: '#00C9A7',
  hyperliquid: '#6FFFE9',
};

/** 12개 유효 지표 배열 */
export const VALID_INDICATORS: FuturesDashboardIndicator[] = [
  'price',
  'volume24h',
  'volumeHistory',
  'oiSnapshot',
  'oiHistory',
  'fundingRate',
  'liquidations',
  'cvd',
  'basis3m',
  'avgReturnByHour',
  'avgReturnByDay',
  'cumReturnBySession',
];

/** 스냅샷 지표 (서버 캐시 30초) */
export const SNAPSHOT_INDICATORS: FuturesDashboardIndicator[] = [
  'volume24h',
  'oiSnapshot',
  'fundingRate',
];

/** 히스토리 지표 (서버 캐시 5분) */
export const HISTORY_INDICATORS: FuturesDashboardIndicator[] = [
  'price',
  'oiHistory',
  'volumeHistory',
  'liquidations',
  'cvd',
  'basis3m',
];

/** Kline 집계 지표 (서버 캐시 10분) */
export const KLINE_INDICATORS: FuturesDashboardIndicator[] = [
  'avgReturnByHour',
  'avgReturnByDay',
  'cumReturnBySession',
];

/** 세션 시간대 정의 (UTC) */
export const SESSION_RANGES = {
  APAC: { start: 0, end: 8 },
  EU: { start: 8, end: 16 },
  US: { start: 16, end: 24 },
} as const;

/** 지표별 지원 거래소 매핑 */
export const INDICATOR_EXCHANGE_SUPPORT: Record<FuturesDashboardIndicator, FuturesExchangeType[]> = {
  price: ['binance', 'bybit', 'okx', 'gate', 'bitget', 'hyperliquid'],
  volume24h: ['binance', 'bybit', 'okx', 'gate', 'bitget', 'hyperliquid'],
  volumeHistory: ['binance', 'bybit', 'okx', 'gate', 'bitget', 'hyperliquid'],
  oiSnapshot: ['binance', 'bybit', 'okx', 'gate', 'bitget', 'hyperliquid'],
  oiHistory: ['binance', 'bybit', 'gate'], // OKX rubik API는 ~24h 고정, Bitget은 히스토리 API 없음
  fundingRate: ['binance', 'bybit', 'okx', 'gate', 'bitget', 'hyperliquid'],
  liquidations: [], // WebSocket 기반 수집 필요 — Phase 2에서 구현 예정
  cvd: ['binance'],
  basis3m: ['binance', 'okx'],
  avgReturnByHour: ['binance'],
  avgReturnByDay: ['binance'],
  cumReturnBySession: ['binance'],
};
