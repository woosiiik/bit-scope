'use client';

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend } from 'recharts';

interface LiquidationBucket {
  timestamp: number;
  exchange: string;
  longUsd: number;
  shortUsd: number;
}

interface ChartRow {
  timestamp: number;
  longUsd: number;
  shortUsd: number;
}

export function LiquidationsChart({ data }: { data: unknown }) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-xs text-muted-foreground text-center">
          청산 데이터 수집 중... 데이터가 축적되면 표시됩니다.
        </p>
      </div>
    );
  }

  // 시간 버킷별로 집계 (거래소 합산)
  const buckets = data as LiquidationBucket[];
  const timeMap = new Map<number, ChartRow>();

  for (const b of buckets) {
    const existing = timeMap.get(b.timestamp) ?? { timestamp: b.timestamp, longUsd: 0, shortUsd: 0 };
    existing.longUsd += b.longUsd;
    existing.shortUsd -= Math.abs(b.shortUsd); // 음수 방향
    timeMap.set(b.timestamp, existing);
  }

  const chartData = Array.from(timeMap.values()).sort((a, b) => a.timestamp - b.timestamp);

  if (chartData.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-xs text-muted-foreground">청산 데이터 없음</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={(t) => new Date(t).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
          tick={{ fontSize: 9 }}
          stroke="var(--muted-foreground)"
        />
        <YAxis
          tickFormatter={(v) => {
            const abs = Math.abs(v);
            if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
            if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
            return String(v);
          }}
          tick={{ fontSize: 9 }}
          stroke="var(--muted-foreground)"
        />
        <Tooltip
          contentStyle={{ fontSize: 11, background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)' }}
          labelFormatter={(t) => new Date(t as number).toLocaleString()}
          formatter={(v) => [`$${Math.abs(Number(v)).toLocaleString()}`, '']}
        />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" />
        <Bar dataKey="longUsd" name="Long Liquidations" fill="hsl(var(--loss))" isAnimationActive={false} />
        <Bar dataKey="shortUsd" name="Short Liquidations" fill="hsl(var(--profit))" isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
