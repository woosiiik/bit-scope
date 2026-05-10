/**
 * 크립토 라이프 멀티뷰 타입 정의
 */

/** 위젯 종류 */
export type WidgetType =
  | 'portfolio'
  | 'news'
  | 'influencer'
  | 'premium'
  | 'market'
  | 'futures'
  | 'fearGreed'
  | 'calendar'
  | 'whale'
  | 'telegram'
  | 'chart';

/** 그리드 레이아웃 종류 */
export type GridLayout = '2x2' | '2x3' | '3x2' | '3x3' | '1x2' | '2x1' | '1x3' | '3x1';

/** 위젯 배치 설정 */
export interface WidgetConfig {
  /** 위젯 종류 */
  type: WidgetType;
  /** 차트 위젯일 때의 TradingView 심볼 (예: "BINANCE:BTCUSDT") */
  chartSymbol?: string;
  /** 차트 위젯일 때의 타임프레임 */
  chartInterval?: string;
  /** 차트 위젯 2번째 심볼 (위아래 2개 표시 시) */
  chartSymbol2?: string;
  /** 차트 위젯 2번째 타임프레임 */
  chartInterval2?: string;
  /** 마켓/김프 위젯일 때의 거래소 */
  exchange?: string;
}

/** 크립토 라이프 레이아웃 설정 */
export interface LifeLayoutConfig {
  layout: GridLayout;
  widgets: (WidgetConfig | null)[];
}

/** 차트 페이지의 차트 설정 */
export interface ChartConfig {
  symbol: string;
  interval: string;
}

/** 차트 페이지 레이아웃 설정 */
export interface ChartsLayoutConfig {
  charts: ChartConfig[];
}

/** 위젯 메타 정보 */
export interface WidgetMeta {
  type: WidgetType;
  labelKo: string;
  labelEn: string;
  icon: string;
}
