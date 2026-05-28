'use client';

import { useMemo } from 'react';

interface HeatmapCell {
  symbol: string;
  timestamp: number;
  weightedFunding: number;
}

interface FundingHeatmapChartProps {
  data: { cells: HeatmapCell[]; symbols: string[] } | null | undefined;
}

/** diverging color: 빨강(양) ↔ 파랑(음) */
function getColor(value: number): string {
  const abs = Math.abs(value);
  const intensity = Math.min(abs / 0.001, 1); // 0.1% = max intensity
  if (value >= 0) {
    // 빨강 (과열)
    const r = Math.round(220 + 35 * intensity);
    const g = Math.round(220 - 180 * intensity);
    const b = Math.round(220 - 180 * intensity);
    return `rgb(${r},${g},${b})`;
  }
  // 파랑 (공포)
  const r = Math.round(220 - 180 * intensity);
  const g = Math.round(220 - 100 * intensity);
  const b = Math.round(220 + 35 * intensity);
  return `rgb(${r},${g},${b})`;
}

export function FundingHeatmapChart({ data }: FundingHeatmapChartProps) {
  const { grid, timeLabels, symbols } = useMemo(() => {
    if (!data?.cells || !data.symbols || data.cells.length === 0) {
      return { grid: [], timeLabels: [], symbols: [] };
    }

    const syms = data.symbols;
    const times = [...new Set(data.cells.map((c) => c.timestamp))].sort((a, b) => a - b);
    const cellMap = new Map(data.cells.map((c) => [`${c.symbol}:${c.timestamp}`, c.weightedFunding]));

    const tLabels = times.map((t) => {
      const d = new Date(t);
      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}h`;
    });

    return { grid: { syms, times, cellMap }, timeLabels: tLabels, symbols: syms };
  }, [data]);

  if (symbols.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-xs text-muted-foreground text-center">
          데이터 수집 중입니다. 서버 시작 후 1시간 뒤부터 표시됩니다.
        </p>
      </div>
    );
  }

  const cellW = Math.max(16, Math.floor(600 / (grid as { times: number[] }).times.length));
  const cellH = 16;
  const labelW = 50;

  return (
    <div className="overflow-auto h-full">
      <svg
        width={labelW + (grid as { times: number[] }).times.length * cellW}
        height={symbols.length * cellH + 20}
        className="text-[8px]"
      >
        {/* 시간 라벨 */}
        {timeLabels.map((label, i) => (
          <text key={i} x={labelW + i * cellW + cellW / 2} y={10} textAnchor="middle" fill="var(--muted-foreground)" fontSize={7}>
            {i % Math.max(1, Math.floor(timeLabels.length / 8)) === 0 ? label : ''}
          </text>
        ))}
        {/* 코인 행 */}
        {symbols.map((sym, row) => (
          <g key={sym}>
            <text x={2} y={20 + row * cellH + cellH / 2 + 3} fill="var(--foreground)" fontSize={8}>{sym}</text>
            {(grid as { times: number[]; cellMap: Map<string, number> }).times.map((t, col) => {
              const val = (grid as { cellMap: Map<string, number> }).cellMap.get(`${sym}:${t}`) ?? 0;
              return (
                <rect
                  key={`${sym}-${t}`}
                  x={labelW + col * cellW}
                  y={20 + row * cellH}
                  width={cellW - 1}
                  height={cellH - 1}
                  fill={getColor(val)}
                  rx={1}
                >
                  <title>{`${sym} ${new Date(t).toLocaleString()}\nFunding: ${(val * 100).toFixed(4)}%`}</title>
                </rect>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}
