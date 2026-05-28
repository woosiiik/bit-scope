'use client';

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';

interface BasisEntry {
  timestamp: number;
  basisPercent: number;
  futuresPrice: number;
  spotPrice: number;
  daysToExpiry: number;
}

interface Basis3mChartProps {
  coin: string;
  serverData?: { data: BasisEntry[] } | null;
}

export function Basis3mChart({ coin, serverData }: Basis3mChartProps) {
  const supportedCoins = ['BTC', 'ETH'];

  if (!supportedCoins.includes(coin)) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-xs text-muted-foreground text-center">
          이 코인은 3M Basis를 지원하지 않습니다
        </p>
      </div>
    );
  }

  const chartData = serverData?.data;

  if (!chartData || chartData.length === 0) {
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
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={(t) => new Date(t).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
          tick={{ fontSize: 9 }}
          stroke="var(--muted-foreground)"
        />
        <YAxis
          tickFormatter={(v) => `${Number(v).toFixed(1)}%`}
          tick={{ fontSize: 9 }}
          stroke="var(--muted-foreground)"
        />
        <Tooltip
          contentStyle={{ fontSize: 11, background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)' }}
          labelFormatter={(t) => new Date(t as number).toLocaleString()}
          formatter={(v, _name, props) => {
            const entry = props.payload as BasisEntry;
            return [
              `${Number(v).toFixed(2)}% (${entry.daysToExpiry}d to expiry)`,
              '3M Basis',
            ];
          }}
        />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
        <Line
          type="monotone"
          dataKey="basisPercent"
          name="3M Basis"
          stroke="#F0B90B"
          dot={false}
          strokeWidth={2}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
