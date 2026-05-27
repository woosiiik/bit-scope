'use client';

import { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ReferenceLine } from 'recharts';
import type { AggregatedCoin } from '@bitscope/shared';

interface FundingRateChartProps {
  coins: AggregatedCoin[];
  mode: '8hrs' | 'annual';
}

export function FundingRateScreenerChart({ coins, mode }: FundingRateChartProps) {
  const data = useMemo(() => {
    return coins
      .filter((c) => c.fundingRate !== 0)
      .slice(0, 20)
      .map((c) => ({
        symbol: c.symbol,
        rate: mode === 'annual' ? c.fundingRate * 3 * 365 * 100 : c.fundingRate * 100,
      }))
      .sort((a, b) => b.rate - a.rate);
  }, [coins, mode]);

  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 5 }}>
        <XAxis
          type="number"
          tickFormatter={(v) => `${Number(v).toFixed(mode === 'annual' ? 0 : 3)}%`}
          tick={{ fontSize: 9 }}
          stroke="var(--muted-foreground)"
        />
        <YAxis type="category" dataKey="symbol" tick={{ fontSize: 8 }} stroke="var(--muted-foreground)" width={45} />
        <Tooltip
          contentStyle={{ fontSize: 11, background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)' }}
          formatter={(v) => [`${Number(v).toFixed(mode === 'annual' ? 2 : 4)}%`, mode === 'annual' ? 'Annual' : '8h Rate']}
        />
        <ReferenceLine x={0} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
        <Bar dataKey="rate" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.symbol} fill={d.rate >= 0 ? 'hsl(var(--profit))' : 'hsl(var(--loss))'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
