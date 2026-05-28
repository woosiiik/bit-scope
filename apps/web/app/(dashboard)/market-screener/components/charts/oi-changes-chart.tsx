'use client';

import { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ReferenceLine } from 'recharts';
import type { AggregatedCoin } from '@bitscope/shared';

interface OIChangeEntry {
  symbol: string;
  changePercent: number;
  currentOI: number;
  baselineOI: number;
}

interface OIChangesChartProps {
  /** Phase 2 서버 집계 데이터 (있으면 우선 사용) */
  serverData?: { data: OIChangeEntry[] } | null;
  /** 폴백: 기존 tickers 코인 데이터 */
  coins: AggregatedCoin[];
}

export function OIChangesChart({ serverData, coins }: OIChangesChartProps) {
  const data = useMemo(() => {
    // Phase 2 서버 데이터가 있으면 변화율 차트
    if (serverData?.data && serverData.data.length > 0) {
      return serverData.data.slice(0, 20).map((d) => ({
        symbol: d.symbol,
        value: d.changePercent,
        isPercent: true,
      }));
    }

    // 폴백: 기존 OI 절대값 순위
    return coins
      .filter((c) => c.openInterest > 0)
      .slice(0, 15)
      .map((c) => ({
        symbol: c.symbol,
        value: c.openInterest,
        isPercent: false,
      }));
  }, [serverData, coins]);

  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-xs text-muted-foreground">OI 데이터 없음</p>
      </div>
    );
  }

  const isPercent = data[0]?.isPercent ?? false;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 5 }}>
        <XAxis
          type="number"
          tickFormatter={(v) => {
            if (isPercent) return `${Number(v).toFixed(1)}%`;
            const abs = Math.abs(v);
            if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
            if (abs >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
            return `${(v / 1e3).toFixed(0)}K`;
          }}
          tick={{ fontSize: 9 }}
          stroke="var(--muted-foreground)"
        />
        <YAxis type="category" dataKey="symbol" tick={{ fontSize: 8 }} stroke="var(--muted-foreground)" width={45} />
        <Tooltip
          contentStyle={{ fontSize: 11, background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)' }}
          formatter={(v) => {
            const val = Number(v);
            if (isPercent) return [`${val.toFixed(2)}%`, 'OI Change'];
            if (Math.abs(val) >= 1e9) return [`$${(val / 1e9).toFixed(2)}B`, 'OI'];
            if (Math.abs(val) >= 1e6) return [`$${(val / 1e6).toFixed(1)}M`, 'OI'];
            return [`$${(val / 1e3).toFixed(0)}K`, 'OI'];
          }}
        />
        {isPercent && <ReferenceLine x={0} stroke="var(--muted-foreground)" strokeDasharray="3 3" />}
        <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.symbol} fill={isPercent ? (d.value >= 0 ? 'hsl(var(--profit))' : 'hsl(var(--loss))') : '#6366f1'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
