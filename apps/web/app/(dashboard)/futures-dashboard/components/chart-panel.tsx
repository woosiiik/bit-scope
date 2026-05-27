'use client';

import type { ReactNode } from 'react';
import type { FuturesDashboardIndicator, Period } from '@bitscope/shared';
import { INDICATOR_EXCHANGE_SUPPORT } from '@bitscope/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMultiExchangeIndicator } from '@/hooks/useMultiExchangeIndicator';
import { PeriodSelector } from './period-selector';
import { ExchangeLegend } from './exchange-legend';

interface ToggleOption {
  label: string;
  value: string;
}

interface ChartPanelProps {
  title: string;
  indicator: FuturesDashboardIndicator;
  coin: string;
  period?: Period;
  onPeriodChange?: (period: Period) => void;
  toggleOptions?: ToggleOption[];
  activeToggle?: string;
  onToggleChange?: (value: string) => void;
  renderChart: (data: unknown) => ReactNode;
}

export function ChartPanel({
  title,
  indicator,
  coin,
  period,
  onPeriodChange,
  toggleOptions,
  activeToggle,
  onToggleChange,
  renderChart,
}: ChartPanelProps) {
  const { data: response, isLoading, error, refetch } = useMultiExchangeIndicator(
    indicator,
    coin,
    { period },
  );

  const exchanges = INDICATOR_EXCHANGE_SUPPORT[indicator] ?? [];
  const hasData = response?.data !== undefined && response?.data !== null;
  const hasErrors = response?.errors && Object.keys(response.errors).length > 0;
  const isFullError = !hasData && (error || (hasErrors && Object.keys(response.errors).length === exchanges.length));

  return (
    <Card className="overflow-hidden" aria-label={title}>
      <CardContent className="p-3 space-y-2">
        {/* 헤더: 제목 + 토글 + 기간 선택 */}
        <div className="flex items-center justify-between gap-2 min-h-[24px]">
          <h3 className="text-xs font-medium text-foreground truncate">{title}</h3>
          <div className="flex items-center gap-1 shrink-0">
            {toggleOptions && onToggleChange && (
              <div className="flex items-center gap-0.5">
                {toggleOptions.map((opt) => (
                  <Button
                    key={opt.value}
                    variant={activeToggle === opt.value ? 'default' : 'ghost'}
                    size="sm"
                    className="text-[10px] h-5 px-1.5 min-w-0"
                    onClick={() => onToggleChange(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            )}
            {period !== undefined && onPeriodChange && (
              <PeriodSelector selected={period} onChange={onPeriodChange} />
            )}
          </div>
        </div>

        {/* 차트 영역 */}
        <div className="h-[180px] w-full">
          {isLoading ? (
            <div className="h-full w-full animate-pulse bg-muted rounded" />
          ) : isFullError ? (
            <div className="h-full flex flex-col items-center justify-center gap-2">
              <p className="text-xs text-muted-foreground">
                데이터를 불러올 수 없습니다
              </p>
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => refetch()}>
                재시도
              </Button>
            </div>
          ) : hasData ? (
            renderChart(response.data)
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-xs text-muted-foreground">데이터 없음</p>
            </div>
          )}
        </div>

        {/* 범례 */}
        <ExchangeLegend exchanges={exchanges} errors={response?.errors} />
      </CardContent>
    </Card>
  );
}
