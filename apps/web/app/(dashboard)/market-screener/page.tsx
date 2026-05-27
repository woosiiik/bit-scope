'use client';

import { useState, useCallback } from 'react';
import type { SortTab, CapFilter, SectorFilter } from '@bitscope/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { useMarketScreenerTickers } from '@/hooks/useMarketScreenerTickers';
import { useScreenerFilter } from '@/hooks/useScreenerFilter';
import { TabFilterBar } from './components/tab-filter-bar';
import { SearchInput } from './components/search-input';
import { ScreenerTable } from './components/screener-table';
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
        <Card>
          <CardContent className="p-3">
            <h3 className="text-xs font-medium text-foreground mb-2">Return Distribution (24h)</h3>
            <div className="h-[200px]">
              {coins.length > 0 ? <ReturnBucketsChart coins={coins} /> : <ChartSkeleton />}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <h3 className="text-xs font-medium text-foreground mb-2">Sector Performance (24h)</h3>
            <div className="h-[200px]">
              {coins.length > 0 ? <SectorPerformanceChart coins={coins} /> : <ChartSkeleton />}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <h3 className="text-xs font-medium text-foreground mb-2">Market Volume (24h)</h3>
            <div className="h-[200px]">
              {exchangeVolumes.length > 0 ? <MarketVolumeChart data={exchangeVolumes} /> : <ChartSkeleton />}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <h3 className="text-xs font-medium text-foreground mb-2">Total Open Interest</h3>
            <div className="h-[200px]">
              {exchangeOI.length > 0 ? <TotalOIChart data={exchangeOI} /> : <ChartSkeleton />}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return <div className="h-full w-full animate-pulse bg-muted rounded" />;
}
