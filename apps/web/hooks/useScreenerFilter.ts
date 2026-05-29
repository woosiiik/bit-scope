'use client';

import { useMemo } from 'react';
import type { AggregatedCoin, SortTab, CapFilter, SectorFilter, CoinSector } from '@bitscope/shared';

interface FilterState {
  sortTab: SortTab;
  capFilter: CapFilter;
  sectorFilter: SectorFilter;
  searchQuery: string;
}

export function useScreenerFilter(coins: AggregatedCoin[], state: FilterState): AggregatedCoin[] {
  return useMemo(() => {
    let filtered = [...coins];

    // 1. 검색 필터 (심볼 또는 코인 이름)
    if (state.searchQuery) {
      const q = state.searchQuery.toUpperCase();
      filtered = filtered.filter(
        (c) => c.symbol.includes(q) || (c.name?.toUpperCase().includes(q) ?? false),
      );
    }

    // 2. 시가총액 필터
    if (state.capFilter !== 'all') {
      filtered = filtered.filter((c) => c.marketCap === state.capFilter);
    }

    // 3. 섹터 필터
    if (state.sectorFilter !== 'all') {
      const sector = state.sectorFilter as CoinSector;
      filtered = filtered.filter((c) => c.sectors.includes(sector));
    }

    // 4. 정렬
    switch (state.sortTab) {
      case 'topGainers':
        filtered.sort((a, b) => b.change24h - a.change24h);
        break;
      case 'topLosers':
        filtered.sort((a, b) => a.change24h - b.change24h);
        break;
      case 'topVolume':
        filtered.sort((a, b) => b.volume24h - a.volume24h);
        break;
      case 'newListings':
        filtered = filtered.filter((c) => c.isNewListing);
        filtered.sort((a, b) => (b.listDate ?? 0) - (a.listDate ?? 0));
        break;
    }

    return filtered;
  }, [coins, state.sortTab, state.capFilter, state.sectorFilter, state.searchQuery]);
}
