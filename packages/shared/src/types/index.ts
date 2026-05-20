/**
 * 공유 타입 배럴 export
 *
 * 모든 공유 타입을 단일 진입점에서 re-export한다.
 */

// 거래소 관련 타입
export type {
  ExchangeType,
  Currency,
  ApiKeyPair,
  EncryptedApiKey,
  SignRequestParams,
  SignedRequest,
  ApiKeyValidationResult,
} from './exchange';

// 포트폴리오 관련 타입
export type {
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
} from './portfolio';

// 시세 및 김치 프리미엄 관련 타입
export type {
  Ticker,
  OrderbookEntry,
  Orderbook,
  KimchiPremiumData,
  KimchiPremiumHistory,
  PriceUpdate,
} from './ticker';

// 알림 관련 타입
export type {
  AlertCondition,
  AlertConfig,
  Alert,
  AlertHistory,
  TriggeredAlert,
  AlertNotification,
} from './alert';

// 리포트 및 스냅샷 관련 타입
export type {
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
} from './report';

// 지갑 인증 관련 타입
export type {
  WalletConnection,
  EncryptionKeyDerivation,
  SignFunction,
} from './wallet';

// 워치리스트 관련 타입
export type { WatchlistItem } from './watchlist';

// 선물 마켓 데이터 타입
export type {
  FuturesIndicatorType,
  LongShortRatioEntry,
  TakerBuySellEntry,
  OpenInterestEntry,
  FundingRateEntry,
  TopTraderRatioEntry,
  CachedFuturesData,
  FuturesIndicatorsResponse,
} from './futures';

// 선물 거래 타입
export type {
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
} from './futures';

// 시그널 관련 타입
export type {
  SignalDirection,
  CoinLatestSignal,
  SignalItem,
  SignalListResponse,
  VerifyPasswordRequest,
  VerifyPasswordResponse,
} from './signal';
