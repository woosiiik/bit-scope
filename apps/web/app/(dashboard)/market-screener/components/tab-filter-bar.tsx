'use client';

import type { SortTab, CapFilter, SectorFilter } from '@bitscope/shared';
import { Button } from '@/components/ui/button';

const SORT_TABS: { key: SortTab; label: string }[] = [
  { key: 'topGainers', label: 'Top Gainers' },
  { key: 'topLosers', label: 'Top Losers' },
  { key: 'topVolume', label: 'Top Volume' },
  { key: 'newListings', label: 'New Listings' },
];

const CAP_FILTERS: { key: CapFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'large', label: 'Large Cap' },
  { key: 'mid', label: 'Mid Cap' },
  { key: 'small', label: 'Small Cap' },
];

const SECTOR_FILTERS: { key: SectorFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'DeFi', label: 'DeFi' },
  { key: 'L1', label: 'L1' },
  { key: 'L2', label: 'L2' },
  { key: 'Metaverse', label: 'Metaverse' },
  { key: 'Meme', label: 'Meme' },
  { key: 'Dino', label: 'Dino' },
  { key: 'AI', label: 'AI' },
];

interface TabFilterBarProps {
  sortTab: SortTab;
  capFilter: CapFilter;
  sectorFilter: SectorFilter;
  onSortTabChange: (tab: SortTab) => void;
  onCapFilterChange: (cap: CapFilter) => void;
  onSectorFilterChange: (sector: SectorFilter) => void;
}

export function TabFilterBar({
  sortTab, capFilter, sectorFilter,
  onSortTabChange, onCapFilterChange, onSectorFilterChange,
}: TabFilterBarProps) {
  return (
    <div className="space-y-2">
      {/* 정렬 탭 */}
      <div className="flex items-center gap-1 overflow-x-auto">
        {SORT_TABS.map((tab) => (
          <Button
            key={tab.key}
            variant={sortTab === tab.key ? 'default' : 'outline'}
            size="sm"
            className="text-xs h-7 shrink-0"
            onClick={() => onSortTabChange(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>
      {/* 시가총액 + 섹터 */}
      <div className="flex items-center gap-3 overflow-x-auto">
        <div className="flex items-center gap-0.5">
          {CAP_FILTERS.map((cap) => (
            <Button
              key={cap.key}
              variant={capFilter === cap.key ? 'default' : 'ghost'}
              size="sm"
              className="text-[10px] h-6 px-2 shrink-0"
              onClick={() => onCapFilterChange(cap.key)}
            >
              {cap.label}
            </Button>
          ))}
        </div>
        <div className="w-px h-4 bg-border" />
        <div className="flex items-center gap-0.5">
          {SECTOR_FILTERS.map((s) => (
            <Button
              key={s.key}
              variant={sectorFilter === s.key ? 'default' : 'ghost'}
              size="sm"
              className="text-[10px] h-6 px-2 shrink-0"
              onClick={() => onSectorFilterChange(s.key)}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
