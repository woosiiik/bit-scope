/**
 * 공포/탐욕 지수 페이지
 */

'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { Gauge, Loader2 } from 'lucide-react';

import { useFearGreed, getFearGreedColor, getFearGreedLabel, getFearGreedBgColor } from '@/hooks/useMarketIntel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

export default function FearGreedPage() {
  const { data: entries, isLoading } = useFearGreed();
  const current = entries?.[0];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Gauge className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold text-foreground">Fear & Greed Index</h1>
        <span className="text-xs text-muted-foreground">Alternative.me</span>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {current && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 현재 게이지 */}
          <Card className="md:col-span-1">
            <CardContent className="flex flex-col items-center justify-center py-8">
              <div className={cn('text-6xl font-black', getFearGreedColor(current.value))}>
                {current.value}
              </div>
              <div className={cn('mt-2 text-lg font-bold', getFearGreedColor(current.value))}>
                {getFearGreedLabel(current.value)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{current.classification}</p>

              {/* 시각적 바 */}
              <div className="w-full mt-4 px-4">
                <div className="h-3 rounded-full bg-gradient-to-r from-red-600 via-yellow-500 to-green-600 relative">
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-foreground shadow"
                    style={{ left: `${current.value}%`, transform: 'translate(-50%, -50%)' }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>극도의 공포</span>
                  <span>중립</span>
                  <span>극도의 탐욕</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 추이 차트 */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">30일 추이</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={[...(entries ?? [])].reverse()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="timestamp" tickFormatter={formatDate} tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <ReferenceLine y={50} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                    <ReferenceLine y={20} stroke="hsl(0, 84%, 60%)" strokeDasharray="2 2" />
                    <ReferenceLine y={80} stroke="hsl(142, 76%, 36%)" strokeDasharray="2 2" />
                    <Tooltip
                      labelFormatter={(v) => formatDate(v as number)}
                      formatter={(v: number) => [v, '공포/탐욕']}
                    />
                    <Line type="monotone" dataKey="value" stroke="hsl(217.2, 91.2%, 59.8%)" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 이력 테이블 */}
      {entries && entries.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">최근 이력</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {entries.slice(0, 10).map((entry, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-border p-2">
                  <div className={cn('text-lg font-bold w-8 text-center', getFearGreedColor(entry.value))}>
                    {entry.value}
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">{formatDate(entry.timestamp)}</p>
                    <p className={cn('text-xs font-medium', getFearGreedColor(entry.value))}>{getFearGreedLabel(entry.value)}</p>
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
