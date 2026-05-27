'use client';

import { useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import type { AggregatedCoin } from '@bitscope/shared';

const COLORS = ['#F7931A', '#627EEA', '#14F195', '#8B5CF6', '#6B7280'];

interface DominanceChartProps {
  coins: AggregatedCoin[];
  metric: 'volume' | 'oi';
}

export function DominanceChart({ coins, metric }: DominanceChartProps) {
  const data = useMemo(() => {
    const getValue = (c: AggregatedCoin) => metric === 'volume' ? c.volume24h : c.openInterest;
    const total = coins.reduce((s, c) => s + getValue(c), 0);
    if (total === 0) return [];

    const btc = coins.find((c) => c.symbol === 'BTC');
    const eth = coins.find((c) => c.symbol === 'ETH');
    const sol = coins.find((c) => c.symbol === 'SOL');

    const btcVal = btc ? getValue(btc) : 0;
    const ethVal = eth ? getValue(eth) : 0;
    const solVal = sol ? getValue(sol) : 0;
    const othersVal = total - btcVal - ethVal - solVal;

    return [
      { name: 'BTC', value: btcVal, pct: (btcVal / total) * 100 },
      { name: 'ETH', value: ethVal, pct: (ethVal / total) * 100 },
      { name: 'SOL', value: solVal, pct: (solVal / total) * 100 },
      { name: 'Others', value: othersVal, pct: (othersVal / total) * 100 },
    ].filter((d) => d.value > 0);
  }, [coins, metric]);

  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={45}
          outerRadius={75}
          dataKey="value"
          nameKey="name"
          isAnimationActive={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ fontSize: 11, background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)' }}
          formatter={(_, name, props) => {
            const entry = props.payload;
            return [`${entry.pct.toFixed(1)}%`, String(name)];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 10 }} formatter={(value, entry) => {
          const payload = entry?.payload as { pct?: number } | undefined;
          return `${value} ${payload?.pct?.toFixed(1) ?? 0}%`;
        }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
