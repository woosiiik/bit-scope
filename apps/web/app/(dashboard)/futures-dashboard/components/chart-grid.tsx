'use client';

import { useState } from 'react';
import type { Period } from '@bitscope/shared';
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
            title="OI Snapshot"
            indicator="oiSnapshot"
            coin={coin}
            renderChart={(data) => <OiSnapshotChart data={data} />}
          />
          <ChartPanel
            title="Open Interest"
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
          <ChartPanel
            title="Liquidations"
            indicator="liquidations"
            coin={coin}
            period={period}
            onPeriodChange={setPeriod}
            renderChart={(data) => <LiquidationsChart data={data} />}
          />
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
            renderChart={(data) => <CVDChart data={data} />}
          />
          <ChartPanel
            title="3M Annualized Basis"
            indicator="basis3m"
            coin={coin}
            period={period}
            onPeriodChange={setPeriod}
            renderChart={(data) => <Basis3mChart data={data} coin={coin} />}
          />
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
