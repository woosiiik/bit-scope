'use client';

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import type { ExchangeTotal } from '@bitscope/shared';
import { EXCHANGE_CONFIGS } from '@bitscope/shared';
import type { ExchangeType } from '@bitscope/shared';

function formatVol(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${(v / 1e3).toFixed(0)}K`;
}

export function MarketVolumeChart({ data }: { data: ExchangeTotal[] }) {
  const chartData = data
    .filter((d) => d.totalVolume > 0)
    .map((d) => ({
      name: EXCHANGE_CONFIGS[d.exchange as ExchangeType]?.nameEn ?? d.exchange,
      value: d.totalVolume,
      color: d.color,
    }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData}>
        <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" />
        <YAxis tickFormatter={formatVol} tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" />
        <Tooltip
          contentStyle={{ fontSize: 11, background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)' }}
          formatter={(v) => [formatVol(Number(v)), '24h Volume']}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
