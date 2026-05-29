'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import type { SortTab, CapFilter, SectorFilter, ChartPeriod } from '@bitscope/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { useMarketScreenerTickers } from '@/hooks/useMarketScreenerTickers';
import { useNewListings } from '@/hooks/useNewListings';
import { useKlineChanges } from '@/hooks/useKlineChanges';
import { useScreenerFilter } from '@/hooks/useScreenerFilter';
import { TabFilterBar } from './components/tab-filter-bar';
import { SearchInput } from './components/search-input';
import { ScreenerTable } from './components/screener-table';
import { ChartCard } from './components/chart-card';
import { ReturnBucketsChart } from './components/charts/return-buckets-chart';
import { MarketVolumeChart } from './components/charts/market-volume-chart';
import { TotalOIChart } from './components/charts/total-oi-chart';
import { SectorPerformanceChart } from './components/charts/sector-performance-chart';
import { PriceChangesChart } from './components/charts/price-changes-chart';
import { FundingRateScreenerChart } from './components/charts/funding-rate-chart';
import { DominanceChart, type DominanceMetric } from './components/charts/dominance-chart';
import { OIChangesChart } from './components/charts/oi-changes-chart';
import { FundingHeatmapChart } from './components/charts/funding-heatmap-chart';
import { NormalizedCVDChart } from './components/charts/normalized-cvd-chart';
import { useFundingHeatmap } from '@/hooks/useFundingHeatmap';
import { useOIChanges } from '@/hooks/useOIChanges';
import { useNormalizedCVD } from '@/hooks/useNormalizedCVD';

/** 기간 선택 버튼 */
function PeriodTabs({ selected, onChange }: { selected: ChartPeriod; onChange: (p: ChartPeriod) => void }) {
  const periods: ChartPeriod[] = ['1d', '1w', '1m'];
  return (
    <div className="flex items-center gap-0.5">
      {periods.map((p) => (
        <Button
          key={p}
          variant={selected === p ? 'default' : 'ghost'}
          size="sm"
          className="text-[10px] h-5 px-1.5"
          onClick={() => onChange(p)}
        >
          {p.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}

/** 마지막 갱신 시각 표시 + 2분 초과 시 stale 경고 */
function LastUpdated({ updatedAt }: { updatedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!updatedAt) return null;
  const stale = now - updatedAt > 120_000;
  const d = new Date(updatedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return (
    <span className={`ml-2 ${stale ? 'text-destructive' : 'text-muted-foreground'}`}>
      · 갱신 {time}{stale ? ' (2분+ 지연)' : ''}
    </span>
  );
}

/** Funding 모드 토글 */
function FundingModeToggle({ mode, onChange }: { mode: '8hrs' | 'annual'; onChange: (m: '8hrs' | 'annual') => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {(['8hrs', 'annual'] as const).map((m) => (
        <Button
          key={m}
          variant={mode === m ? 'default' : 'ghost'}
          size="sm"
          className="text-[10px] h-5 px-1.5"
          onClick={() => onChange(m)}
        >
          {m === '8hrs' ? '8hrs' : 'APR'}
        </Button>
      ))}
    </div>
  );
}

/** Dominance 메트릭 토글 */
function DominanceToggle({ metric, onChange }: { metric: DominanceMetric; onChange: (m: DominanceMetric) => void }) {
  const options: { key: DominanceMetric; label: string }[] = [
    { key: 'marketCap', label: 'Market Cap' },
    { key: 'volume', label: 'Futures Vol' },
    { key: 'oi', label: 'Futures OI' },
  ];
  return (
    <div className="flex items-center gap-0.5">
      {options.map((o) => (
        <Button
          key={o.key}
          variant={metric === o.key ? 'default' : 'ghost'}
          size="sm"
          className="text-[10px] h-5 px-1.5"
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}

export default function MarketScreenerPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: response, isLoading, error, isFetching, dataUpdatedAt } = useMarketScreenerTickers();
  const { data: newListingsData } = useNewListings();

  const [sortTab, setSortTab] = useState<SortTab>('topGainers');
  const [capFilter, setCapFilter] = useState<CapFilter>('all');
  const [sectorFilter, setSectorFilter] = useState<SectorFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeView, setActiveView] = useState<'charts' | 'table'>('charts');
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('1d');
  const [fundingMode, setFundingMode] = useState<'8hrs' | 'annual'>('annual');
  const [dominanceMetric, setDominanceMetric] = useState<DominanceMetric>('marketCap');

  // Kline changes (1w/1m)
  const { data: klineData } = useKlineChanges(chartPeriod);

  // Phase 2 hooks
  const { data: fundingHeatmapData } = useFundingHeatmap(chartPeriod);
  const { data: oiChangesData } = useOIChanges(chartPeriod);
  const { data: normalizedCVDData } = useNormalizedCVD(chartPeriod);

  // New Listings 데이터를 coins에 병합
  const rawCoins = response?.data?.coins ?? [];
  const newListings = newListingsData?.data ?? [];
  const coins = useMemo(() => {
    if (newListings.length === 0) return rawCoins;
    const nlSet = new Map(newListings.map((nl) => [nl.symbol, nl.listDate]));
    return rawCoins.map((coin) => {
      const listDate = nlSet.get(coin.symbol);
      if (listDate) return { ...coin, isNewListing: true, listDate };
      return coin;
    });
  }, [rawCoins, newListings]);

  const exchangeVolumes = response?.data?.exchangeVolumes ?? [];
  const exchangeOI = response?.data?.exchangeOI ?? [];
  const errors = response?.errors;

  const filteredCoins = useScreenerFilter(coins, { sortTab, capFilter, sectorFilter, searchQuery });

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['market-screener'] });
  }, [queryClient]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* 헤더 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {t.marketScreener?.title ?? 'Market Screener'}
          </h1>
          {response && (
            <p className="text-xs text-muted-foreground mt-1">
              {filteredCoins.length !== coins.length
                ? `${filteredCoins.length} / ${coins.length} coins`
                : `${coins.length} coins`
              } from {response.exchangeCount ?? 0} exchanges
              {errors && Object.keys(errors).length > 0 && (
                <span className="text-destructive ml-2">
                  ({Object.keys(errors).length} exchange errors)
                </span>
              )}
              <LastUpdated updatedAt={dataUpdatedAt} />
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <SearchInput value={searchQuery} onChange={setSearchQuery} />
          <Button variant="outline" size="sm" className="h-8" onClick={handleRefresh} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* 에러 배너 */}
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          데이터를 불러올 수 없습니다.{' '}
          <button type="button" className="underline" onClick={handleRefresh}>재시도</button>
        </div>
      )}

      {/* 시가총액 + 섹터 필터 (Charts/Table 공용) */}
      <TabFilterBar
        sortTab={sortTab}
        capFilter={capFilter}
        sectorFilter={sectorFilter}
        onSortTabChange={setSortTab}
        onCapFilterChange={setCapFilter}
        onSectorFilterChange={setSectorFilter}
        showSortTabs={activeView === 'table'}
      />

      {/* Charts / Table 탭 */}
      <div className="flex items-center border-b border-border">
        <button
          type="button"
          className={`px-4 pb-2 text-sm transition-colors ${
            activeView === 'charts'
              ? 'border-b-2 border-primary font-medium text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveView('charts')}
        >
          Charts
        </button>
        <button
          type="button"
          className={`px-4 pb-2 text-sm transition-colors ${
            activeView === 'table'
              ? 'border-b-2 border-primary font-medium text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveView('table')}
        >
          Table
        </button>
      </div>

      {/* Table 뷰 */}
      {activeView === 'table' && (
        <Card>
          <CardContent className="p-0">
            <ScreenerTable coins={filteredCoins} isLoading={isLoading} />
          </CardContent>
        </Card>
      )}

      {/* Charts 뷰 */}
      {activeView === 'charts' && (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* 1. Return Buckets */}
        <ChartCard
          title="Return Buckets"
          description="선택 기간 동안 각 코인의 수익률을 구간별로 분류한 히스토그램입니다. 시장 전체의 수익률 분포를 한눈에 파악하여 과열/공포 상태를 진단할 수 있습니다."
          extra={<PeriodTabs selected={chartPeriod} onChange={setChartPeriod} />}
        >
          {coins.length > 0 ? <ReturnBucketsChart coins={filteredCoins} /> : <ChartSkeleton />}
        </ChartCard>

        {/* 2. Price Changes */}
        <ChartCard
          title="Price Changes"
          description="주요 코인의 가격 변화율(%)을 비교합니다. 상승/하락 코인을 한눈에 파악하고 모멘텀이 강한 코인을 발견할 수 있습니다."
          extra={<PeriodTabs selected={chartPeriod} onChange={setChartPeriod} />}
        >
          {filteredCoins.length > 0 ? (
            <PriceChangesChart coins={filteredCoins} klineChanges={klineData?.data} period={chartPeriod} />
          ) : <ChartSkeleton />}
        </ChartCard>

        {/* 3. Sector Performance */}
        <ChartCard
          title="Sector Performance"
          description="DeFi, L1, L2, Metaverse, Meme, Dino, AI 7개 크립토 섹터의 평균 수익률을 비교합니다. 시장 로테이션이 어디로 향하는지 파악할 수 있습니다."
        >
          {coins.length > 0 ? <SectorPerformanceChart coins={filteredCoins} /> : <ChartSkeleton />}
        </ChartCard>

        {/* 4. Funding Rate */}
        <ChartCard
          title={`Funding Rate (${fundingMode === 'annual' ? 'APR' : '8hrs'})`}
          description="각 코인의 펀딩 비율을 비교합니다. 양의 펀딩=롱 과다(과열), 음의 펀딩=숏 과다(공포). APR은 연환산, 8hrs는 8시간 기준입니다."
          extra={<FundingModeToggle mode={fundingMode} onChange={setFundingMode} />}
        >
          {coins.length > 0 ? <FundingRateScreenerChart coins={filteredCoins} mode={fundingMode} /> : <ChartSkeleton />}
        </ChartCard>

        {/* 5. OI Changes */}
        <ChartCard
          title="OI Changes"
          description="코인별 미결제약정(OI) 변화율(%)을 보여줍니다. OI 급증 = 새 포지션 대량 진입 → 큰 움직임 예고. OI 감소 = 포지션 정리 중. 서버 데이터 수집 후 변화율이 표시됩니다."
          extra={<PeriodTabs selected={chartPeriod} onChange={setChartPeriod} />}
        >
          {oiChangesData ? <OIChangesChart serverData={oiChangesData} period={chartPeriod} /> : <ChartSkeleton />}
        </ChartCard>

        {/* 6. Dominance */}
        <ChartCard
          title={`Dominance (${dominanceMetric === 'marketCap' ? 'Market Cap' : dominanceMetric === 'volume' ? 'Futures Vol' : 'Futures OI'})`}
          description="Market Cap: CoinGecko 시가총액 기준 도미넌스 (BTC ~58%). Futures Vol: 선물 거래량 기준. Futures OI: 미결제약정 기준. 시장 지배력 변화를 추적할 수 있습니다."
          extra={<DominanceToggle metric={dominanceMetric} onChange={setDominanceMetric} />}
        >
          {coins.length > 0 ? <DominanceChart coins={filteredCoins} metric={dominanceMetric} /> : <ChartSkeleton />}
        </ChartCard>

        {/* 7. Market Volume */}
        <ChartCard
          title="Market Volume (24h)"
          description="6개 거래소의 24시간 총 선물 거래량을 비교합니다. 유동성이 어느 거래소에 집중되어 있는지 보여줍니다."
        >
          {exchangeVolumes.length > 0 ? <MarketVolumeChart data={exchangeVolumes} /> : <ChartSkeleton />}
        </ChartCard>

        {/* 8. Total Open Interest (by Exchange) */}
        <ChartCard
          title="Total Open Interest"
          description="6개 거래소의 총 OI를 비교합니다. 어느 거래소에 포지션이 집중되는지 보여줍니다."
        >
          {exchangeOI.length > 0 ? <TotalOIChart data={exchangeOI} /> : <ChartSkeleton />}
        </ChartCard>

        {/* 9. Funding APR Heatmap */}
        <ChartCard
          title="Funding APR Heatmap"
          description="코인 × 시간 축의 히트맵으로 펀딩 비율의 시간별 변화를 시각화합니다. 빨강=양의 펀딩(롱 과열), 파랑=음의 펀딩(숏 과열). OI 가중 평균으로 계산됩니다."
          extra={<PeriodTabs selected={chartPeriod} onChange={setChartPeriod} />}
        >
          {fundingHeatmapData ? <FundingHeatmapChart data={fundingHeatmapData} /> : <ChartSkeleton />}
        </ChartCard>

        {/* 10. OI-Normalized CVD */}
        <ChartCard
          title="OI-Normalized CVD"
          description="CVD(Taker Buy - Sell 누적)를 전 거래소 OI로 정규화한 지표입니다. 양수=순매수 우세, 음수=순매도 우세. OI가 다른 코인을 동일 선상에서 비교합니다."
          extra={<PeriodTabs selected={chartPeriod} onChange={setChartPeriod} />}
        >
          {normalizedCVDData ? <NormalizedCVDChart data={normalizedCVDData} period={chartPeriod} /> : <ChartSkeleton />}
        </ChartCard>
      </div>
      )}
    </div>
  );
}

function ChartSkeleton() {
  return <div className="h-full w-full animate-pulse bg-muted rounded" />;
}
