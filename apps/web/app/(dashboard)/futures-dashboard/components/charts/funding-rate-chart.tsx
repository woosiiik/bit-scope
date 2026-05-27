'use client';

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ReferenceLine } from 'recharts';
import type { FundingRateSnapshot } from '@bitscope/shared';
import { EXCHANGE_CONFIGS } from '@bitscope/shared';
import type { ExchangeType } from '@bitscope/shared';

interface FundingRateChartProps {
  data: unknown;
  mode: 'annual' | '8hrs';
}

export function FundingRateChart({ data, mode }: FundingRateChartProps) {
  const snapshots = data as FundingRateSnapshot[];
  if (!Array.isArray(snapshots) || snapshots.length === 0) return null;

  const chartData = snapshots.map((s) => ({
    name: EXCHANGE_CONFIGS[s.exchange as ExchangeType]?.nameEn ?? s.exchange,
    value: mode === 'annual' ? s.rateAnnual : s.rate8h * 100,
    exchange: s.exchange,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData}>
        <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" />
        <YAxis
          tickFormatter={(v) => `${v.toFixed(mode === 'annual' ? 1 : 4)}%`}
          tick={{ fontSize: 9 }}
          stroke="var(--muted-foreground)"
        />
        <Tooltip
          contentStyle={{ fontSize: 11, background: 'var(--popover)', border: '1px solid var(--border)' }}
          formatter={(v: number) => [`${v.toFixed(mode === 'annual' ? 2 : 4)}%`, mode === 'annual' ? 'Annual' : '8h Rate']}
        />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {chartData.map((entry) => (
            <Cell
              key={entry.exchange}
              fill={entry.value >= 0 ? 'hsl(var(--profit))' : 'hsl(var(--loss))'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
