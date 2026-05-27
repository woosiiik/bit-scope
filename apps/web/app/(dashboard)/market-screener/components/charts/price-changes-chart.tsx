'use client';

import { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ReferenceLine } from 'recharts';
import type { AggregatedCoin } from '@bitscope/shared';

interface PriceChangesChartProps {
  coins: AggregatedCoin[];
  klineChanges?: Record<string, number>;
  period: string;
}

export function PriceChangesChart({ coins, klineChanges, period }: PriceChangesChartProps) {
  const data = useMemo(() => {
    const source = period === '1d'
      ? coins.slice(0, 20).map((c) => ({ symbol: c.symbol, change: c.change24h }))
      : coins.slice(0, 20).map((c) => ({
          symbol: c.symbol,
          change: klineChanges?.[c.symbol] ?? c.change24h,
        }));

    return source.sort((a, b) => b.change - a.change);
  }, [coins, klineChanges, period]);

  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 5 }}>
        <XAxis type="number" tickFormatter={(v) => `${Number(v).toFixed(1)}%`} tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" />
        <YAxis type="category" dataKey="symbol" tick={{ fontSize: 8 }} stroke="var(--muted-foreground)" width={45} />
        <Tooltip
          contentStyle={{ fontSize: 11, background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)' }}
          formatter={(v) => [`${Number(v).toFixed(2)}%`, 'Change']}
        />
        <ReferenceLine x={0} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
        <Bar dataKey="change" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.symbol} fill={d.change >= 0 ? 'hsl(var(--profit))' : 'hsl(var(--loss))'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
