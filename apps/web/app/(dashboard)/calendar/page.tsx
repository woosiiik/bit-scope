/**
 * 경제 캘린더 페이지
 *
 * 상단: 임박한 이벤트 타임라인 (D-7 이내)
 * 하단: 월별 달력 뷰
 */

'use client';

import { useState, useMemo } from 'react';
import { Calendar as CalendarIcon, AlertTriangle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

import { useEconomicCalendar, type EconomicEvent } from '@/hooks/useMarketIntel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const CAT_COLORS: Record<string, string> = {
  fomc: 'bg-red-500',
  cpi: 'bg-orange-500',
  employment: 'bg-blue-500',
  gdp: 'bg-green-500',
  crypto: 'bg-purple-500',
  other: 'bg-gray-500',
};

const CAT_BADGE_COLORS: Record<string, string> = {
  fomc: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  cpi: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  employment: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  gdp: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  crypto: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
};

const CAT_LABELS: Record<string, string> = {
  fomc: 'FOMC', cpi: 'CPI', employment: '고용', gdp: 'GDP', crypto: '크립토', other: '기타',
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function getDaysUntil(dateStr: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr + 'T00:00:00').getTime() - now.getTime()) / 86400000);
}

function getDaysLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}일 전`;
  if (days === 0) return '오늘!';
  if (days === 1) return '내일';
  return `D-${days}`;
}

/** 타임라인 컴포넌트 (임박 이벤트) */
function ImminentTimeline({ events }: { events: EconomicEvent[] }) {
  if (events.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          임박한 이벤트
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative pl-6">
          <div className="absolute left-2 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-4">
            {events.map((event) => {
              const days = getDaysUntil(event.date);
              const isToday = days === 0;
              return (
                <div key={event.id} className="relative">
                  <div className={cn(
                    'absolute -left-4 top-1 w-3 h-3 rounded-full border-2 border-background',
                    isToday ? 'bg-red-500 ring-2 ring-red-500/30' : CAT_COLORS[event.category] ?? 'bg-gray-500',
                  )} />
                  <div className={cn(
                    'rounded-lg border p-3',
                    isToday ? 'border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20' : 'border-border',
                  )}>
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="secondary" className={cn('text-[10px]', CAT_BADGE_COLORS[event.category])}>
                        {CAT_LABELS[event.category] ?? event.category}
                      </Badge>
                      <span className={cn('text-xs font-bold', isToday ? 'text-red-500' : days <= 3 ? 'text-orange-500' : 'text-primary')}>
                        {getDaysLabel(days)}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{event.titleKo}</p>
                    {event.title !== event.titleKo && (
                      <p className="text-[10px] text-muted-foreground italic">{event.title}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                      <span>{new Date(event.date + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}</span>
                      {event.country && <Badge variant="outline" className="text-[8px] px-1 py-0">{event.country}</Badge>}
                      {event.forecast && <span>예상: {event.forecast}</span>}
                      {event.previous && <span>이전: {event.previous}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** 달력 뷰 컴포넌트 */
function CalendarView({ events }: { events: EconomicEvent[] }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  }, [year, month]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, EconomicEvent[]>();
    for (const event of events) {
      const existing = map.get(event.date) ?? [];
      existing.push(event);
      map.set(event.date, existing);
    }
    return map;
  }, [events]);

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{year}년 {month + 1}월</CardTitle>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="h-7 w-7 p-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="h-7 w-7 p-0">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((day, i) => (
            <div key={day} className={cn('text-center text-[10px] font-medium py-1', i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-muted-foreground')}>
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} className="h-16" />;

            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayEvents = eventsByDate.get(dateStr) ?? [];
            const isToday = dateStr === todayStr;
            const dow = new Date(year, month, day).getDay();

            return (
              <div key={dateStr} className={cn(
                'h-16 rounded-md border p-1 text-xs transition-colors',
                isToday ? 'border-primary bg-primary/5' : 'border-transparent hover:border-border',
                dayEvents.length > 0 && 'bg-accent/50',
              )}>
                <span className={cn(
                  'text-[10px] font-medium',
                  isToday ? 'text-primary font-bold' : dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-foreground',
                )}>{day}</span>
                <div className="mt-0.5 space-y-0.5">
                  {dayEvents.slice(0, 2).map((event) => (
                    <div key={event.id} className={cn('rounded px-1 py-0.5 text-[8px] font-medium truncate text-white', CAT_COLORS[event.category] ?? 'bg-gray-500')} title={event.titleKo}>
                      {CAT_LABELS[event.category] ?? event.category}
                    </div>
                  ))}
                  {dayEvents.length > 2 && <span className="text-[8px] text-muted-foreground">+{dayEvents.length - 2}</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-border">
          {Object.entries(CAT_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1">
              <div className={cn('w-2.5 h-2.5 rounded-sm', CAT_COLORS[key])} />
              <span className="text-[10px] text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function CalendarPage() {
  const { data: events, isLoading } = useEconomicCalendar();

  const imminent = (events ?? []).filter((e) => {
    const days = getDaysUntil(e.date);
    return days >= 0 && days <= 7;
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <CalendarIcon className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold text-foreground">Economic Calendar</h1>
        <span className="text-xs text-muted-foreground">매크로 이벤트</span>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && (
        <>
          <ImminentTimeline events={imminent} />
          <CalendarView events={events ?? []} />
        </>
      )}
    </div>
  );
}
