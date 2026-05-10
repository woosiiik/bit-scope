/**
 * 고래 알림 위젯
 */

'use client';

import Link from 'next/link';
import { Fish } from 'lucide-react';
import { useWhaleAlerts, formatUsd } from '@/hooks/useMarketIntel';
import { cn } from '@/lib/utils';

function timeAgo(ts: number): string {
  const diffMin = Math.floor((Date.now() - ts) / 60_000);
  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return `${Math.floor(diffHour / 24)}일 전`;
}

function getTypeColor(type: string): string {
  if (type === 'exchange_deposit') return 'text-red-500';
  if (type === 'exchange_withdrawal') return 'text-green-500';
  return 'text-orange-500';
}

export function WhaleWidget() {
  const { data: transactions, isLoading } = useWhaleAlerts();

  return (
    <div className="flex flex-col h-full p-3 overflow-auto">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Whale Alert
        </h3>
        <Link href="/whale" className="text-[10px] text-primary hover:underline">
          전체보기
        </Link>
      </div>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground">로딩 중...</p>
        </div>
      )}

      {!isLoading && (!transactions || transactions.length === 0) && (
        <div className="flex-1 flex flex-col items-center justify-center gap-1">
          <Fish className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-[10px] text-muted-foreground">대량 거래 없음</p>
        </div>
      )}

      {transactions && transactions.length > 0 && (
        <div className="space-y-2 flex-1">
          {transactions.slice(0, 6).map((tx) => (
            <div key={tx.id} className="flex items-center gap-2 text-xs">
              <span className={cn('font-bold shrink-0', getTypeColor(tx.type))}>
                {tx.symbol}
              </span>
              <span className="font-semibold text-foreground">{formatUsd(tx.amountUsd)}</span>
              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                {timeAgo(tx.timestamp)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
