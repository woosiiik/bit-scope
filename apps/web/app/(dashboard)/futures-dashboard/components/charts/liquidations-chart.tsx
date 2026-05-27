'use client';

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';

export function LiquidationsChart({ data }: { data: unknown }) {
  // Liquidations 데이터는 복잡한 형태이므로 간단한 placeholder
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-xs text-muted-foreground">Liquidations data loading...</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data as Array<{ timestamp: number; longUsd: number; shortUsd: number }>}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={(t) => new Date(t).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
          tick={{ fontSize: 9 }}
          stroke="var(--muted-foreground)"
        />
        <YAxis tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" />
        <Tooltip
          contentStyle={{ fontSize: 11, background: 'var(--popover)', border: '1px solid var(--border)' }}
          labelFormatter={(t) => new Date(t as number).toLocaleString()}
        />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" />
        <Bar dataKey="longUsd" name="Long Liquidations" fill="hsl(var(--loss))" />
        <Bar dataKey="shortUsd" name="Short Liquidations" fill="hsl(var(--profit))" />
      </BarChart>
    </ResponsiveContainer>
  );
}
