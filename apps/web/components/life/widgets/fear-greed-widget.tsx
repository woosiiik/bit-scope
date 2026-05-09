/**
 * 공포/탐욕 지수 위젯
 */

'use client';

import Link from 'next/link';
import { useFearGreed, getFearGreedColor, getFearGreedLabel } from '@/hooks/useMarketIntel';
import { cn } from '@/lib/utils';

export function FearGreedWidget() {
  const { data: entries, isLoading } = useFearGreed();
  const current = entries?.[0];

  return (
    <div className="flex flex-col h-full p-3 overflow-auto">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Fear & Greed
        </h3>
        <Link href="/fear-greed" className="text-[10px] text-primary hover:underline">
          상세보기
        </Link>
      </div>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground">로딩 중...</p>
        </div>
      )}

      {current && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <div className={cn('text-5xl font-black', getFearGreedColor(current.value))}>
            {current.value}
          </div>
          <div className={cn('text-sm font-bold', getFearGreedColor(current.value))}>
            {getFearGreedLabel(current.value)}
          </div>

          {/* 게이지 바 */}
          <div className="w-full px-2 mt-1">
            <div className="h-2.5 rounded-full bg-gradient-to-r from-red-600 via-yellow-500 to-green-600 relative">
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-foreground shadow"
                style={{ left: `${current.value}%`, transform: 'translate(-50%, -50%)' }}
              />
            </div>
            <div className="flex justify-between text-[8px] text-muted-foreground mt-0.5">
              <span>공포</span>
              <span>탐욕</span>
            </div>
          </div>

          {/* 최근 3일 */}
          {entries && entries.length >= 3 && (
            <div className="flex gap-3 mt-2">
              {entries.slice(1, 4).map((e, i) => (
                <div key={i} className="text-center">
                  <span className={cn('text-xs font-bold', getFearGreedColor(e.value))}>{e.value}</span>
                  <p className="text-[8px] text-muted-foreground">{i === 0 ? '어제' : `${i + 1}일전`}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
