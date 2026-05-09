/**
 * 포트폴리오 요약 위젯
 *
 * 총 자산, 손익, 미니 도넛 차트, 코인별/거래소별 비중 바를 표시한다.
 * 탭으로 코인별/거래소별 뷰를 전환할 수 있다.
 */

'use client';

import { useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import Link from 'next/link';
import type { ExchangeType } from '@bitscope/shared';
import { usePortfolioStore } from '@/store/portfolio-store';
import { usePortfolio } from '@/hooks/usePortfolio';
import { getCachedEncryptionKey } from '@/lib/crypto/encryption-service';
import { getExchangeName } from '@/lib/utils';
import { cn } from '@/lib/utils';

const COLORS = [
  'hsl(217.2, 91.2%, 59.8%)',
  'hsl(160, 60%, 45%)',
  'hsl(30, 80%, 55%)',
  'hsl(280, 65%, 60%)',
  'hsl(340, 75%, 55%)',
  'hsl(190, 70%, 50%)',
];

type ViewTab = 'coin' | 'exchange';

interface BreakdownItem {
  name: string;
  value: number;
  ratio: number;
  profitLossRate: number;
}

export function PortfolioWidget() {
  const { address } = useAccount();
  const walletAddress = address ?? '';
  const [viewTab, setViewTab] = useState<ViewTab>('coin');

  const hasEncryptionKey = typeof window !== 'undefined' && !!getCachedEncryptionKey();
  usePortfolio({ walletAddress, enabled: !!walletAddress && hasEncryptionKey });

  const agg = usePortfolioStore((s) => s.aggregatedPortfolio);
  const totalEvaluation = agg?.totalEvaluation ?? 0;
  const totalProfitLoss = agg?.totalProfitLoss ?? 0;
  const profitLossRate = agg?.profitLossRate ?? 0;
  const mergedHoldings = agg?.mergedHoldings ?? [];
  const portfolios = agg?.portfolios ?? [];

  const isProfit = totalProfitLoss >= 0;

  // 코인별 데이터
  const coinItems: BreakdownItem[] = useMemo(() => {
    if (totalEvaluation <= 0) return [];
    return mergedHoldings.slice(0, 5).map((h) => ({
      name: h.symbol,
      value: h.totalEvaluation,
      ratio: (h.totalEvaluation / totalEvaluation) * 100,
      profitLossRate: h.profitLossRate,
    }));
  }, [mergedHoldings, totalEvaluation]);

  // 거래소별 데이터
  const exchangeItems: BreakdownItem[] = useMemo(() => {
    if (totalEvaluation <= 0) return [];
    return portfolios
      .filter((p) => p.totalEvaluation > 0)
      .sort((a, b) => b.totalEvaluation - a.totalEvaluation)
      .slice(0, 5)
      .map((p) => ({
        name: getExchangeName(p.exchange as ExchangeType),
        value: p.totalEvaluation,
        ratio: (p.totalEvaluation / totalEvaluation) * 100,
        profitLossRate: p.profitLossRate,
      }));
  }, [portfolios, totalEvaluation]);

  const activeItems = viewTab === 'coin' ? coinItems : exchangeItems;

  // 도넛 차트 데이터
  const chartData = useMemo(() => {
    if (activeItems.length === 0) return [];
    const data = activeItems.map((item) => ({
      name: item.name,
      value: item.value,
    }));
    const othersValue = totalEvaluation - data.reduce((s, d) => s + d.value, 0);
    if (othersValue > 0) data.push({ name: '기타', value: othersValue });
    return data;
  }, [activeItems, totalEvaluation]);

  if (!hasEncryptionKey || totalEvaluation === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 gap-2">
        <Wallet className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground text-center">
          {!hasEncryptionKey
            ? '포트폴리오 메뉴에서 지갑 서명을 완료하세요'
            : '등록된 거래소가 없습니다'}
        </p>
        {!hasEncryptionKey && (
          <Link href="/" className="text-xs text-primary hover:underline">
            포트폴리오로 이동
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-3 overflow-auto">
      {/* 헤더: 타이틀 + 탭 */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Portfolio
        </h3>
        <div className="flex rounded-md border border-border overflow-hidden">
          <button
            type="button"
            className={cn(
              'px-2 py-0.5 text-[10px] transition-colors',
              viewTab === 'coin'
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent text-muted-foreground',
            )}
            onClick={() => setViewTab('coin')}
          >
            코인별
          </button>
          <button
            type="button"
            className={cn(
              'px-2 py-0.5 text-[10px] transition-colors',
              viewTab === 'exchange'
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent text-muted-foreground',
            )}
            onClick={() => setViewTab('exchange')}
          >
            거래소별
          </button>
        </div>
      </div>

      {/* 상단: 도넛 차트 + 총 자산 */}
      <div className="flex items-center gap-3 mb-3">
        <div className="h-[72px] w-[72px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                cx="50%"
                cy="50%"
                innerRadius="60%"
                outerRadius="95%"
                startAngle={90}
                endAngle={-270}
                paddingAngle={1}
                stroke="none"
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-foreground truncate">
            {Math.round(totalEvaluation).toLocaleString('ko-KR')}
            <span className="text-xs font-normal text-muted-foreground ml-0.5">원</span>
          </p>
          <div className={cn('flex items-center gap-1 text-xs mt-0.5', isProfit ? 'text-profit' : 'text-loss')}>
            {isProfit ? <TrendingUp className="h-3 w-3 shrink-0" /> : <TrendingDown className="h-3 w-3 shrink-0" />}
            <span className="truncate">
              {isProfit ? '+' : ''}{Math.round(totalProfitLoss).toLocaleString('ko-KR')}원
              ({isProfit ? '+' : ''}{profitLossRate.toFixed(2)}%)
            </span>
          </div>
        </div>
      </div>

      {/* 비중 바 */}
      <div className="space-y-2 flex-1">
        {activeItems.map((item, i) => (
          <div key={item.name} className="space-y-0.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <span className="font-medium text-foreground">{item.name}</span>
                <span className="text-muted-foreground">{item.ratio.toFixed(1)}%</span>
              </div>
              <div className="text-right">
                <span className="text-foreground">{Math.round(item.value).toLocaleString('ko-KR')}</span>
                <span className={cn('ml-1.5 font-medium', item.profitLossRate >= 0 ? 'text-profit' : 'text-loss')}>
                  {item.profitLossRate >= 0 ? '+' : ''}{item.profitLossRate.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(item.ratio, 100)}%`,
                  backgroundColor: COLORS[i % COLORS.length],
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
