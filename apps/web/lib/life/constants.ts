/**
 * 크립토 라이프 상수 정의
 */

import type { GridLayout, LifeLayoutConfig, WidgetMeta, ChartConfig } from './types';

/** 위젯 메타 정보 */
export const WIDGET_METAS: WidgetMeta[] = [
  { type: 'portfolio', labelKo: '포트폴리오', labelEn: 'Portfolio', icon: 'LayoutDashboard' },
  { type: 'news', labelKo: '뉴스/속보', labelEn: 'News', icon: 'Newspaper' },
  { type: 'influencer', labelKo: '인플루언서', labelEn: 'Influencer', icon: 'CirclePlay' },
  { type: 'premium', labelKo: '김치 프리미엄', labelEn: 'Kimchi Premium', icon: 'BarChart3' },
  { type: 'market', labelKo: '마켓', labelEn: 'Market', icon: 'TrendingUp' },
  { type: 'futures', labelKo: '선물 지표', labelEn: 'Futures', icon: 'Activity' },
  { type: 'fearGreed', labelKo: '공포/탐욕', labelEn: 'Fear & Greed', icon: 'Gauge' },
  { type: 'calendar', labelKo: '경제 캘린더', labelEn: 'Calendar', icon: 'Calendar' },
  { type: 'whale', labelKo: '고래 알림', labelEn: 'Whale Alert', icon: 'Fish' },
  { type: 'telegram', labelKo: '텔레그램', labelEn: 'Telegram', icon: 'Send' },
  { type: 'chart', labelKo: '코인 차트', labelEn: 'Chart', icon: 'LineChart' },
  { type: 'breakingNews', labelKo: '뉴스속보', labelEn: 'Breaking News', icon: 'Zap' },
];

/** 그리드 레이아웃별 셀 수 */
export const GRID_CELL_COUNTS: Record<GridLayout, number> = {
  '2x2': 4,
  '2x3': 6,
  '3x2': 6,
  '3x3': 9,
  '1x2': 2,
  '2x1': 2,
  '1x3': 3,
  '3x1': 3,
};

/** 그리드 레이아웃별 Tailwind CSS 클래스 */
export const GRID_LAYOUT_CLASSES: Record<GridLayout, string> = {
  '2x2': 'grid-cols-1 md:grid-cols-2 grid-rows-2',
  '2x3': 'grid-cols-1 md:grid-cols-3 grid-rows-2',
  '3x2': 'grid-cols-1 md:grid-cols-2 grid-rows-3',
  '3x3': 'grid-cols-1 md:grid-cols-3 grid-rows-3',
  '1x2': 'grid-cols-1 md:grid-cols-2 grid-rows-1',
  '2x1': 'grid-cols-1 grid-rows-2',
  '1x3': 'grid-cols-1 md:grid-cols-3 grid-rows-1',
  '3x1': 'grid-cols-1 grid-rows-3',
};

/** 기본 레이아웃 (포트폴리오 / 뉴스 / 차트(BTC) / 김프) */
export const DEFAULT_LIFE_LAYOUT: LifeLayoutConfig = {
  layout: '2x3',
  widgets: [
    { type: 'portfolio' },
    { type: 'news' },
    { type: 'chart', chartSymbol: 'BINANCE:BTCUSDT', chartInterval: '60' },
    { type: 'premium', exchange: 'upbit' },
    { type: 'influencer' },
    { type: 'market', exchange: 'binance' },
  ],
};

/** 마켓 위젯 지원 거래소 */
export const MARKET_EXCHANGES = [
  { value: 'upbit', label: '업비트' },
  { value: 'bithumb', label: '빗썸' },
  { value: 'coinone', label: '코인원' },
  { value: 'binance', label: '바이낸스' },
] as const;

/** 김프 위젯 기준 국내 거래소 */
export const PREMIUM_EXCHANGES = [
  { value: 'upbit', label: '업비트' },
  { value: 'bithumb', label: '빗썸' },
  { value: 'coinone', label: '코인원' },
] as const;

/** 차트 타임프레임 옵션 */
export const CHART_INTERVALS = [
  { value: '1', label: '1분' },
  { value: '5', label: '5분' },
  { value: '15', label: '15분' },
  { value: '60', label: '1시간' },
  { value: '240', label: '4시간' },
  { value: 'D', label: '1일' },
  { value: 'W', label: '1주' },
] as const;

/** TradingView 심볼 프리셋 */
export const TV_SYMBOL_PRESETS = {
  // 암호화폐 (Binance)
  crypto: [
    { symbol: 'BINANCE:BTCUSDT', label: 'BTC/USDT' },
    { symbol: 'BINANCE:ETHUSDT', label: 'ETH/USDT' },
    { symbol: 'BINANCE:SOLUSDT', label: 'SOL/USDT' },
    { symbol: 'BINANCE:XRPUSDT', label: 'XRP/USDT' },
    { symbol: 'BINANCE:DOGEUSDT', label: 'DOGE/USDT' },
    { symbol: 'BINANCE:ADAUSDT', label: 'ADA/USDT' },
    { symbol: 'BINANCE:AVAXUSDT', label: 'AVAX/USDT' },
    { symbol: 'BINANCE:LINKUSDT', label: 'LINK/USDT' },
  ],
  // 암호화폐 (Upbit KRW)
  cryptoKrw: [
    { symbol: 'UPBIT:BTCKRW', label: 'BTC/KRW' },
    { symbol: 'UPBIT:ETHKRW', label: 'ETH/KRW' },
    { symbol: 'UPBIT:XRPKRW', label: 'XRP/KRW' },
    { symbol: 'UPBIT:SOLKRW', label: 'SOL/KRW' },
  ],
  // 전통 자산
  traditional: [
    { symbol: 'FOREXCOM:NSXUSD', label: '나스닥 100' },
    { symbol: 'FOREXCOM:SPXUSD', label: 'S&P 500' },
    { symbol: 'OANDA:XAUUSD', label: '금 (XAU/USD)' },
    { symbol: 'OANDA:WTICOUSD', label: 'WTI 원유' },
    { symbol: 'OANDA:XAGUSD', label: '은 (XAG/USD)' },
    { symbol: 'FX_IDC:USDKRW', label: '달러/원' },
  ],
} as const;

/** 전체 심볼 프리셋 (플랫) */
export const ALL_TV_SYMBOLS = [
  ...TV_SYMBOL_PRESETS.crypto,
  ...TV_SYMBOL_PRESETS.cryptoKrw,
  ...TV_SYMBOL_PRESETS.traditional,
];

/** 기본 차트 설정 (차트 전용 페이지) */
export const DEFAULT_CHARTS: ChartConfig[] = [
  { symbol: 'BINANCE:BTCUSDT', interval: '60' },
  { symbol: 'BINANCE:ETHUSDT', interval: '60' },
];
