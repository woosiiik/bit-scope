'use client';

import { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ReferenceLine } from 'recharts';
import type { AggregatedCoin, CoinSector, ChartPeriod } from '@bitscope/shared';
import { SECTOR_LABELS } from '@bitscope/shared';

const SECTORS: CoinSector[] = ['DeFi', 'L1', 'L2', 'Metaverse', 'Meme', 'Dino', 'AI'];

interface SectorRow {
  sector: CoinSector;
  label: string;
  avgReturn: number;
  coinCount: number;
  coins: Array<{ symbol: string; change: number }>;
}

/** 선택 기간에 해당하는 코인 수익률 (1d=ticker change24h, 그 외=kline 변화율) */
function coinReturn(coin: AggregatedCoin, period: ChartPeriod, kline?: Record<string, number>): number | null {
  if (period === '1d') return coin.change24h;
  const v = kline?.[coin.symbol];
  return typeof v === 'number' ? v : null;
}

function calcSectorPerformance(
  coins: AggregatedCoin[],
  period: ChartPeriod,
  kline?: Record<string, number>,
): SectorRow[] {
  return SECTORS.map((sector) => {
    const members = coins
      .filter((c) => c.sectors.includes(sector))
      .map((c) => ({ symbol: c.symbol, change: coinReturn(c, period, kline) }))
      .filter((c): c is { symbol: string; change: number } => c.change !== null);
    const avgReturn = members.length > 0
      ? members.reduce((s, c) => s + c.change, 0) / members.length
      : 0;
    return {
      sector,
      label: SECTOR_LABELS[sector],
      avgReturn,
      coinCount: members.length,
      coins: members,
    };
  }).sort((a, b) => b.avgReturn - a.avgReturn);
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: SectorRow }>;
}

function SectorTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const s = payload[0]!.payload;
  const list = [...s.coins].sort((x, y) => y.change - x.change).slice(0, 12);
  return (
    <div style={{ fontSize: 11, background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', maxWidth: 220 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        {s.label} · {s.coinCount} coins · 평균 {s.avgReturn >= 0 ? '+' : ''}{s.avgReturn.toFixed(2)}%
      </div>
      {list.map((c) => (
        <div key={c.symbol} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{c.symbol}</span>
          <span style={{ color: c.change >= 0 ? 'hsl(var(--profit))' : 'hsl(var(--loss))' }}>
            {c.change >= 0 ? '+' : ''}{c.change.toFixed(1)}%
          </span>
        </div>
      ))}
      {s.coins.length > list.length && <div style={{ opacity: 0.7, marginTop: 2 }}>+{s.coins.length - list.length} more</div>}
    </div>
  );
}

interface SectorPerformanceChartProps {
  coins: AggregatedCoin[];
  period: ChartPeriod;
  klineChanges?: Record<string, number>;
}

export function SectorPerformanceChart({ coins, period, klineChanges }: SectorPerformanceChartProps) {
  const data = useMemo(() => calcSectorPerformance(coins, period, klineChanges), [coins, period, klineChanges]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <XAxis dataKey="label" tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" />
        <YAxis tickFormatter={(v) => `${Number(v).toFixed(1)}%`} tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" />
        <Tooltip content={<SectorTooltip />} />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
        <Bar dataKey="avgReturn" radius={[4, 4, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.sector} fill={d.avgReturn >= 0 ? 'hsl(var(--profit))' : 'hsl(var(--loss))'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
