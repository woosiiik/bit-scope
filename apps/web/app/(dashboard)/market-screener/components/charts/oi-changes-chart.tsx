'use client';

import { useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, Legend } from 'recharts';

const LINE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899', '#84cc16'];

type SeriesPoint = Record<string, number>;

interface OIChangesResult {
  coins?: string[];
  series?: SeriesPoint[];
}

interface OIChangesChartProps {
  /** Phase 2 서버 집계 시계열 데이터 */
  serverData?: OIChangesResult | null;
  /** 기간 (X축 포맷용) */
  period: string;
}

function fmtTime(ts: number, period: string): string {
  const d = new Date(ts);
  if (period === '1d') {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function OIChangesChart({ serverData, period }: OIChangesChartProps) {
  const { coins, series } = useMemo(() => {
    const c = Array.isArray(serverData?.coins) ? serverData!.coins! : [];
    const s = Array.isArray(serverData?.series) ? serverData!.series! : [];
    return { coins: c, series: s };
  }, [serverData]);

  if (series.length === 0 || coins.length === 0) {
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
      <LineChart data={series} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="timestamp"
          type="number"
          domain={['dataMin', 'dataMax']}
          scale="time"
          tickFormatter={(v) => fmtTime(Number(v), period)}
          tick={{ fontSize: 9 }}
          stroke="var(--muted-foreground)"
          minTickGap={24}
        />
        <YAxis
          tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
          tick={{ fontSize: 9 }}
          stroke="var(--muted-foreground)"
          width={36}
        />
        <Tooltip
          contentStyle={{ fontSize: 11, background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)' }}
          labelFormatter={(v) => fmtTime(Number(v), period)}
          formatter={(val, name) => [`${Number(val).toFixed(2)}%`, name as string]}
        />
        <Legend wrapperStyle={{ fontSize: 9 }} iconSize={8} />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
        {coins.map((sym, i) => (
          <Line
            key={sym}
            type="monotone"
            dataKey={sym}
            stroke={LINE_COLORS[i % LINE_COLORS.length]}
            dot={false}
            strokeWidth={1.5}
            isAnimationActive={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
