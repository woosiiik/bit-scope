'use client';

import { useRouter } from 'next/navigation';
import type { AggregatedCoin } from '@bitscope/shared';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

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

interface ScreenerTableProps {
  coins: AggregatedCoin[];
  isLoading: boolean;
}

export function ScreenerTable({ coins, isLoading }: ScreenerTableProps) {
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="space-y-2">
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
            <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground">#</th>
            <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground">Coin</th>
            <th className="px-3 py-2 text-right text-[11px] font-medium text-muted-foreground">Price</th>
            <th className="px-3 py-2 text-right text-[11px] font-medium text-muted-foreground">24h %</th>
            <th className="px-3 py-2 text-right text-[11px] font-medium text-muted-foreground">24h Volume</th>
            <th className="px-3 py-2 text-right text-[11px] font-medium text-muted-foreground">Open Interest</th>
            <th className="px-3 py-2 text-right text-[11px] font-medium text-muted-foreground">Funding</th>
          </tr>
        </thead>
        <tbody>
          {coins.slice(0, 100).map((coin, idx) => (
            <tr
              key={coin.symbol}
              className="border-b border-border last:border-b-0 hover:bg-muted/50 cursor-pointer transition-colors"
              onClick={() => router.push(`/futures-dashboard?coin=${coin.symbol}`)}
            >
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
