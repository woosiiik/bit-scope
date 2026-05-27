'use client';

import { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import type { AggregatedCoin, ReturnBucket } from '@bitscope/shared';

function buildBuckets(coins: AggregatedCoin[]): ReturnBucket[] {
  const ranges = [-30, -20, -10, -5, -2, 0, 2, 5, 10, 20, 30];
  const buckets: ReturnBucket[] = [];

  for (let i = 0; i < ranges.length - 1; i++) {
    const min = ranges[i]!;
    const max = ranges[i + 1]!;
    buckets.push({
      rangeLabel: `${min}% ~ ${max}%`,
      rangeMin: min,
      rangeMax: max,
      count: 0,
      coins: [],
    });
  }
  // < -30% 과 > 30% 구간 (Infinity로 극단값 포함)
  buckets.unshift({ rangeLabel: '< -30%', rangeMin: -Infinity, rangeMax: -30, count: 0, coins: [] });
  buckets.push({ rangeLabel: '> 30%', rangeMin: 30, rangeMax: Infinity, count: 0, coins: [] });

  for (const coin of coins) {
    const bucket = buckets.find((b) => coin.change24h >= b.rangeMin && coin.change24h < b.rangeMax);
    if (bucket) {
      bucket.count++;
      bucket.coins.push({ symbol: coin.symbol, change: coin.change24h });
    }
  }

  return buckets;
}

export function ReturnBucketsChart({ coins }: { coins: AggregatedCoin[] }) {
  const buckets = useMemo(() => buildBuckets(coins), [coins]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={buckets}>
        <XAxis dataKey="rangeLabel" tick={{ fontSize: 8 }} stroke="var(--muted-foreground)" angle={-45} textAnchor="end" height={50} />
        <YAxis tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" />
        <Tooltip
          contentStyle={{ fontSize: 11, background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)' }}
          formatter={(v) => [v, 'Coins']}
          labelFormatter={(label) => String(label)}
        />
        <Bar dataKey="count" radius={[2, 2, 0, 0]}>
          {buckets.map((b, i) => (
            <Cell key={i} fill={b.rangeMin >= 0 ? 'hsl(var(--profit))' : 'hsl(var(--loss))'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
