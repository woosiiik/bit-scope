'use client';

import { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import type { ExchangeTimeSeriesPoint } from '@bitscope/shared';
import { EXCHANGE_COLORS, EXCHANGE_CONFIGS, INDICATOR_EXCHANGE_SUPPORT } from '@bitscope/shared';
import type { ExchangeType } from '@bitscope/shared';

function formatAxis(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
}

export function VolumeHistoryChart({ data }: { data: unknown }) {
  const points = data as ExchangeTimeSeriesPoint[];

  // 데이터 포인트가 많으면 다운샘플링 (최대 50개)
  const sampled = useMemo(() => {
    if (!Array.isArray(points) || points.length === 0) return [];
    if (points.length <= 50) return points;

    const step = Math.ceil(points.length / 50);
    return points.filter((_, i) => i % step === 0);
  }, [points]);

  if (sampled.length === 0) return null;

  const exchanges = INDICATOR_EXCHANGE_SUPPORT.volumeHistory;

  // X축 포맷: 데이터 범위에 따라 자동 조정
  const timeRange = sampled.length > 1
    ? sampled[sampled.length - 1]!.timestamp - sampled[0]!.timestamp
    : 0;
  const isShortRange = timeRange < 48 * 3600 * 1000; // 2일 미만

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={sampled}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={(t) => {
            const d = new Date(t);
            if (isShortRange) {
              return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
            }
            return `${d.getMonth() + 1}/${d.getDate()}`;
          }}
          tick={{ fontSize: 9 }}
          stroke="var(--muted-foreground)"
          interval={Math.max(0, Math.floor(sampled.length / 8))}
        />
        <YAxis
          tickFormatter={formatAxis}
          tick={{ fontSize: 9 }}
          stroke="var(--muted-foreground)"
        />
        <Tooltip
          contentStyle={{ fontSize: 11, background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)' }}
          labelFormatter={(t) => new Date(t as number).toLocaleString()}
        />
        {exchanges.map((ex) => (
          <Bar
            key={ex}
            dataKey={`values.${ex}`}
            name={EXCHANGE_CONFIGS[ex as ExchangeType]?.nameEn ?? ex}
            fill={EXCHANGE_COLORS[ex]}
            stackId="volume"
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
