'use client';

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import type { ExchangeTimeSeriesPoint } from '@bitscope/shared';
import { EXCHANGE_COLORS, EXCHANGE_CONFIGS, INDICATOR_EXCHANGE_SUPPORT } from '@bitscope/shared';
import type { ExchangeType } from '@bitscope/shared';

export function PriceChart({ data }: { data: unknown }) {
  const points = data as ExchangeTimeSeriesPoint[];
  if (!Array.isArray(points) || points.length === 0) return null;

  const exchanges = INDICATOR_EXCHANGE_SUPPORT.price;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={(t) => new Date(t).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
          tick={{ fontSize: 9 }}
          stroke="var(--muted-foreground)"
        />
        <YAxis tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" domain={['auto', 'auto']} />
        <Tooltip
          contentStyle={{ fontSize: 11, background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)' }}
          labelFormatter={(t) => new Date(t as number).toLocaleString()}
          formatter={(v, name) => [Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }), String(name)]}
        />
        {exchanges.map((ex) => (
          <Line
            key={ex}
            type="monotone"
            dataKey={`values.${ex}`}
            name={EXCHANGE_CONFIGS[ex as ExchangeType]?.nameEn ?? ex}
            stroke={EXCHANGE_COLORS[ex]}
            dot={false}
            strokeWidth={1.5}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
