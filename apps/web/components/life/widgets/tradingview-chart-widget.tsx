/**
 * TradingView 차트 위젯
 *
 * TradingView Advanced Chart Widget을 임베드하여 실시간 차트를 표시한다.
 * 심볼, 타임프레임, 테마를 지원한다.
 */

'use client';

import { useEffect, useRef, memo } from 'react';

interface TradingViewChartProps {
  /** TradingView 심볼 (예: "BINANCE:BTCUSDT") */
  symbol: string;
  /** 타임프레임 (예: "60" = 1시간) */
  interval?: string;
  /** 다크 모드 여부 */
  darkMode?: boolean;
  /** 컨테이너 ID (고유해야 함) */
  containerId?: string;
}

function TradingViewChartInner({
  symbol,
  interval = '60',
  darkMode = true,
  containerId,
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = containerId ?? `tv-chart-${symbol.replace(/[^a-zA-Z0-9]/g, '-')}`;

  useEffect(() => {
    if (!containerRef.current) return;

    // 기존 위젯 정리
    containerRef.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: 'Asia/Seoul',
      theme: darkMode ? 'dark' : 'light',
      style: '1',
      locale: 'kr',
      allow_symbol_change: true,
      support_host: 'https://www.tradingview.com',
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      calendar: false,
    });

    const widgetContainer = document.createElement('div');
    widgetContainer.className = 'tradingview-widget-container__widget';
    widgetContainer.style.height = '100%';
    widgetContainer.style.width = '100%';

    const wrapper = document.createElement('div');
    wrapper.className = 'tradingview-widget-container';
    wrapper.style.height = '100%';
    wrapper.style.width = '100%';
    wrapper.appendChild(widgetContainer);
    wrapper.appendChild(script);

    containerRef.current.appendChild(wrapper);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [symbol, interval, darkMode, widgetId]);

  return (
    <div ref={containerRef} id={widgetId} className="h-full w-full min-h-[200px]" />
  );
}

export const TradingViewChart = memo(TradingViewChartInner);
