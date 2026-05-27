'use client';

import { useState } from 'react';
import type { SortTab, CapFilter, SectorFilter } from '@bitscope/shared';
import { Button } from '@/components/ui/button';
import { Info } from 'lucide-react';

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
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="space-y-2">
      {/* 정렬 탭 + 도움말 버튼 */}
      <div className="flex items-center gap-2">
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
        <button
          type="button"
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setShowHelp(!showHelp)}
          aria-label="필터 설명"
        >
          <Info className="h-4 w-4" />
        </button>
      </div>

      {/* 도움말 패널 */}
      {showHelp && (
        <div className="rounded-md bg-muted/50 border border-border p-3 text-[11px] text-muted-foreground leading-relaxed space-y-3">
          <div>
            <p className="font-medium text-foreground mb-1">정렬</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {SORT_TABS.map((t) => (
                <div key={t.key}><span className="font-medium text-foreground">{t.label}</span> — {t.desc}</div>
              ))}
            </div>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">시가총액</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {CAP_FILTERS.filter((c) => c.key !== 'all').map((c) => (
                <div key={c.key}><span className="font-medium text-foreground">{c.label}</span> — {c.desc}</div>
              ))}
            </div>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">섹터</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {SECTOR_FILTERS.filter((s) => s.key !== 'all').map((s) => (
                <div key={s.key}><span className="font-medium text-foreground">{s.label}</span> — {s.desc}</div>
              ))}
            </div>
          </div>
        </div>
      )}

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
