'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Period } from '@bitscope/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useBasis } from '@/hooks/useBasis';
import { ChartPanel } from './chart-panel';
import { PriceChart } from './charts/price-chart';
import { Volume24hChart } from './charts/volume24h-chart';
import { VolumeHistoryChart } from './charts/volume-history-chart';
import { OiSnapshotChart } from './charts/oi-snapshot-chart';
import { OiHistoryChart } from './charts/oi-history-chart';
import { FundingRateChart } from './charts/funding-rate-chart';
import { LiquidationsChart } from './charts/liquidations-chart';
import { CVDChart } from './charts/cvd-chart';
import { Basis3mChart } from './charts/basis3m-chart';
import { AvgReturnHourChart } from './charts/avg-return-hour-chart';
import { AvgReturnDayChart } from './charts/avg-return-day-chart';
import { CumReturnSessionChart } from './charts/cum-return-session-chart';

interface ChartGridProps {
  coin: string;
}

export function ChartGrid({ coin }: ChartGridProps) {
  // 히스토리 차트 공용 기간
  const [period, setPeriod] = useState<Period>('1m');
  // Funding Rate 토글
  const [fundingMode, setFundingMode] = useState<string>('annual');
  // CVD 토글
  const [cvdMode, setCvdMode] = useState<string>('dollars');

  return (
    <div className="space-y-6">
      {/* 1행: 가격 / 거래량 개요 */}
      <div>
        <h2 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Price & Volume</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <ChartPanel
            title="Price"
            indicator="price"
            coin={coin}
            period={period}
            onPeriodChange={setPeriod}
            renderChart={(data) => <PriceChart data={data} />}
          />
          <ChartPanel
            title="24h Volume"
            indicator="volume24h"
            coin={coin}
            renderChart={(data) => <Volume24hChart data={data} />}
          />
          <ChartPanel
            title="Volume History"
            indicator="volumeHistory"
            coin={coin}
            period={period}
            onPeriodChange={setPeriod}
            renderChart={(data) => <VolumeHistoryChart data={data} />}
          />
        </div>
      </div>

      {/* 2행: 미결제약정 */}
      <div>
        <h2 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Open Interest</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <ChartPanel
            title="OI Snapshot (Coin)"
            indicator="oiSnapshot"
            coin={coin}
            renderChart={(data) => <OiSnapshotChart data={data} />}
          />
          <ChartPanel
            title="Open Interest (Coin)"
            indicator="oiHistory"
            coin={coin}
            period={period}
            onPeriodChange={setPeriod}
            renderChart={(data) => <OiHistoryChart data={data} />}
          />
          <ChartPanel
            title="Funding Rate"
            indicator="fundingRate"
            coin={coin}
            toggleOptions={[
              { label: 'Annual', value: 'annual' },
              { label: '8hrs', value: '8hrs' },
            ]}
            activeToggle={fundingMode}
            onToggleChange={setFundingMode}
            renderChart={(data) => (
              <FundingRateChart data={data} mode={fundingMode as 'annual' | '8hrs'} />
            )}
          />
        </div>
      </div>

      {/* 3행: 유동성 / 흐름 */}
      <div>
        <h2 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Liquidity & Flow</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <LiquidationsPanel coin={coin} period={period} />
          <ChartPanel
            title="CVD (Dollars)"
            indicator="cvd"
            coin={coin}
            period={period}
            onPeriodChange={setPeriod}
            toggleOptions={[
              { label: 'Dollars', value: 'dollars' },
              { label: 'OI Norm.', value: 'oi-norm' },
            ]}
            activeToggle={cvdMode}
            onToggleChange={setCvdMode}
            renderChart={(data) => <CVDChart data={data} mode={cvdMode as 'dollars' | 'oi-norm'} />}
          />
          {/* 3M Basis: BTC/ETH만 지원, 미지원 코인은 API 호출 안 함 */}
          <BasisPanel coin={coin} period={period} />
        </div>
      </div>

      {/* 4행: 수익률 분석 */}
      <div>
        <h2 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Return Analysis</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <ChartPanel
            title="1m Avg Return By Hour (UTC)"
            indicator="avgReturnByHour"
            coin={coin}
            renderChart={(data) => <AvgReturnHourChart data={data} />}
          />
          <ChartPanel
            title="Avg Return By Day"
            indicator="avgReturnByDay"
            coin={coin}
            renderChart={(data) => <AvgReturnDayChart data={data} />}
          />
          <ChartPanel
            title="Cumulative Return By Session"
            indicator="cumReturnBySession"
            coin={coin}
            period={period}
            onPeriodChange={setPeriod}
            renderChart={(data) => <CumReturnSessionChart data={data} />}
          />
        </div>
      </div>
    </div>
  );
}

/** Liquidations 차트 패널 — 별도 API 엔드포인트 사용 */
function LiquidationsPanel({ coin, period }: { coin: string; period: Period }) {
  const periodMap: Record<Period, string> = { '1d': '1d', '1w': '1w', '1m': '1m', '3m': '1m', '6m': '1m', '1y': '1m' };
  const liqPeriod = periodMap[period] ?? '1d';

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['futures-dashboard', 'liquidations', coin, liqPeriod],
    queryFn: async () => {
      const res = await fetch(`/api/futures-dashboard/liquidations?coin=${coin}&period=${liqPeriod}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
    placeholderData: (prev: unknown) => prev,
  });

  return (
    <Card className="overflow-hidden" aria-label="Liquidations">
      <CardContent className="p-3 space-y-2">
        <h3 className="text-xs font-medium text-foreground">Liquidations</h3>
        <div className="h-[180px]">
          {isLoading ? (
            <div className="h-full w-full animate-pulse bg-muted rounded" />
          ) : error ? (
            <div className="h-full flex flex-col items-center justify-center gap-2">
              <p className="text-xs text-muted-foreground text-center">
                백엔드 서버(NestJS)에 연결할 수 없습니다.
                <br />
                서버가 실행 중인지 확인해주세요.
              </p>
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => refetch()}>재시도</Button>
            </div>
          ) : (
            <LiquidationsChart data={data?.data} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** 3M Basis 패널 — Phase 2 서버 데이터 사용 */
function BasisPanel({ coin, period }: { coin: string; period: Period }) {
  const periodMap: Record<Period, string> = { '1d': '1d', '1w': '1w', '1m': '1m', '3m': '1m', '6m': '1m', '1y': '1m' };
  const { data: basisData } = useBasis(coin, periodMap[period] ?? '1d');

  return (
    <Card className="overflow-hidden" aria-label="3M Annualized Basis">
      <CardContent className="p-3 space-y-2">
        <h3 className="text-xs font-medium text-foreground">3M Annualized Basis</h3>
        <div className="h-[180px]">
          <Basis3mChart coin={coin} serverData={basisData} />
        </div>
      </CardContent>
    </Card>
  );
}
