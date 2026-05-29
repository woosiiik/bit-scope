'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { AggregatedCoin } from '@bitscope/shared';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ChevronUp, ChevronDown } from 'lucide-react';

function formatCompact(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function formatPrice(v: number): string {
  if (v >= 1000) return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (v >= 1) return `$${v.toFixed(4)}`;
  return `$${v.toPrecision(4)}`;
}

type SortKey = 'price' | 'change24h' | 'volume24h' | 'openInterest' | 'fundingRate';
type SortDir = 'asc' | 'desc';

interface ScreenerTableProps {
  coins: AggregatedCoin[];
  isLoading: boolean;
}

export function ScreenerTable({ coins, isLoading }: ScreenerTableProps) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    if (!sortKey) return coins;
    return [...coins].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      return sortDir === 'desc' ? bv - av : av - bv;
    });
  }, [coins, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-10 w-full animate-pulse bg-muted rounded" />
        ))}
      </div>
    );
  }

  if (coins.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        해당 조건에 맞는 코인이 없습니다
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px]" role="table">
        <thead>
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground w-10">#</th>
            <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground">Coin</th>
            <SortHeader label="Price" sortKey="price" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortHeader label="24h %" sortKey="change24h" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortHeader label="24h Volume" sortKey="volume24h" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortHeader label="Open Interest" sortKey="openInterest" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortHeader label="Funding" sortKey="fundingRate" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 500).map((coin, idx) => (
            <Link
              key={coin.symbol}
              href={`/futures-dashboard?coin=${coin.symbol}`}
              className="contents"
            >
              <tr className="border-b border-border last:border-b-0 hover:bg-muted/50 cursor-pointer transition-colors">
                <td className="px-3 py-2 text-xs text-muted-foreground">{idx + 1}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-foreground">{coin.symbol}</span>
                    {coin.isNewListing && <Badge variant="secondary" className="text-[9px] h-4">NEW</Badge>}
                  </div>
                </td>
                <td className="px-3 py-2 text-right text-xs text-foreground">{formatPrice(coin.price)}</td>
                <td className="px-3 py-2 text-right">
                  <span className={cn('text-xs font-medium', coin.change24h >= 0 ? 'text-profit' : 'text-loss')}>
                    {coin.change24h >= 0 ? '+' : ''}{coin.change24h.toFixed(2)}%
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-xs text-foreground">{formatCompact(coin.volume24h)}</td>
                <td className="px-3 py-2 text-right text-xs text-foreground">
                  {coin.openInterest > 0 ? formatCompact(coin.openInterest) : '-'}
                </td>
                <td className="px-3 py-2 text-right">
                  <span className={cn('text-xs', coin.fundingRate >= 0 ? 'text-profit' : 'text-loss')}>
                    {coin.fundingRate !== 0 ? `${(coin.fundingRate * 100).toFixed(4)}%` : '-'}
                  </span>
                </td>
              </tr>
            </Link>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortHeader({
  label, sortKey, currentKey, currentDir, onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey | null;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = currentKey === sortKey;
  return (
    <th
      className="px-3 py-2 text-right text-[11px] font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none"
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {isActive && (
          currentDir === 'desc'
            ? <ChevronDown className="h-3 w-3" />
            : <ChevronUp className="h-3 w-3" />
        )}
      </span>
    </th>
  );
}
