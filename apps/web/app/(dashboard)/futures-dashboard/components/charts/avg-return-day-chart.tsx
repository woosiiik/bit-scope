'use client';

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ReferenceLine } from 'recharts';
import type { DailyReturnPoint } from '@bitscope/shared';

export function AvgReturnDayChart({ data }: { data: unknown }) {
  const points = data as DailyReturnPoint[];
  if (!Array.isArray(points) || points.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={points}>
        <XAxis dataKey="dayLabel" tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" />
        <YAxis
          tickFormatter={(v) => `${v.toFixed(3)}%`}
          tick={{ fontSize: 8 }}
          stroke="var(--muted-foreground)"
        />
        <Tooltip
          contentStyle={{ fontSize: 11, background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)' }}
          formatter={(v) => [`${Number(v).toFixed(4)}%`, 'Avg Return']}
        />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
        <Bar dataKey="avgReturn" radius={[4, 4, 0, 0]}>
          {points.map((p) => (
            <Cell
              key={p.dayLabel}
              fill={p.avgReturn >= 0 ? 'hsl(var(--profit))' : 'hsl(var(--loss))'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
