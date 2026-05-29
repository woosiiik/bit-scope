'use client';

import { useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import type { CVDPoint } from '@bitscope/shared';
import { EXCHANGE_COLORS } from '@bitscope/shared';

export function CVDChart({ data }: { data: unknown }) {
  const points = data as CVDPoint[];

  const sampled = useMemo(() => {
    if (!Array.isArray(points) || points.length === 0) return [];
    if (points.length <= 100) return points;
    const step = Math.ceil(points.length / 100);
    return points.filter((_, i) => i % step === 0);
  }, [points]);

  if (sampled.length === 0) return null;

  const timeRange = sampled.length > 1
    ? sampled[sampled.length - 1]!.timestamp - sampled[0]!.timestamp
    : 0;
  const isShortRange = timeRange < 48 * 3600 * 1000;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={sampled}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={(t) => {
            const d = new Date(t);
            if (isShortRange) return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
            // 중간 범위(2일~14일): 날짜 + 시간
            if (timeRange < 14 * 24 * 3600 * 1000) return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}h`;
            return `${d.getMonth() + 1}/${d.getDate()}`;
          }}
          tick={{ fontSize: 9 }}
          stroke="var(--muted-foreground)"
          interval={Math.max(0, Math.floor(sampled.length / 8))}
        />
        <YAxis
          tickFormatter={(v) => {
            const abs = Math.abs(v);
            if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
            if (abs >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
            return `${(v / 1e3).toFixed(0)}K`;
          }}
          tick={{ fontSize: 9 }}
          stroke="var(--muted-foreground)"
        />
        <Tooltip
          contentStyle={{ fontSize: 11, background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)' }}
          labelFormatter={(t) => new Date(t as number).toLocaleString()}
        />
        <Line
          type="monotone"
          dataKey="values.binance"
          name="Binance CVD"
          stroke={EXCHANGE_COLORS.binance}
          dot={false}
          isAnimationActive={false}
          strokeWidth={1.5}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
