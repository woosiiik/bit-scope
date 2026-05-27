'use client';

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import type { SessionReturnPoint } from '@bitscope/shared';

const SESSION_COLORS = {
  apac: '#2354E6',
  eu: '#00C9A7',
  us: '#F0B90B',
};

export function CumReturnSessionChart({ data }: { data: unknown }) {
  const points = data as SessionReturnPoint[];
  if (!Array.isArray(points) || points.length === 0) return null;

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
