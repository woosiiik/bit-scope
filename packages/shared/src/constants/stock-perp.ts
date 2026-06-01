/**
 * 주식-perp 비교 뷰 상수 정의
 *
 * 비교 대상 페어 설정과 range→interval 폴백 매핑, KRX 정규장 세션 상수를 정의한다.
 */

import type {
  ComparisonInterval,
  ComparisonRange,
  StockPerpPair,
} from '../types/stock-perp';

/** 비교 대상 주식-perp 페어 (R1) — 삼성전자/SK하이닉스/현대차 3개로 한정 */
export const PAIR_CONFIGS: readonly StockPerpPair[] = [
  { stockSymbol: '005930.KS', perpCoin: 'xyz:SMSN', nameKo: '삼성전자' },
  { stockSymbol: '000660.KS', perpCoin: 'xyz:SKHX', nameKo: 'SK하이닉스' },
  { stockSymbol: '005380.KS', perpCoin: 'xyz:HYUNDAI', nameKo: '현대차' },
] as const;

/** 기본 선택 페어 — 삼성전자 (R1.3) */
export const DEFAULT_PAIR = PAIR_CONFIGS[0];

/** 기본 시간 범위 (R8.1) */
export const DEFAULT_RANGE: ComparisonRange = '5d';

/**
 * range별 interval/lookback 매핑 (R8)
 *
 * 주식 데이터는 네이버 금융 API(`api.stock.naver.com`)에서 가져온다 — Yahoo가
 * 데이터센터(OCI) IP에서 429로 상시 차단되기 때문이다. 네이버는 **1분봉 또는 일봉만**
 * 제공하므로(5분봉 없음), interval을 1m/1d로 한정한다. 이에 따라 1mo는 기존 5m에서
 * 일봉으로 거칠어진다(perp Hyperliquid도 1m/1d로 정렬). 네이버는 분봉 한계가 없어
 * interval 폴백이 필요 없으므로 fallbackInterval은 모두 null이다.
 */
export const RANGE_TO_INTERVAL: Record<
  ComparisonRange,
  {
    interval: ComparisonInterval;
    fallbackInterval: ComparisonInterval | null;
    perpLookbackMs: number;
  }
> = {
  '1d': { interval: '1m', fallbackInterval: null, perpLookbackMs: 1 * 864e5 },
  '5d': { interval: '1m', fallbackInterval: null, perpLookbackMs: 5 * 864e5 },
  '1mo': { interval: '1d', fallbackInterval: null, perpLookbackMs: 30 * 864e5 },
  '6mo': { interval: '1d', fallbackInterval: null, perpLookbackMs: 180 * 864e5 },
  '1y': { interval: '1d', fallbackInterval: null, perpLookbackMs: 365 * 864e5 },
};

/** KRX 정규장 세션 (KST) — marketOpen 보조 판정 (R7) */
export const KRX_SESSION = {
  openMin: 9 * 60,
  closeMin: 15 * 60 + 30,
} as const; // 09:00–15:30
