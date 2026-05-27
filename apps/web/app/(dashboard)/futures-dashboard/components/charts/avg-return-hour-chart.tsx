'use client';

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ReferenceLine } from 'recharts';
import type { HourlyReturnPoint } from '@bitscope/shared';

export function AvgReturnHourChart({ data }: { data: unknown }) {
  const points = data as HourlyReturnPoint[];
  if (!Array.isArray(points) || points.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={points}>
        <XAxis dataKey="hour" tick={{ fontSize: 8 }} stroke="var(--muted-foreground)" />
        <YAxis
          tickFormatter={(v) => `${v.toFixed(3)}%`}
          tick={{ fontSize: 8 }}
          stroke="var(--muted-foreground)"
        />
        <Tooltip
          contentStyle={{ fontSize: 11, background: 'var(--popover)', border: '1px solid var(--border)' }}
          formatter={(v: number) => [`${v.toFixed(4)}%`, 'Avg Return']}
          labelFormatter={(h) => `UTC ${h}:00`}
        />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
        <Bar dataKey="avgReturn" radius={[2, 2, 0, 0]}>
          {points.map((p) => (
            <Cell
              key={p.hour}
              fill={p.avgReturn >= 0 ? 'hsl(var(--profit))' : 'hsl(var(--loss))'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
