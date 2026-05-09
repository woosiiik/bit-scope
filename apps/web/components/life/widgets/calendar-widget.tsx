/**
 * 경제 캘린더 위젯
 */

'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { useEconomicCalendar } from '@/hooks/useMarketIntel';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

function getDaysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr + 'T00:00:00').getTime() - now.getTime()) / 86400000);
}

function getDaysLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}일 전`;
  if (days === 0) return '오늘!';
  if (days === 1) return '내일';
  return `D-${days}`;
}

const CAT_COLORS: Record<string, string> = {
  fomc: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  cpi: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  employment: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  gdp: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  crypto: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
};

export function CalendarWidget() {
  const { data: events, isLoading } = useEconomicCalendar();

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (events ?? []).filter((e) => e.date >= today).slice(0, 5);

  return (
    <div className="flex flex-col h-full p-3 overflow-auto">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Calendar
        </h3>
        <Link href="/calendar" className="text-[10px] text-primary hover:underline">
          전체보기
        </Link>
      </div>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground">로딩 중...</p>
        </div>
      )}

      {upcoming.length === 0 && !isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground">예정된 이벤트 없음</p>
        </div>
      )}

      <div className="space-y-2 flex-1">
        {upcoming.map((event) => {
          const days = getDaysUntil(event.date);
          const isImminent = days <= 3 && days >= 0;

          return (
            <div key={event.id} className={cn('rounded-md border p-2', isImminent ? 'border-red-300 dark:border-red-800' : 'border-border')}>
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className={cn('text-[8px]', CAT_COLORS[event.category])}>
                  {event.category.toUpperCase()}
                </Badge>
                <span className={cn('text-[10px] font-bold', isImminent ? 'text-red-500' : 'text-muted-foreground')}>
                  {getDaysLabel(days)}
                </span>
              </div>
              <p className="text-xs font-medium text-foreground mt-1 leading-snug">{event.titleKo}</p>
              {event.importance === 'high' && (
                <div className="flex items-center gap-0.5 mt-0.5">
                  <AlertTriangle className="h-2.5 w-2.5 text-red-500" />
                  <span className="text-[8px] text-red-500">중요도 높음</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
