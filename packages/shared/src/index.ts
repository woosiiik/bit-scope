/**
 * @bitscope/shared - BitScope 공유 패키지
 *
 * 프론트엔드(apps/web)와 백엔드(apps/api)에서 공통으로 사용하는
 * 타입 정의, 상수, 유틸리티 함수를 제공한다.
 */

// 공유 타입
export type {
  // 거래소 관련
  ExchangeType,
  Currency,
  ApiKeyPair,
  EncryptedApiKey,
  SignRequestParams,
  SignedRequest,
  ApiKeyValidationResult,
  // 포트폴리오 관련
  Holding,
  ExchangePortfolio,
  MergedHolding,
  AggregatedPortfolio,
  AssetDistribution,
  CoinSummary,
  SortCriteria,
  SortDirection,
  HoldingFilter,
  PriceMap,
  ProfitLossResult,
  // 시세 및 김치 프리미엄 관련
  Ticker,
  OrderbookEntry,
  Orderbook,
  KimchiPremiumData,
  KimchiPremiumHistory,
  PriceUpdate,
  // 알림 관련
  AlertCondition,
  AlertConfig,
  Alert,
  AlertHistory,
  TriggeredAlert,
  AlertNotification,
  // 리포트 및 스냅샷 관련
  PortfolioSnapshot,
  SnapshotHolding,
  ReportType,
  ExportFormat,
  ReportSummary,
  Report,
  ReportSchedule,
  ExportOptions,
  AggregatedSnapshot,
  AggregationInterval,
  TimePeriod,
  // 지갑 인증 관련
  WalletConnection,
  EncryptionKeyDerivation,
  SignFunction,
  // 워치리스트 관련
  WatchlistItem,
  // 선물 마켓 데이터
  FuturesIndicatorType,
  LongShortRatioEntry,
  TakerBuySellEntry,
  OpenInterestEntry,
  FundingRateEntry,
  TopTraderRatioEntry,
  CachedFuturesData,
  FuturesIndicatorsResponse,
  // 선물 거래 타입
  FuturesExchangeType,
  FuturesCoin,
  FuturesOrderbookEntry,
  FuturesOrderbook,
  PositionSide,
  FuturesPosition,
  FuturesOrderType,
  FuturesOrderSide,
  FuturesOpenOrder,
  FuturesSymbolConfig,
  // 멀티 거래소 선물 대시보드 타입
  FuturesDashboardIndicator,
  Period,
  ExchangeDataPoint,
  ExchangeTimeSeriesPoint,
  FundingRateSnapshot,
  LiquidationPoint,
  CVDPoint,
  HourlyReturnPoint,
  DailyReturnPoint,
  SessionReturnPoint,
  MultiExchangeResponse,
  // 마켓 스크리너 타입
  SortTab,
  CapFilter,
  SectorFilter,
  ChartPeriod,
  MarketCapCategory,
  CoinSector,
  NormalizedTicker,
  ExchangeTotal,
  AggregatedCoin,
  MarketScreenerResponse,
  NewListingCoin,
  NewListingsResponse,
  ReturnBucket,
  SectorPerformanceData,
  KlineChangesResponse,
  // 시그널 관련
  SignalDirection,
  CoinLatestSignal,
  SignalItem,
  SignalListResponse,
  VerifyPasswordRequest,
  VerifyPasswordResponse,
  // 주식-perp 비교 뷰 타입
  ComparisonRange,
  ComparisonInterval,
  ComparisonBaseCurrency,
  StockPerpPair,
  NormalizedCandle,
  RatePoint,
  ComparisonPoint,
  ComparisonResponse,
} from './types';

// 공유 상수
export {
  // 거래소 설정
  UPBIT_CONFIG,
  UPBIT_ENDPOINTS,
  BITHUMB_CONFIG,
  BITHUMB_ENDPOINTS,
  COINONE_CONFIG,
  COINONE_ENDPOINTS,
  EXCHANGE_CONFIGS,
  EXCHANGE_ENDPOINTS,
  SUPPORTED_EXCHANGES,
  DOMESTIC_EXCHANGES,
  FOREIGN_EXCHANGES,
  DEX_EXCHANGES,
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_REFRESH_INTERVAL_MS,
  COINONE_POLLING_INTERVAL_MS,
  WS_MAX_RECONNECT_ATTEMPTS,
  RETRY_CONFIG,
  PREMIUM_SNAPSHOT_INTERVAL_MS,
  // 바이낸스 설정 (포트폴리오 + 김치 프리미엄 비교용)
  BINANCE_CONFIG,
  BINANCE_ENDPOINTS,
  BINANCE_PRICE_ENDPOINTS,
  BINANCE_POLLING_INTERVAL_MS,
  // 바이빗 설정 (포트폴리오 + 김치 프리미엄 비교용)
  BYBIT_CONFIG,
  BYBIT_ENDPOINTS,
  // OKX 설정 (포트폴리오 + 김치 프리미엄 비교용)
  OKX_CONFIG,
  OKX_ENDPOINTS,
  // Gate.io 설정 (포트폴리오 + 김치 프리미엄 비교용)
  GATE_CONFIG,
  GATE_ENDPOINTS,
  // Bitget 설정 (포트폴리오 + 김치 프리미엄 비교용)
  BITGET_CONFIG,
  BITGET_ENDPOINTS,
  // 하이퍼리퀴드 설정 (포트폴리오 - API Key 불필요, 지갑 주소로 조회)
  HYPERLIQUID_CONFIG,
  HYPERLIQUID_ENDPOINTS,
  // LBank 설정 (포트폴리오 + 김치 프리미엄 비교용)
  LBANK_CONFIG,
  LBANK_ENDPOINTS,
  LBANK_POLLING_INTERVAL_MS,
  // 코인 심볼
  MAJOR_COINS,
  MAJOR_COIN_SYMBOLS,
  DEFAULT_PREMIUM_COINS,
  BENCHMARK_SYMBOL,
  DEFAULT_CURRENCY,
  UPBIT_KRW_MARKET_PREFIX,
  DEFAULT_PREMIUM_THRESHOLD_PERCENT,
  COIN_DECIMAL_PLACES,
  DEFAULT_DECIMAL_PLACES,
  QUANTITY_DECIMAL_PLACES,
  RATE_DECIMAL_PLACES,
  // 선물 거래 상수
  FUTURES_EXCHANGES,
  FUTURES_DEFAULT_EXCHANGE,
  FUTURES_COINS,
  FUTURES_DEFAULT_COIN,
  FUTURES_SYMBOL_CONFIGS,
  getFuturesApiSymbol,
  getTradingViewFuturesSymbol,
  // 멀티 거래소 선물 대시보드 상수
  EXCHANGE_COLORS,
  VALID_INDICATORS,
  SNAPSHOT_INDICATORS,
  HISTORY_INDICATORS,
  KLINE_INDICATORS,
  SESSION_RANGES,
  INDICATOR_EXCHANGE_SUPPORT,
  // 마켓 스크리너 상수
  COIN_MARKET_CAP_MAP,
  COIN_SECTOR_MAP,
  SECTOR_LABELS,
  COIN_NAMES,
  BULK_TICKER_CONFIGS,
  BINANCE_PREMIUM_INDEX_URL,
  // 주식-perp 비교 뷰 상수
  PAIR_CONFIGS,
  DEFAULT_PAIR,
  DEFAULT_RANGE,
  RANGE_TO_INTERVAL,
  KRX_SESSION,
} from './constants';

export type { ExchangeConfig, ExchangeEndpoints, CoinInfo } from './constants';

// 공유 유틸리티 함수
export {
  // 숫자/통화 포맷
  formatNumber,
  formatKRW,
  formatUSD,
  formatCurrency,
  formatPercent,
  formatCoinPrice,
  formatQuantity,
  formatCompactKRW,
  formatVolume,
  // API Key 유효성 검증
  validateUpbitApiKeyFormat,
  validateBithumbApiKeyFormat,
  validateCoinoneApiKeyFormat,
  validateBinanceApiKeyFormat,
  validateBybitApiKeyFormat,
  validateOkxApiKeyFormat,
  validateGateApiKeyFormat,
  validateBitgetApiKeyFormat,
  validateHyperliquidApiKeyFormat,
  validateLbankApiKeyFormat,
  validateApiKeyFormat,
  isValidWalletAddress,
  sanitizeApiKey,
  maskSecretKey,
} from './utils';

export type { CurrencyCode, ApiKeyFormatValidation, AlertCurrency } from './utils';

// 알림 통화 유틸리티
export {
  EXCHANGE_CURRENCY_MAP,
  getCurrencyForExchange,
  isDomesticExchange,
  formatAlertPrice,
  getInputStepForCurrency,
  getCurrencyDisplay,
} from './utils';
