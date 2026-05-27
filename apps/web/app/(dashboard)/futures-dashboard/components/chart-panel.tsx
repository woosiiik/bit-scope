'use client';

import { useState, type ReactNode } from 'react';
import type { FuturesDashboardIndicator, Period } from '@bitscope/shared';
import { INDICATOR_EXCHANGE_SUPPORT } from '@bitscope/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Info } from 'lucide-react';
import { useMultiExchangeIndicator } from '@/hooks/useMultiExchangeIndicator';
import { PeriodSelector } from './period-selector';
import { ExchangeLegend } from './exchange-legend';

/** 차트 설명 매핑 */
const CHART_DESCRIPTIONS: Record<FuturesDashboardIndicator, { title: string; desc: string }> = {
  price: {
    title: 'Price',
    desc: '선택한 코인의 선물 가격을 거래소별로 비교합니다. 거래소 간 가격 차이(스프레드)를 통해 차익거래 기회를 발견할 수 있습니다.',
  },
  volume24h: {
    title: '24h Volume',
    desc: '최근 24시간 동안의 총 선물 거래량(USDT)을 거래소별로 비교합니다. 유동성이 어디에 집중되어 있는지 파악할 수 있습니다.',
  },
  volumeHistory: {
    title: 'Volume History',
    desc: '거래량의 시간 경과에 따른 변화 추이를 거래소별로 보여줍니다. 거래량 급등은 큰 가격 변동의 선행 지표가 될 수 있습니다.',
  },
  oiSnapshot: {
    title: 'OI Snapshot',
    desc: '현재 미결제약정(Open Interest)을 거래소별로 비교합니다. 시장에 얼마나 많은 포지션이 열려있는지, 어디에 집중되는지 보여줍니다.',
  },
  oiHistory: {
    title: 'Open Interest History',
    desc: 'OI 변화 추이를 보여줍니다. OI 증가+가격 상승은 신규 롱 진입(강한 상승), OI 감소+가격 변동은 포지션 정리(추세 약화)를 의미합니다.',
  },
  fundingRate: {
    title: 'Funding Rate',
    desc: '무기한 선물의 펀딩 비율을 거래소별로 비교합니다. 양의 펀딩=롱 과다(과열), 음의 펀딩=숏 과다(공포). Annual은 연환산, 8hrs는 8시간 기준입니다.',
  },
  liquidations: {
    title: 'Liquidations',
    desc: '강제 청산(Force Liquidation) 데이터입니다. 대규모 롱 청산=가격 급락(Long Squeeze), 대규모 숏 청산=가격 급등(Short Squeeze).',
  },
  cvd: {
    title: 'CVD (Cumulative Volume Delta)',
    desc: '시장가 매수량 - 시장가 매도량의 누적 합계입니다. CVD 상승=매수 압력, CVD 하락=매도 압력. 가격과의 다이버전스는 추세 전환 신호입니다.',
  },
  basis3m: {
    title: '3M Annualized Basis',
    desc: '3개월 만기 선물과 현물 가격 차이를 연환산한 수치입니다. 5~15%가 정상, 20%+는 과열, 마이너스는 극도의 공포를 나타냅니다. BTC/ETH만 지원.',
  },
  avgReturnByHour: {
    title: '1m Avg Return By Hour (UTC)',
    desc: 'UTC 시간대별 평균 수익률입니다. 미국장 오픈(UTC 13~14시), 아시아장 오픈(UTC 0~1시) 등 시간대별 가격 패턴을 파악할 수 있습니다.',
  },
  avgReturnByDay: {
    title: 'Avg Return By Day',
    desc: '요일별 평균 수익률입니다. 특정 요일에 일관된 상승/하락 패턴이 있는지 파악할 수 있습니다.',
  },
  cumReturnBySession: {
    title: 'Cumulative Return By Session',
    desc: 'APAC(UTC 0~8h), EU(UTC 8~16h), US(UTC 16~24h) 세션별 누적 수익률입니다. 어느 지역의 트레이더가 시장을 주도하는지 보여줍니다.',
  },
};

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
  const [showInfo, setShowInfo] = useState(false);

  const exchanges = INDICATOR_EXCHANGE_SUPPORT[indicator] ?? [];
  const hasData = response?.data !== undefined && response?.data !== null &&
    !(Array.isArray(response.data) && response.data.length === 0);
  const hasErrors = response?.errors && Object.keys(response.errors).length > 0;
  const isFullError = !hasData && (error || (hasErrors && Object.keys(response.errors).length === exchanges.length));

  const chartDesc = CHART_DESCRIPTIONS[indicator];

  return (
    <Card className="overflow-hidden" aria-label={title}>
      <CardContent className="p-3 space-y-2">
        {/* 헤더: 제목 + ⓘ + 토글 + 기간 선택 */}
        <div className="flex items-center justify-between gap-2 min-h-[24px]">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="text-xs font-medium text-foreground truncate">{title}</h3>
            <button
              type="button"
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowInfo(!showInfo)}
              aria-label={`${title} 설명`}
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </div>
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

        {/* 차트 설명 (ⓘ 클릭 시 토글) */}
        {showInfo && chartDesc && (
          <div className="rounded-md bg-muted/50 border border-border p-2.5 text-[11px] text-muted-foreground leading-relaxed">
            {chartDesc.desc}
          </div>
        )}

        {/* 차트 영역 */}
        <div className="h-[180px] w-full">
          {isLoading ? (
            <div className="h-full w-full animate-pulse bg-muted rounded" />
          ) : isFullError ? (
            <div className="h-full flex flex-col items-center justify-center gap-2">
              <p className="text-xs text-muted-foreground">데이터를 불러올 수 없습니다</p>
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
        {exchanges.length > 0 && (
          <ExchangeLegend exchanges={exchanges} errors={response?.errors} />
        )}
      </CardContent>
    </Card>
  );
}
