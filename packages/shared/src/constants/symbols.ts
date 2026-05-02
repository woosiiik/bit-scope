/**
 * 주요 코인 심볼 목록, 기본 마켓 코인 등 상수 정의
 *
 * 거래소 공통으로 사용되는 코인 심볼, 표시명, 기본 모니터링 대상 등을 포함한다.
 */

/** 코인 정보 (심볼 및 표시명) */
export interface CoinInfo {
  /** 코인 심볼 (예: "BTC") */
  symbol: string;
  /** 한글 이름 */
  nameKo: string;
  /** 영문 이름 */
  nameEn: string;
}

/**
 * 주요 코인 목록
 *
 * 3개 거래소(업비트, 빗썸, 코인원)에서 공통으로 거래되는 주요 코인 목록이다.
 * 김치 프리미엄 비교 및 기본 모니터링 대상으로 사용된다.
 */
export const MAJOR_COINS: readonly CoinInfo[] = [
  { symbol: 'BTC', nameKo: '비트코인', nameEn: 'Bitcoin' },
  { symbol: 'ETH', nameKo: '이더리움', nameEn: 'Ethereum' },
  { symbol: 'XRP', nameKo: '리플', nameEn: 'Ripple' },
  { symbol: 'SOL', nameKo: '솔라나', nameEn: 'Solana' },
  { symbol: 'DOGE', nameKo: '도지코인', nameEn: 'Dogecoin' },
  { symbol: 'ADA', nameKo: '에이다', nameEn: 'Cardano' },
  { symbol: 'AVAX', nameKo: '아발란체', nameEn: 'Avalanche' },
  { symbol: 'DOT', nameKo: '폴카닷', nameEn: 'Polkadot' },
  { symbol: 'MATIC', nameKo: '폴리곤', nameEn: 'Polygon' },
  { symbol: 'LINK', nameKo: '체인링크', nameEn: 'Chainlink' },
  { symbol: 'ATOM', nameKo: '코스모스', nameEn: 'Cosmos' },
  { symbol: 'ETC', nameKo: '이더리움클래식', nameEn: 'Ethereum Classic' },
  { symbol: 'BCH', nameKo: '비트코인캐시', nameEn: 'Bitcoin Cash' },
  { symbol: 'TRX', nameKo: '트론', nameEn: 'TRON' },
  { symbol: 'EOS', nameKo: '이오스', nameEn: 'EOS' },
] as const;

/** 주요 코인 심볼만 추출한 배열 */
export const MAJOR_COIN_SYMBOLS: readonly string[] = MAJOR_COINS.map(
  (coin) => coin.symbol,
);

/**
 * 김치 프리미엄 기본 모니터링 대상 코인
 *
 * 거래소 간 시세 차이(김프)를 기본으로 비교하는 코인 목록이다.
 */
export const DEFAULT_PREMIUM_COINS: readonly string[] = [
  'BTC',
  'ETH',
  'XRP',
  'SOL',
  'DOGE',
] as const;

/**
 * 벤치마크 코인 심볼
 *
 * 포트폴리오 성과 분석 시 벤치마크 비교 대상으로 사용되는 코인이다.
 */
export const BENCHMARK_SYMBOL = 'BTC';

/**
 * 기본 마켓 통화
 *
 * 국내 거래소의 기본 마켓 통화이다. 향후 USD 등 추가 가능.
 */
export const DEFAULT_CURRENCY = 'KRW';

/**
 * 업비트 마켓 코드 접두사
 *
 * 업비트에서 KRW 마켓 코인은 "KRW-{SYMBOL}" 형식으로 조회한다.
 */
export const UPBIT_KRW_MARKET_PREFIX = 'KRW-';

/**
 * 김치 프리미엄 기본 알림 임계값 (%)
 *
 * 거래소 간 가격 차이가 이 비율을 초과하면 하이라이트 처리된다.
 */
export const DEFAULT_PREMIUM_THRESHOLD_PERCENT = 1.0;

/**
 * 코인별 소수점 표시 자릿수 기본값
 *
 * 특정 코인의 가격이 매우 크거나 작을 때 적절한 소수점 자릿수를 결정한다.
 */
export const COIN_DECIMAL_PLACES: Record<string, number> = {
  BTC: 0,
  ETH: 0,
  XRP: 2,
  SOL: 0,
  DOGE: 2,
  ADA: 2,
  AVAX: 0,
  DOT: 0,
  MATIC: 2,
  LINK: 0,
  ATOM: 0,
  ETC: 0,
  BCH: 0,
  TRX: 2,
  EOS: 2,
} as const;

/** 기본 소수점 자릿수 (코인별 설정이 없는 경우) */
export const DEFAULT_DECIMAL_PLACES = 2;

/**
 * 수량 소수점 자릿수
 *
 * 코인 보유 수량을 표시할 때 사용하는 소수점 자릿수이다.
 */
export const QUANTITY_DECIMAL_PLACES = 8;

/** 수익률 소수점 자릿수 */
export const RATE_DECIMAL_PLACES = 2;
