'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import type { AggregatedCoin } from '@bitscope/shared';

const COLORS = ['#F7931A', '#627EEA', '#14F195', '#E6194B', '#F58231', '#3CB44B', '#6B7280'];

export type DominanceMetric = 'marketCap' | 'volume' | 'oi';

interface DominanceChartProps {
  coins: AggregatedCoin[];
  metric: DominanceMetric;
}

interface DominanceEntry {
  symbol: string;
  percentage: number;
}

export function DominanceChart({ coins, metric }: DominanceChartProps) {
  // 시가총액 도미넌스는 CoinGecko API에서 가져옴
  const { data: cgData } = useQuery<{ success: boolean; data: { dominance: DominanceEntry[] } }>({
    queryKey: ['market-screener', 'dominance'],
    queryFn: async () => {
      const res = await fetch('/api/market-screener/dominance', { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      return res.json();
    },
    staleTime: 300_000,
    enabled: metric === 'marketCap',
  });

  const data = useMemo(() => {
    if (metric === 'marketCap') {
      return cgData?.data?.dominance ?? [];
    }

    // Futures Volume 또는 OI 기반 도미넌스
    const getValue = (c: AggregatedCoin) => metric === 'volume' ? c.volume24h : c.openInterest;
    const total = coins.reduce((s, c) => s + getValue(c), 0);
    if (total === 0) return [];

    const sorted = [...coins].sort((a, b) => getValue(b) - getValue(a));
    const top6 = sorted.slice(0, 6);
    const othersVal = sorted.slice(6).reduce((s, c) => s + getValue(c), 0);

    return [
      ...top6.map((c) => ({ symbol: c.symbol, percentage: (getValue(c) / total) * 100 })),
      { symbol: 'Others', percentage: (othersVal / total) * 100 },
    ].filter((d) => d.percentage > 0);
  }, [coins, metric, cgData]);

  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-xs text-muted-foreground">데이터 로딩 중...</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={40}
          outerRadius={70}
          dataKey="percentage"
          nameKey="symbol"
          isAnimationActive={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ fontSize: 11, background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)' }}
          formatter={(v) => [`${Number(v).toFixed(1)}%`, '']}
        />
        <Legend
          wrapperStyle={{ fontSize: 9 }}
          formatter={(value, entry) => {
            const payload = entry?.payload as { percentage?: number } | undefined;
            return `${value} ${payload?.percentage?.toFixed(1) ?? 0}%`;
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
