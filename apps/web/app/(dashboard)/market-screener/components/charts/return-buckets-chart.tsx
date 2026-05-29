'use client';

import { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import type { AggregatedCoin, ReturnBucket, ChartPeriod } from '@bitscope/shared';

/** 선택 기간에 해당하는 코인 수익률을 반환 (1d=ticker change24h, 그 외=kline 변화율) */
function coinReturn(coin: AggregatedCoin, period: ChartPeriod, kline?: Record<string, number>): number | null {
  if (period === '1d') return coin.change24h;
  const v = kline?.[coin.symbol];
  return typeof v === 'number' ? v : null;
}

function buildBuckets(
  coins: AggregatedCoin[],
  period: ChartPeriod,
  kline?: Record<string, number>,
): ReturnBucket[] {
  const ranges = [-30, -20, -10, -5, -2, 0, 2, 5, 10, 20, 30];
  const buckets: ReturnBucket[] = [];

  for (let i = 0; i < ranges.length - 1; i++) {
    const min = ranges[i]!;
    const max = ranges[i + 1]!;
    buckets.push({ rangeLabel: `${min}% ~ ${max}%`, rangeMin: min, rangeMax: max, count: 0, coins: [] });
  }
  buckets.unshift({ rangeLabel: '< -30%', rangeMin: -Infinity, rangeMax: -30, count: 0, coins: [] });
  buckets.push({ rangeLabel: '> 30%', rangeMin: 30, rangeMax: Infinity, count: 0, coins: [] });

  for (const coin of coins) {
    const ret = coinReturn(coin, period, kline);
    if (ret === null) continue; // 1w/1m에서 kline 데이터 없는 코인은 제외
    const bucket = buckets.find((b) => ret >= b.rangeMin && ret < b.rangeMax);
    if (bucket) {
      bucket.count++;
      bucket.coins.push({ symbol: coin.symbol, change: ret });
    }
  }

  return buckets;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ReturnBucket }>;
}

function BucketTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const b = payload[0]!.payload;
  const list = [...b.coins].sort((x, y) => y.change - x.change).slice(0, 12);
  return (
    <div style={{ fontSize: 11, background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', maxWidth: 220 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{b.rangeLabel} · {b.count} coins</div>
      {list.map((c) => (
        <div key={c.symbol} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{c.symbol}</span>
          <span style={{ color: c.change >= 0 ? 'hsl(var(--profit))' : 'hsl(var(--loss))' }}>
            {c.change >= 0 ? '+' : ''}{c.change.toFixed(1)}%
          </span>
        </div>
      ))}
      {b.coins.length > list.length && <div style={{ opacity: 0.7, marginTop: 2 }}>+{b.coins.length - list.length} more</div>}
    </div>
  );
}

interface ReturnBucketsChartProps {
  coins: AggregatedCoin[];
  period: ChartPeriod;
  klineChanges?: Record<string, number>;
}

export function ReturnBucketsChart({ coins, period, klineChanges }: ReturnBucketsChartProps) {
  const buckets = useMemo(() => buildBuckets(coins, period, klineChanges), [coins, period, klineChanges]);

  const empty = buckets.every((b) => b.count === 0);
  if (empty) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-xs text-muted-foreground text-center">
          {period === '1d' ? '데이터 없음' : '기간 변화율 데이터를 불러오는 중입니다.'}
        </p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={buckets}>
        <XAxis dataKey="rangeLabel" tick={{ fontSize: 8 }} stroke="var(--muted-foreground)" angle={-45} textAnchor="end" height={50} />
        <YAxis tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" />
        <Tooltip content={<BucketTooltip />} />
        <Bar dataKey="count" radius={[2, 2, 0, 0]}>
          {buckets.map((b, i) => (
            <Cell key={i} fill={b.rangeMin >= 0 ? 'hsl(var(--profit))' : 'hsl(var(--loss))'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
