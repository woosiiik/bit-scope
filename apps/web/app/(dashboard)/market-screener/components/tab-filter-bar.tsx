'use client';

import type { SortTab, CapFilter, SectorFilter } from '@bitscope/shared';
import { Button } from '@/components/ui/button';

const SORT_TABS: { key: SortTab; label: string; desc: string }[] = [
  { key: 'topGainers', label: 'Top Gainers', desc: '24시간 가격 상승률이 가장 높은 코인' },
  { key: 'topLosers', label: 'Top Losers', desc: '24시간 가격 하락률이 가장 큰 코인' },
  { key: 'topVolume', label: 'Top Volume', desc: '24시간 선물 거래량이 가장 큰 코인' },
  { key: 'newListings', label: 'New Listings', desc: '최근 30일 이내 거래소에 신규 상장된 코인' },
];

const CAP_FILTERS: { key: CapFilter; label: string; desc: string }[] = [
  { key: 'all', label: 'All', desc: '모든 시가총액' },
  { key: 'large', label: 'Large Cap', desc: '시가총액 $10B 이상 (BTC, ETH, SOL 등)' },
  { key: 'mid', label: 'Mid Cap', desc: '시가총액 $1B ~ $10B (AAVE, ARB, SUI 등)' },
  { key: 'small', label: 'Small Cap', desc: '시가총액 $1B 미만 (변동성 높은 코인)' },
];

const SECTOR_FILTERS: { key: SectorFilter; label: string; desc: string }[] = [
  { key: 'all', label: 'All', desc: '모든 섹터' },
  { key: 'DeFi', label: 'DeFi', desc: '탈중앙화 금융 (AAVE, UNI, MKR, CRV 등)' },
  { key: 'L1', label: 'L1', desc: '레이어 1 블록체인 (BTC, ETH, SOL, AVAX 등)' },
  { key: 'L2', label: 'L2', desc: '레이어 2 스케일링 (ARB, OP, ZK, STRK 등)' },
  { key: 'Metaverse', label: 'Metaverse', desc: '메타버스/게이밍 (SAND, AXS, GALA 등)' },
  { key: 'Meme', label: 'Meme', desc: '밈 코인 (DOGE, SHIB, PEPE, BONK 등)' },
  { key: 'Dino', label: 'Dino', desc: '2017년 이전 출시된 베테랑 코인 (LTC, XRP, XMR 등)' },
  { key: 'AI', label: 'AI', desc: 'AI/머신러닝 프로젝트 (FET, RENDER, TAO 등)' },
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
          <TooltipButton
            key={tab.key}
            label={tab.label}
            desc={tab.desc}
            isActive={sortTab === tab.key}
            onClick={() => onSortTabChange(tab.key)}
            size="normal"
          />
        ))}
      </div>
      {/* 시가총액 + 섹터 */}
      <div className="flex items-center gap-3 overflow-x-auto">
        <div className="flex items-center gap-0.5">
          {CAP_FILTERS.map((cap) => (
            <TooltipButton
              key={cap.key}
              label={cap.label}
              desc={cap.desc}
              isActive={capFilter === cap.key}
              onClick={() => onCapFilterChange(cap.key)}
              size="small"
              variant="ghost"
            />
          ))}
        </div>
        <div className="w-px h-4 bg-border" />
        <div className="flex items-center gap-0.5">
          {SECTOR_FILTERS.map((s) => (
            <TooltipButton
              key={s.key}
              label={s.label}
              desc={s.desc}
              isActive={sectorFilter === s.key}
              onClick={() => onSectorFilterChange(s.key)}
              size="small"
              variant="ghost"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** 호버 시 설명 tooltip이 나오는 버튼 */
function TooltipButton({
  label, desc, isActive, onClick, size, variant,
}: {
  label: string;
  desc: string;
  isActive: boolean;
  onClick: () => void;
  size: 'normal' | 'small';
  variant?: 'ghost';
}) {
  const activeVariant = isActive ? 'default' : (variant ?? 'outline');
  const sizeClass = size === 'normal'
    ? 'text-xs h-7 shrink-0'
    : 'text-[10px] h-6 px-2 shrink-0';

  return (
    <div className="relative group">
      <Button
        variant={activeVariant}
        size="sm"
        className={sizeClass}
        onClick={onClick}
      >
        {label}
      </Button>
      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover:block z-50 w-max max-w-[200px] rounded bg-popover text-popover-foreground border border-border px-2.5 py-1.5 text-[10px] shadow-md whitespace-normal pointer-events-none">
        {desc}
        <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-border" />
      </div>
    </div>
  );
}
