/**
 * 경제 캘린더 페이지
 *
 * 상단: 달력 뷰 (이벤트 있는 날짜에 점 표시, 클릭 시 하단 포커스)
 * 하단: 선택 날짜의 이벤트 상세 / 전체 이벤트 타임라인
 */

'use client';

import { useState, useMemo, useRef } from 'react';
import { Calendar as CalendarIcon, AlertTriangle, ChevronLeft, ChevronRight, Loader2, Clock } from 'lucide-react';

import { useEconomicCalendar, type EconomicEvent } from '@/hooks/useMarketIntel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const CAT_COLORS: Record<string, string> = {
  fomc: 'bg-red-500', cpi: 'bg-orange-500', employment: 'bg-blue-500',
  gdp: 'bg-green-500', crypto: 'bg-purple-500', consumer: 'bg-teal-500',
  pmi: 'bg-indigo-500', other: 'bg-gray-500',
};

const CAT_BADGE_COLORS: Record<string, string> = {
  fomc: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  cpi: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  employment: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  gdp: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  crypto: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  consumer: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
  pmi: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

const CAT_LABELS: Record<string, string> = {
  fomc: 'FOMC', cpi: 'CPI', employment: '고용', gdp: 'GDP',
  crypto: '크립토', consumer: '소비', pmi: 'PMI', other: '기타',
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function getDaysUntil(dateStr: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr + 'T00:00:00').getTime() - now.getTime()) / 86400000);
}

function getDaysLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}일 전`;
  if (days === 0) return '오늘';
  if (days === 1) return '내일';
  return `D-${days}`;
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });
}

export default function CalendarPage() {
  const { data: events, isLoading } = useEconomicCalendar();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const detailRef = useRef<HTMLDivElement>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const todayStr = new Date().toISOString().slice(0, 10);

  // 달력 그리드
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  }, [year, month]);

  // 날짜별 이벤트 맵
  const eventsByDate = useMemo(() => {
    const map = new Map<string, EconomicEvent[]>();
    for (const event of events ?? []) {
      const existing = map.get(event.date) ?? [];
      existing.push(event);
      map.set(event.date, existing);
    }
    return map;
  }, [events]);

  // 선택한 날짜의 이벤트
  const selectedEvents = selectedDate ? (eventsByDate.get(selectedDate) ?? []) : [];

  // 전체 이벤트 (시간순)
  const allEvents = events ?? [];

  // 날짜 클릭 시 상세로 스크롤
  const handleDateClick = (dateStr: string) => {
    const dayEvents = eventsByDate.get(dateStr);
    if (!dayEvents || dayEvents.length === 0) return;
    setSelectedDate(dateStr);
    setTimeout(() => {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <CalendarIcon className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold text-foreground">Economic Calendar</h1>
        <span className="text-xs text-muted-foreground">Forex Factory</span>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && (
        <>
          {/* 달력 뷰 */}
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
              {/* 요일 */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {WEEKDAYS.map((day, i) => (
                  <div key={day} className={cn('text-center text-[10px] font-medium py-1', i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-muted-foreground')}>
                    {day}
                  </div>
                ))}
              </div>

              {/* 날짜 그리드 */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, i) => {
                  if (day === null) return <div key={`empty-${i}`} className="h-20" />;

                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const dayEvents = eventsByDate.get(dateStr) ?? [];
                  const isToday = dateStr === todayStr;
                  const isSelected = dateStr === selectedDate;
                  const dow = new Date(year, month, day).getDay();
                  const hasEvents = dayEvents.length > 0;

                  return (
                    <button
                      key={dateStr}
                      type="button"
                      onClick={() => handleDateClick(dateStr)}
                      disabled={!hasEvents}
                      className={cn(
                        'h-20 rounded-md border p-1 text-left transition-colors flex flex-col items-start',
                        isSelected ? 'border-primary bg-primary/10 ring-1 ring-primary' :
                        isToday ? 'border-primary bg-primary/5' :
                        hasEvents ? 'border-border hover:border-primary/50 cursor-pointer' :
                        'border-transparent',
                      )}
                    >
                      <span className={cn(
                        'text-[10px] font-medium',
                        isToday ? 'text-primary font-bold' : dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-foreground',
                      )}>{day}</span>

                      {/* 이벤트 표시: 축약 제목으로 표시 */}
                      <div className="mt-0.5 space-y-0.5 overflow-hidden">
                        {dayEvents.slice(0, 3).map((event) => (
                          <div
                            key={event.id}
                            className={cn('flex items-center gap-0.5 text-[7px] leading-tight')}
                            title={event.titleKo}
                          >
                            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', CAT_COLORS[event.category] ?? 'bg-gray-500')} />
                            <span className="truncate text-foreground/70">{event.titleKo}</span>
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <span className="text-[7px] text-muted-foreground">+{dayEvents.length - 3}개</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* 범례 */}
              <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-border">
                {Object.entries(CAT_LABELS).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-1">
                    <div className={cn('w-2 h-2 rounded-full', CAT_COLORS[key])} />
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 상세 영역 */}
          <div ref={detailRef}>
            {/* 선택한 날짜의 이벤트 상세 */}
            {selectedDate && selectedEvents.length > 0 && (
              <Card className="border-primary/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    {formatFullDate(selectedDate)}
                    <Badge variant="outline" className="text-[10px]">{getDaysLabel(getDaysUntil(selectedDate))}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {selectedEvents.map((event) => (
                      <div key={event.id} className="rounded-lg border border-border p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary" className={cn('text-[10px]', CAT_BADGE_COLORS[event.category])}>
                            {CAT_LABELS[event.category] ?? event.category}
                          </Badge>
                          {event.importance === 'high' && (
                            <AlertTriangle className="h-3 w-3 text-red-500" />
                          )}
                          {event.country && (
                            <Badge variant="outline" className="text-[8px] px-1 py-0">{event.country}</Badge>
                          )}
                          {event.time && (
                            <span className="text-[10px] text-muted-foreground">{event.time}</span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-foreground">{event.titleKo}</p>
                        {event.title !== event.titleKo && (
                          <p className="text-[10px] text-muted-foreground italic">{event.title}</p>
                        )}
                        {(event.forecast || event.previous) && (
                          <div className="flex gap-4 mt-1.5 text-xs">
                            {event.forecast && (
                              <span className="text-muted-foreground">예상: <span className="text-foreground font-medium">{event.forecast}</span></span>
                            )}
                            {event.previous && (
                              <span className="text-muted-foreground">이전: <span className="text-foreground font-medium">{event.previous}</span></span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 전체 이벤트 타임라인 */}
            {allEvents.length > 0 && (
              <Card className={selectedDate ? 'mt-4' : ''}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">전체 이벤트</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative pl-6">
                    <div className="absolute left-2 top-0 bottom-0 w-px bg-border" />
                    <div className="space-y-3">
                      {allEvents.map((event) => {
                        const days = getDaysUntil(event.date);
                        const isPast = days < 0;
                        return (
                          <div key={event.id} className="relative">
                            <div className={cn(
                              'absolute -left-4 top-1.5 w-2.5 h-2.5 rounded-full border-2 border-background',
                              isPast ? 'bg-muted-foreground/30' : CAT_COLORS[event.category] ?? 'bg-gray-500',
                            )} />
                            <div className={cn('flex items-center gap-2 text-xs', isPast && 'opacity-50')}>
                              <span className="w-14 shrink-0 text-[10px] text-muted-foreground">{event.date.slice(5)}</span>
                              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', CAT_COLORS[event.category])} />
                              <span className="font-medium text-foreground truncate">{event.titleKo}</span>
                              {event.country && <Badge variant="outline" className="text-[8px] px-1 py-0 shrink-0">{event.country}</Badge>}
                              {event.importance === 'high' && <AlertTriangle className="h-2.5 w-2.5 text-red-500 shrink-0" />}
                              <span className={cn('text-[10px] shrink-0 ml-auto', days === 0 ? 'text-red-500 font-bold' : 'text-muted-foreground')}>
                                {getDaysLabel(days)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
