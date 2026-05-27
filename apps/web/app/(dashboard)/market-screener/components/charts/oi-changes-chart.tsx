'use client';

import { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ReferenceLine } from 'recharts';
import type { AggregatedCoin } from '@bitscope/shared';

/**
 * OI Changes — 현재는 스냅샷 기반 OI 크기 순위만 표시.
 * OI 변화율(%)을 보려면 서버에서 주기적 OI 스냅샷을 저장해야 함 (Phase 2).
 * 현재: OI 상위 20개 코인의 절대 OI 크기를 바 차트로 표시.
 */
export function OIChangesChart({ coins }: { coins: AggregatedCoin[] }) {
  const data = useMemo(() => {
    return coins
      .filter((c) => c.openInterest > 0)
      .slice(0, 15)
      .map((c) => ({
        symbol: c.symbol,
        oi: c.openInterest,
      }));
  }, [coins]);

  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-xs text-muted-foreground">OI 데이터 없음</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 5 }}>
        <XAxis
          type="number"
          tickFormatter={(v) => {
            if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
            if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
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
            if (val >= 1e9) return [`$${(val / 1e9).toFixed(2)}B`, 'OI'];
            if (val >= 1e6) return [`$${(val / 1e6).toFixed(1)}M`, 'OI'];
            return [`$${(val / 1e3).toFixed(0)}K`, 'OI'];
          }}
        />
        <ReferenceLine x={0} stroke="var(--muted-foreground)" />
        <Bar dataKey="oi" fill="#8884d8" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.symbol} fill="#6366f1" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
