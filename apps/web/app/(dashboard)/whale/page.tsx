/**
 * 고래 알림 페이지
 */

'use client';

import { Fish, Loader2, ArrowRight } from 'lucide-react';

import { useWhaleAlerts, formatUsd, type WhaleTransaction } from '@/hooks/useMarketIntel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'exchange_deposit': return '거래소 입금';
    case 'exchange_withdrawal': return '거래소 출금';
    case 'large_trade': return '대량 거래';
    default: return '이체';
  }
}

function getTypeColor(type: string): string {
  switch (type) {
    case 'exchange_deposit': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    case 'exchange_withdrawal': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    case 'large_trade': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
    default: return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
  }
}

export default function WhalePage() {
  const { data: transactions, isLoading } = useWhaleAlerts();

  const totalVolume = (transactions ?? []).reduce((sum, tx) => sum + tx.amountUsd, 0);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Fish className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold text-foreground">Whale Alert</h1>
        <span className="text-xs text-muted-foreground">대량 거래 감지</span>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* 요약 카드 */}
      {transactions && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">감지된 거래</p>
              <p className="text-2xl font-bold text-foreground">{transactions.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">총 거래량</p>
              <p className="text-2xl font-bold text-foreground">{formatUsd(totalVolume)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">최소 기준</p>
              <p className="text-2xl font-bold text-foreground">$1M+</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 거래 목록 */}
      {(!transactions || transactions.length === 0) && !isLoading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Fish className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-sm text-muted-foreground">최근 대량 거래가 없습니다</p>
          </CardContent>
        </Card>
      )}

      {transactions && transactions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">최근 대량 거래</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  {/* 코인 */}
                  <div className="text-center shrink-0">
                    <p className="text-sm font-bold text-foreground">{tx.symbol}</p>
                    <p className="text-[10px] text-muted-foreground">{tx.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                  </div>

                  {/* 금액 */}
                  <div className="flex-1">
                    <p className="text-lg font-bold text-foreground">{formatUsd(tx.amountUsd)}</p>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span>{tx.from}</span>
                      <ArrowRight className="h-3 w-3" />
                      <span>{tx.to}</span>
                    </div>
                  </div>

                  {/* 유형 + 시간 */}
                  <div className="text-right shrink-0">
                    <Badge variant="secondary" className={cn('text-[10px]', getTypeColor(tx.type))}>
                      {getTypeLabel(tx.type)}
                    </Badge>
                    <p className="text-[10px] text-muted-foreground mt-1">{formatTime(tx.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
