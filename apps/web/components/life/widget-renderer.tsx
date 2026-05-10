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
import { InfluencerWidget } from './widgets/influencer-widget';
import { PremiumWidget } from './widgets/premium-widget';
import { MarketWidget } from './widgets/market-widget';
import { FuturesWidget } from './widgets/futures-widget';
import { FearGreedWidget } from './widgets/fear-greed-widget';
import { CalendarWidget } from './widgets/calendar-widget';
import { WhaleWidget } from './widgets/whale-widget';
import { TelegramWidget } from './widgets/telegram-widget';
import { TradingViewChart } from './widgets/tradingview-chart-widget';

interface WidgetRendererProps {
  config: WidgetConfig;
  index: number;
}

export function WidgetRenderer({ config, index }: WidgetRendererProps) {
  const widgetName = {
    portfolio: '포트폴리오',
    news: '뉴스',
    influencer: '인플루언서',
    premium: '김프',
    market: '마켓',
    futures: '선물',
    fearGreed: '공포/탐욕',
    calendar: '경제캘린더',
    whale: '고래알림',
    telegram: '텔레그램',
    chart: '차트',
  }[config.type];

  return (
    <WidgetErrorBoundary widgetName={widgetName}>
      {config.type === 'portfolio' && <PortfolioWidget />}
      {config.type === 'news' && <NewsWidget />}
      {config.type === 'influencer' && <InfluencerWidget />}
      {config.type === 'premium' && <PremiumWidget exchange={config.exchange} />}
      {config.type === 'market' && <MarketWidget exchange={config.exchange} />}
      {config.type === 'futures' && <FuturesWidget symbol={config.exchange} />}
      {config.type === 'fearGreed' && <FearGreedWidget />}
      {config.type === 'calendar' && <CalendarWidget />}
      {config.type === 'whale' && <WhaleWidget />}
      {config.type === 'telegram' && <TelegramWidget />}
      {config.type === 'chart' && !config.chartSymbol2 && (
        <TradingViewChart
          symbol={config.chartSymbol ?? 'BINANCE:BTCUSDT'}
          interval={config.chartInterval ?? '60'}
          containerId={`life-chart-${index}`}
        />
      )}
      {config.type === 'chart' && config.chartSymbol2 && (
        <div className="flex flex-col h-full">
          <div className="flex-1 min-h-0">
            <TradingViewChart
              symbol={config.chartSymbol ?? 'BINANCE:BTCUSDT'}
              interval={config.chartInterval ?? '60'}
              containerId={`life-chart-${index}-top`}
            />
          </div>
          <div className="flex-1 min-h-0 border-t border-border">
            <TradingViewChart
              symbol={config.chartSymbol2}
              interval={config.chartInterval2 ?? '60'}
              containerId={`life-chart-${index}-bottom`}
            />
          </div>
        </div>
      )}
    </WidgetErrorBoundary>
  );
}
