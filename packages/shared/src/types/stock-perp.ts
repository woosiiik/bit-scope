/**
 * 주식-perp 비교 뷰 타입 정의
 *
 * 한국 주식(KRW)의 실제 가격 시계열과 해당 종목의 Hyperliquid 영구선물(perp, USD)
 * 시계열을 동일 타임라인 위에 겹쳐 비교하는 뷰에서 사용하는 타입을 정의한다.
 */

/** 비교 뷰 시간 범위 옵션 (Yahoo range 토큰과 정렬) */
export type ComparisonRange = '1d' | '5d' | '1mo' | '6mo' | '1y';

/** 캔들 간격 */
export type ComparisonInterval = '1m' | '5m' | '15m' | '1d';

/** 변환 기준 통화 */
export type ComparisonBaseCurrency = 'KRW' | 'USD';

/** 주식-perp 페어 설정 (R1) */
export interface StockPerpPair {
  stockSymbol: string; // Yahoo 심볼  예: '005930.KS'
  perpCoin: string; // Hyperliquid 코인 예: 'xyz:SMSN'
  nameKo: string; // 한국어 종목명 예: '삼성전자'
}

/** 정규화된 OHLC 캔들 (주식/perp 공통 중간 표현) */
export interface NormalizedCandle {
  timestamp: number; // UTC epoch ms
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null; // 결측(휴장)이면 null — forward-fill 금지 (R2.4)
}

/** 환율 포인트 (정렬된 시계열) */
export interface RatePoint {
  timestamp: number; // UTC epoch ms
  rate: number; // USD/KRW (1 USD = rate KRW)
}

/** 병합된 비교 시계열 포인트 (R5/R6/R7) */
export interface ComparisonPoint {
  timestamp: number; // 공통 그리드 UTC epoch ms
  stockPrice: number | null; // KRW, 휴장 결측 시 null
  perpPrice: number | null; // baseCurrency 변환값, 결측 시 null
  perpPriceRaw: number | null; // 원본 USD (툴팁)
  appliedRate: number | null; // 적용 환율
  marketOpen: boolean; // 주식 개장 구간 여부
  stockGap: boolean; // 결측 구간 시작 플래그
}

/** Route Handler 응답 */
export interface ComparisonResponse {
  pair: StockPerpPair;
  range: ComparisonRange;
  requestedInterval: ComparisonInterval;
  appliedInterval: ComparisonInterval;
  fallbackApplied: boolean;
  baseCurrency: ComparisonBaseCurrency;
  points: ComparisonPoint[];
  meta: {
    stockTimezone: string; // 'Asia/Seoul'
    gmtoffset: number; // 초 단위 (Yahoo meta.gmtoffset)
    regularMarketPrice: number | null;
  };
  errors: {
    stock: string | null;
    perp: string | null;
    rate: string | null;
  };
  cached?: boolean;
  stale?: boolean;
}
