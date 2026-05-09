/**
 * 위젯 렌더러
 *
 * WidgetConfig에 따라 적절한 위젯 컴포넌트를 렌더링한다.
 */

'use client';

import type { WidgetConfig } from '@/lib/life/types';
import { WidgetErrorBoundary } from './widget-error-boundary';
import { PortfolioWidget } from './widgets/portfolio-widget';
import { NewsWidget } from './widgets/news-widget';
import { PremiumWidget } from './widgets/premium-widget';
import { MarketWidget } from './widgets/market-widget';
import { TradingViewChart } from './widgets/tradingview-chart-widget';

interface WidgetRendererProps {
  config: WidgetConfig;
  index: number;
}

export function WidgetRenderer({ config, index }: WidgetRendererProps) {
  const widgetName = {
    portfolio: '포트폴리오',
    news: '뉴스',
    premium: '김프',
    market: '마켓',
    chart: '차트',
  }[config.type];

  return (
    <WidgetErrorBoundary widgetName={widgetName}>
      {config.type === 'portfolio' && <PortfolioWidget />}
      {config.type === 'news' && <NewsWidget />}
      {config.type === 'premium' && <PremiumWidget exchange={config.exchange} />}
      {config.type === 'market' && <MarketWidget exchange={config.exchange} />}
      {config.type === 'chart' && (
        <TradingViewChart
          symbol={config.chartSymbol ?? 'BINANCE:BTCUSDT'}
          interval={config.chartInterval ?? '60'}
          containerId={`life-chart-${index}`}
        />
      )}
    </WidgetErrorBoundary>
  );
}
