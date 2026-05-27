'use client';

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import type { ExchangeDataPoint } from '@bitscope/shared';
import { EXCHANGE_COLORS, EXCHANGE_CONFIGS } from '@bitscope/shared';
import type { ExchangeType } from '@bitscope/shared';

function formatVolume(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toFixed(0);
}

export function Volume24hChart({ data }: { data: unknown }) {
  const points = data as ExchangeDataPoint[];
  if (!Array.isArray(points) || points.length === 0) return null;

  const chartData = points
    .filter((p) => p.value > 0)
    .map((p) => ({
      name: EXCHANGE_CONFIGS[p.exchange as ExchangeType]?.nameEn ?? p.exchange,
      value: p.value,
      exchange: p.exchange,
    }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData}>
        <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" />
        <YAxis tickFormatter={formatVolume} tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" />
        <Tooltip
          contentStyle={{ fontSize: 11, background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)' }}
          formatter={(v) => [`$${formatVolume(Number(v))}`, '24h Volume']}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {chartData.map((entry) => (
            <Cell key={entry.exchange} fill={EXCHANGE_COLORS[entry.exchange as keyof typeof EXCHANGE_COLORS]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
