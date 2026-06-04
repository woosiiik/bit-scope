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
 * 국내 거래소(업비트/빗썸/코인원) KRW 마켓과 바이낸스 USDT 마켓에 공통으로
 * 상장된 코인을 폭넓게 포함한다. 김치 프리미엄 비교 및 기본 모니터링 대상으로 쓰인다.
 *
 * 김프 계산은 (국내가 + 바이낸스 USDT가)가 모두 있어야 성립하므로, 특정 거래소에
 * 없는 코인은 자동으로 결과에서 제외된다(graceful drop). 따라서 일부 거래소에만
 * 있는 코인이 섞여 있어도 안전하다.
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
  { symbol: 'POL', nameKo: '폴리곤에코시스템토큰', nameEn: 'Polygon Ecosystem Token' },
  { symbol: 'LINK', nameKo: '체인링크', nameEn: 'Chainlink' },
  { symbol: 'ATOM', nameKo: '코스모스', nameEn: 'Cosmos' },
  { symbol: 'ETC', nameKo: '이더리움클래식', nameEn: 'Ethereum Classic' },
  { symbol: 'BCH', nameKo: '비트코인캐시', nameEn: 'Bitcoin Cash' },
  { symbol: 'TRX', nameKo: '트론', nameEn: 'TRON' },
  { symbol: 'EOS', nameKo: '이오스', nameEn: 'EOS' },
  { symbol: 'LTC', nameKo: '라이트코인', nameEn: 'Litecoin' },
  { symbol: 'SHIB', nameKo: '시바이누', nameEn: 'Shiba Inu' },
  { symbol: 'NEAR', nameKo: '니어프로토콜', nameEn: 'NEAR Protocol' },
  { symbol: 'APT', nameKo: '앱토스', nameEn: 'Aptos' },
  { symbol: 'SUI', nameKo: '수이', nameEn: 'Sui' },
  { symbol: 'ARB', nameKo: '아비트럼', nameEn: 'Arbitrum' },
  { symbol: 'OP', nameKo: '옵티미즘', nameEn: 'Optimism' },
  { symbol: 'SEI', nameKo: '세이', nameEn: 'Sei' },
  { symbol: 'TIA', nameKo: '셀레스티아', nameEn: 'Celestia' },
  { symbol: 'INJ', nameKo: '인젝티브', nameEn: 'Injective' },
  { symbol: 'STX', nameKo: '스택스', nameEn: 'Stacks' },
  { symbol: 'HBAR', nameKo: '헤데라', nameEn: 'Hedera' },
  { symbol: 'ALGO', nameKo: '알고랜드', nameEn: 'Algorand' },
  { symbol: 'VET', nameKo: '비체인', nameEn: 'VeChain' },
  { symbol: 'SAND', nameKo: '샌드박스', nameEn: 'The Sandbox' },
  { symbol: 'MANA', nameKo: '디센트럴랜드', nameEn: 'Decentraland' },
  { symbol: 'AXS', nameKo: '엑시인피니티', nameEn: 'Axie Infinity' },
  { symbol: 'AAVE', nameKo: '에이브', nameEn: 'Aave' },
  { symbol: 'UNI', nameKo: '유니스왑', nameEn: 'Uniswap' },
  { symbol: 'GRT', nameKo: '더그래프', nameEn: 'The Graph' },
  { symbol: 'IMX', nameKo: '이뮤터블엑스', nameEn: 'Immutable' },
  { symbol: 'FLOW', nameKo: '플로우', nameEn: 'Flow' },
  { symbol: 'CHZ', nameKo: '칠리즈', nameEn: 'Chiliz' },
  { symbol: 'GALA', nameKo: '갈라', nameEn: 'Gala' },
  { symbol: 'APE', nameKo: '에이프코인', nameEn: 'ApeCoin' },
  { symbol: 'XLM', nameKo: '스텔라루멘', nameEn: 'Stellar' },
  { symbol: 'THETA', nameKo: '세타토큰', nameEn: 'Theta Network' },
  { symbol: 'KAVA', nameKo: '카바', nameEn: 'Kava' },
  { symbol: 'ZIL', nameKo: '질리카', nameEn: 'Zilliqa' },
  { symbol: 'ENS', nameKo: '이더리움네임서비스', nameEn: 'Ethereum Name Service' },
  { symbol: 'CRV', nameKo: '커브', nameEn: 'Curve DAO' },
  { symbol: 'COMP', nameKo: '컴파운드', nameEn: 'Compound' },
  { symbol: 'SNX', nameKo: '신세틱스', nameEn: 'Synthetix' },
  { symbol: 'MKR', nameKo: '메이커', nameEn: 'Maker' },
  { symbol: 'BLUR', nameKo: '블러', nameEn: 'Blur' },
  { symbol: 'PENDLE', nameKo: '펜들', nameEn: 'Pendle' },
  { symbol: 'ONDO', nameKo: '온도파이낸스', nameEn: 'Ondo' },
  { symbol: 'ENA', nameKo: '에테나', nameEn: 'Ethena' },
  { symbol: 'JUP', nameKo: '주피터', nameEn: 'Jupiter' },
  { symbol: 'PYTH', nameKo: '피스네트워크', nameEn: 'Pyth Network' },
  { symbol: 'WLD', nameKo: '월드코인', nameEn: 'Worldcoin' },
  { symbol: 'STRK', nameKo: '스타크넷', nameEn: 'Starknet' },
  { symbol: 'JTO', nameKo: '지토', nameEn: 'Jito' },
  { symbol: 'BONK', nameKo: '봉크', nameEn: 'Bonk' },
  { symbol: 'PEPE', nameKo: '페페', nameEn: 'Pepe' },
  { symbol: 'JASMY', nameKo: '재스미코인', nameEn: 'JasmyCoin' },
  { symbol: 'MASK', nameKo: '마스크네트워크', nameEn: 'Mask Network' },
  { symbol: 'GMT', nameKo: '스테픈', nameEn: 'STEPN' },
  { symbol: 'ANKR', nameKo: '앵커', nameEn: 'Ankr' },
  { symbol: 'QTUM', nameKo: '퀀텀', nameEn: 'Qtum' },
  { symbol: 'IOTA', nameKo: '아이오타', nameEn: 'IOTA' },
  { symbol: 'NEO', nameKo: '네오', nameEn: 'Neo' },
  { symbol: 'ONT', nameKo: '온톨로지', nameEn: 'Ontology' },
  { symbol: 'ZEC', nameKo: '지캐시', nameEn: 'Zcash' },
  { symbol: 'DASH', nameKo: '대시', nameEn: 'Dash' },
  { symbol: 'BAT', nameKo: '베이직어텐션토큰', nameEn: 'Basic Attention Token' },
  { symbol: 'ENJ', nameKo: '엔진코인', nameEn: 'Enjin Coin' },
  { symbol: 'KSM', nameKo: '쿠사마', nameEn: 'Kusama' },
  { symbol: 'CELO', nameKo: '셀로', nameEn: 'Celo' },
  { symbol: 'STORJ', nameKo: '스토리지', nameEn: 'Storj' },
  { symbol: 'BTT', nameKo: '비트토렌트', nameEn: 'BitTorrent' },
  { symbol: 'HOT', nameKo: '홀로체인', nameEn: 'Holo' },
  { symbol: 'RENDER', nameKo: '렌더토큰', nameEn: 'Render' },
  { symbol: 'FET', nameKo: '페치에이아이', nameEn: 'Fetch.ai' },
  { symbol: 'ARKM', nameKo: '아캄', nameEn: 'Arkham' },
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
