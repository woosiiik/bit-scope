'use client';

import { useState, useCallback } from 'react';
import type { SortTab, CapFilter, SectorFilter } from '@bitscope/shared';
import { Card, CardContent } from '@/components/ui/card'; // ScreenerTable wrapper
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { useMarketScreenerTickers } from '@/hooks/useMarketScreenerTickers';
import { useScreenerFilter } from '@/hooks/useScreenerFilter';
import { TabFilterBar } from './components/tab-filter-bar';
import { SearchInput } from './components/search-input';
import { ScreenerTable } from './components/screener-table';
import { ChartCard } from './components/chart-card';
import { ReturnBucketsChart } from './components/charts/return-buckets-chart';
import { MarketVolumeChart } from './components/charts/market-volume-chart';
import { TotalOIChart } from './components/charts/total-oi-chart';
import { SectorPerformanceChart } from './components/charts/sector-performance-chart';

export default function MarketScreenerPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: response, isLoading, error } = useMarketScreenerTickers();

  const [sortTab, setSortTab] = useState<SortTab>('topVolume');
  const [capFilter, setCapFilter] = useState<CapFilter>('all');
  const [sectorFilter, setSectorFilter] = useState<SectorFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const coins = response?.data?.coins ?? [];
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
              {coins.length} coins from {response.exchangeCount ?? 0} exchanges
              {errors && Object.keys(errors).length > 0 && (
                <span className="text-destructive ml-2">
                  ({Object.keys(errors).length} exchange errors)
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <SearchInput value={searchQuery} onChange={setSearchQuery} />
          <Button variant="outline" size="sm" className="h-8" onClick={handleRefresh}>
            <RefreshCw className="h-3.5 w-3.5" />
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

      {/* 필터 탭 */}
      <TabFilterBar
        sortTab={sortTab}
        capFilter={capFilter}
        sectorFilter={sectorFilter}
        onSortTabChange={setSortTab}
        onCapFilterChange={setCapFilter}
        onSectorFilterChange={setSectorFilter}
      />

      {/* 스크리너 테이블 */}
      <Card>
        <CardContent className="p-0">
          <ScreenerTable coins={filteredCoins} isLoading={isLoading} />
        </CardContent>
      </Card>

      {/* 차트 위젯 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard
          title="Return Distribution (24h)"
          description="24시간 동안 각 코인의 수익률을 구간별로 분류한 히스토그램입니다. 시장 전체의 수익률 분포를 한눈에 파악하여 과열/공포 상태를 진단할 수 있습니다. 막대 위에 마우스를 올리면 해당 구간의 코인 목록이 표시됩니다."
        >
          {coins.length > 0 ? <ReturnBucketsChart coins={coins} /> : <ChartSkeleton />}
        </ChartCard>

        <ChartCard
          title="Sector Performance (24h)"
          description="DeFi, L1, L2, Metaverse, Meme, AI 6개 크립토 섹터의 24시간 평균 수익률을 비교합니다. 어떤 섹터에 자금이 몰리고 있는지, 시장 로테이션이 어디로 향하는지 파악할 수 있습니다."
        >
          {coins.length > 0 ? <SectorPerformanceChart coins={coins} /> : <ChartSkeleton />}
        </ChartCard>

        <ChartCard
          title="Market Volume (24h)"
          description="6개 거래소(Binance, Bybit, OKX, Gate.io, Bitget, Hyperliquid)의 24시간 총 선물 거래량을 비교합니다. 유동성이 어느 거래소에 집중되어 있는지 보여줍니다."
        >
          {exchangeVolumes.length > 0 ? <MarketVolumeChart data={exchangeVolumes} /> : <ChartSkeleton />}
        </ChartCard>

        <ChartCard
          title="Total Open Interest"
          description="6개 거래소의 총 미결제약정(OI)을 비교합니다. 시장에 얼마나 많은 선물 포지션이 열려 있는지, 어느 거래소에 포지션이 집중되는지 보여줍니다. OI 급증은 큰 움직임의 전조일 수 있습니다."
        >
          {exchangeOI.length > 0 ? <TotalOIChart data={exchangeOI} /> : <ChartSkeleton />}
        </ChartCard>
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return <div className="h-full w-full animate-pulse bg-muted rounded" />;
}
