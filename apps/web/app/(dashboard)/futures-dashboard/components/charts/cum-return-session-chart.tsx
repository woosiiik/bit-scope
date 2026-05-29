'use client';

import { useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import type { SessionReturnPoint } from '@bitscope/shared';

const SESSION_COLORS = {
  apac: '#2354E6',
  eu: '#00C9A7',
  us: '#F0B90B',
};

export function CumReturnSessionChart({ data }: { data: unknown }) {
  const points = data as SessionReturnPoint[];

  // 최대 ~120 포인트로 다운샘플링 (1500개 원본도 부드럽게 표시)
  const sampled = useMemo(() => {
    if (!Array.isArray(points) || points.length === 0) return [];
    if (points.length <= 120) return points;
    const step = Math.ceil(points.length / 120);
    return points.filter((_, i) => i % step === 0);
  }, [points]);

  if (sampled.length === 0) return null;

  const timeRange = sampled.length > 1
    ? (sampled[sampled.length - 1]!.timestamp - sampled[0]!.timestamp)
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
            return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
          }}
          tick={{ fontSize: 9 }}
          stroke="var(--muted-foreground)"
        />
        <YAxis
          tickFormatter={(v) => `${v.toFixed(2)}%`}
          tick={{ fontSize: 9 }}
          stroke="var(--muted-foreground)"
        />
        <Tooltip
          contentStyle={{ fontSize: 11, background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)' }}
          labelFormatter={(t) => new Date(t as number).toLocaleString()}
          formatter={(v, name) => [`${Number(v).toFixed(3)}%`, String(name)]}
        />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <Line type="monotone" dataKey="apac" name="APAC" stroke={SESSION_COLORS.apac} dot={false} isAnimationActive={false} strokeWidth={1.5} />
        <Line type="monotone" dataKey="eu" name="EU" stroke={SESSION_COLORS.eu} dot={false} isAnimationActive={false} strokeWidth={1.5} />
        <Line type="monotone" dataKey="us" name="US" stroke={SESSION_COLORS.us} dot={false} isAnimationActive={false} strokeWidth={1.5} />
      </LineChart>
    </ResponsiveContainer>
  );
}
