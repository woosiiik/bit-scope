'use client';

import { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ReferenceLine } from 'recharts';

interface CVDEntry {
  symbol: string;
  normalizedCVD: number;
  rawCVD: number;
  totalOI: number;
}

export function NormalizedCVDChart({ data }: { data: { data: CVDEntry[] } | null | undefined }) {
  const chartData = useMemo(() => {
    if (!data?.data || data.data.length === 0) return [];
    return data.data.slice(0, 20);
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-xs text-muted-foreground text-center">
          데이터 수집 중입니다. 서버 시작 후 1시간 뒤부터 표시됩니다.
        </p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} layout="vertical" margin={{ left: 5 }}>
        <XAxis type="number" tickFormatter={(v) => Number(v).toFixed(3)} tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" />
        <YAxis type="category" dataKey="symbol" tick={{ fontSize: 8 }} stroke="var(--muted-foreground)" width={45} />
        <Tooltip
          contentStyle={{ fontSize: 11, background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)' }}
          formatter={(v) => [`${Number(v).toFixed(4)}`, 'Normalized CVD']}
        />
        <ReferenceLine x={0} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
        <Bar dataKey="normalizedCVD" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {chartData.map((d) => (
            <Cell key={d.symbol} fill={d.normalizedCVD >= 0 ? 'hsl(var(--profit))' : 'hsl(var(--loss))'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
