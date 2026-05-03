/**
 * 자산 분포 도넛 차트 컴포넌트
 *
 * Recharts 기반으로 코인별 비중 및 거래소별 비중을 도넛 차트로 시각화한다.
 * 반응형으로 모바일/데스크톱 모두에서 적절한 크기로 렌더링된다.
 *
 * @see 요구사항 2.7 (자산 분포를 도넛/파이 차트로 시각화)
 */

'use client';

import { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { ExchangeType, AssetDistribution } from '@bitscope/shared';
import { formatCompactKRW, formatPercent } from '@bitscope/shared';
import { cn, getExchangeName } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// ===== 색상 팔레트 =====

/**
 * 코인별 차트 색상 팔레트
 *
 * CSS 변수 chart-1~5를 기반으로 하되, HSL 값을 직접 사용하여
 * Recharts의 SVG 렌더링과 호환되도록 한다.
 */
const COIN_COLORS = [
  'hsl(217.2, 91.2%, 59.8%)',  // chart-1: 파란색 (Primary)
  'hsl(160, 60%, 45%)',         // chart-2: 초록색
  'hsl(30, 80%, 55%)',          // chart-3: 주황색
  'hsl(280, 65%, 60%)',         // chart-4: 보라색
  'hsl(340, 75%, 55%)',         // chart-5: 핑크색
  'hsl(190, 70%, 50%)',         // 추가 색상: 청록색
  'hsl(50, 80%, 50%)',          // 추가 색상: 노란색
  'hsl(0, 70%, 55%)',           // 추가 색상: 빨간색
  'hsl(130, 50%, 45%)',         // 추가 색상: 연두색
  'hsl(260, 50%, 55%)',         // 추가 색상: 남색
] as const;

/** 거래소별 차트 색상 (거래소 고유 색상) */
const EXCHANGE_COLORS: Record<ExchangeType, string> = {
  upbit: 'hsl(217.2, 91.2%, 59.8%)',   // 업비트: 파란색
  bithumb: 'hsl(30, 80%, 55%)',         // 빗썸: 주황색
  coinone: 'hsl(160, 60%, 45%)',        // 코인원: 초록색
  binance: 'hsl(50, 80%, 50%)',         // 바이낸스: 노란색
  bybit: 'hsl(15, 85%, 55%)',           // 바이빗: 주홍색
  okx: 'hsl(0, 0%, 20%)',              // OKX: 다크 그레이 (OKX 브랜드 색상)
  gate: 'hsl(210, 70%, 50%)',           // Gate.io: 블루 (Gate.io 브랜드 색상)
  bitget: 'hsl(170, 65%, 45%)',         // Bitget: 틸 (Bitget 브랜드 색상)
  hyperliquid: 'hsl(145, 70%, 50%)',    // 하이퍼리퀴드: 민트 (Hyperliquid 브랜드 색상)
};

// ===== 차트 데이터 타입 =====

/** 도넛 차트에 렌더링할 데이터 항목 */
interface ChartDataItem {
  /** 표시 이름 (코인 심볼 또는 거래소명) */
  name: string;
  /** 금액 (KRW) */
  value: number;
  /** 비율 (%) */
  ratio: number;
  /** 차트 색상 */
  color: string;
}

// ===== 커스텀 툴팁 =====

interface CustomTooltipProps {
  active?: boolean;
  payload?: {
    name: string;
    value: number;
    payload: ChartDataItem;
  }[];
}

/**
 * 도넛 차트 커스텀 툴팁
 *
 * 항목명, 금액(KRW), 비율(%)을 표시한다.
 */
function ChartTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0]!;
  const item = data.payload;

  return (
    <div
      className="rounded-lg border border-border bg-card px-3 py-2 shadow-md"
      role="tooltip"
    >
      <p className="text-sm font-medium text-foreground">{item.name}</p>
      <p className="text-sm text-muted-foreground">
        {formatCompactKRW(item.value)}
      </p>
      <p className="text-sm text-muted-foreground">
        {formatPercent(item.ratio, { showSign: false })}
      </p>
    </div>
  );
}

// ===== 커스텀 범례 =====

interface CustomLegendProps {
  data: ChartDataItem[];
  maxItems?: number;
}

/**
 * 도넛 차트 범례
 *
 * 각 항목의 색상, 이름, 비율을 표시한다.
 * 항목이 많으면 상위 항목만 표시하고 나머지를 "기타"로 합산한다.
 */
function ChartLegend({ data, maxItems = 5 }: CustomLegendProps) {
  const displayItems = data.length > maxItems
    ? data.slice(0, maxItems)
    : data;

  const hasOthers = data.length > maxItems;
  const othersRatio = hasOthers
    ? data.slice(maxItems).reduce((sum, item) => sum + item.ratio, 0)
    : 0;

  return (
    <ul className="flex flex-col gap-1.5" role="list" aria-label="차트 범례">
      {displayItems.map((item) => (
        <li key={item.name} className="flex items-center gap-2 text-xs">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: item.color }}
            aria-hidden="true"
          />
          <span className="truncate text-foreground">{item.name}</span>
          <span className="ml-auto shrink-0 text-muted-foreground">
            {formatPercent(item.ratio, { showSign: false })}
          </span>
        </li>
      ))}
      {hasOthers && (
        <li className="flex items-center gap-2 text-xs">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/30"
            aria-hidden="true"
          />
          <span className="truncate text-muted-foreground">기타</span>
          <span className="ml-auto shrink-0 text-muted-foreground">
            {formatPercent(othersRatio, { showSign: false })}
          </span>
        </li>
      )}
    </ul>
  );
}

// ===== 도넛 차트 컴포넌트 =====

interface DonutChartProps {
  /** 차트 제목 */
  title: string;
  /** 차트 데이터 */
  data: ChartDataItem[];
  /** 접근성 레이블 */
  ariaLabel: string;
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * 재사용 가능한 도넛 차트 컴포넌트
 *
 * Recharts의 PieChart를 사용하여 도넛(가운데 비어있는 파이) 차트를 렌더링한다.
 */
function DonutChart({ title, data, ariaLabel, className }: DonutChartProps) {
  // 데이터가 없을 때의 빈 상태
  if (data.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[200px] items-center justify-center">
            <p className="text-sm text-muted-foreground">
              데이터가 없습니다
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6"
          role="img"
          aria-label={ariaLabel}
        >
          {/* 도넛 차트 */}
          <div className="h-[180px] w-[180px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="55%"
                  outerRadius="85%"
                  paddingAngle={2}
                  stroke="none"
                >
                  {data.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={entry.color}
                    />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* 범례 */}
          <div className="min-w-0 flex-1">
            <ChartLegend data={data} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ===== 메인 컴포넌트: 자산 분포 차트 =====

interface AssetDistributionChartsProps {
  /** 자산 분포 데이터 (코인별, 거래소별) */
  distribution: AssetDistribution;
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * 자산 분포 차트 컴포넌트
 *
 * 코인별 비중과 거래소별 비중을 각각 도넛 차트로 시각화한다.
 * 2개의 도넛 차트가 나란히(데스크톱) 또는 세로로(모바일) 배치된다.
 *
 * @see 요구사항 2.7 (자산 분포를 도넛/파이 차트로 시각화 - 코인별 비중, 거래소별 비중)
 */
export function AssetDistributionCharts({
  distribution,
  className,
}: AssetDistributionChartsProps) {
  const { t, locale } = useTranslation();

  // 코인별 분포 데이터를 차트 데이터로 변환한다
  const coinChartData: ChartDataItem[] = useMemo(() => {
    return distribution.byCoin.map((item, index) => ({
      name: item.symbol,
      value: item.amount,
      ratio: item.ratio,
      color: COIN_COLORS[index % COIN_COLORS.length]!,
    }));
  }, [distribution.byCoin]);

  // 거래소별 분포 데이터를 차트 데이터로 변환한다
  const exchangeChartData: ChartDataItem[] = useMemo(() => {
    return distribution.byExchange.map((item) => ({
      name: getExchangeName(item.exchange, locale),
      value: item.amount,
      ratio: item.ratio,
      color: EXCHANGE_COLORS[item.exchange] ?? COIN_COLORS[0]!,
    }));
  }, [distribution.byExchange]);

  // 차트 데이터가 모두 비어 있으면 렌더링하지 않는다
  if (coinChartData.length === 0 && exchangeChartData.length === 0) {
    return null;
  }

  return (
    <div className={cn('grid grid-cols-1 gap-4 lg:grid-cols-2', className)}>
      {/* 코인별 비중 차트 */}
      <DonutChart
        title={t.portfolio.coinDistribution}
        data={coinChartData}
        ariaLabel={t.portfolio.coinDistribution}
      />

      {/* 거래소별 비중 차트 */}
      <DonutChart
        title={t.portfolio.exchangeDistribution}
        data={exchangeChartData}
        ariaLabel={t.portfolio.exchangeDistribution}
      />
    </div>
  );
}

// ===== 내부 컴포넌트 Export (테스트용) =====
export { DonutChart, ChartTooltip, ChartLegend };
export { COIN_COLORS, EXCHANGE_COLORS };
export type { ChartDataItem, DonutChartProps, AssetDistributionChartsProps };
