'use client';

import { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ReferenceLine } from 'recharts';
import type { AggregatedCoin, CoinSector, SectorPerformanceData } from '@bitscope/shared';
import { SECTOR_LABELS } from '@bitscope/shared';

const SECTORS: CoinSector[] = ['DeFi', 'L1', 'L2', 'Metaverse', 'Meme', 'Dino', 'AI'];

function calcSectorPerformance(coins: AggregatedCoin[]): SectorPerformanceData[] {
  return SECTORS.map((sector) => {
    const sectorCoins = coins.filter((c) => c.sectors.includes(sector));
    const avgReturn = sectorCoins.length > 0
      ? sectorCoins.reduce((s, c) => s + c.change24h, 0) / sectorCoins.length
      : 0;
    return {
      sector,
      label: SECTOR_LABELS[sector],
      avgReturn,
      coinCount: sectorCoins.length,
    };
  }).sort((a, b) => b.avgReturn - a.avgReturn);
}

export function SectorPerformanceChart({ coins }: { coins: AggregatedCoin[] }) {
  const data = useMemo(() => calcSectorPerformance(coins), [coins]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <XAxis dataKey="label" tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" />
        <YAxis tickFormatter={(v) => `${Number(v).toFixed(1)}%`} tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" />
        <Tooltip
          contentStyle={{ fontSize: 11, background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)' }}
          formatter={(v) => [`${Number(v).toFixed(2)}%`, 'Avg Return']}
        />
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
