/**
 * 선물 마켓 데이터 대시보드
 *
 * 바이낸스 Futures의 5가지 지표를 주요 코인 전체에 대해 시각화한다.
 */

'use client';

import { useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import { Activity, Loader2, TrendingUp, TrendingDown, Zap, DollarSign, Users, ChevronDown, ChevronUp } from 'lucide-react';

import { useFuturesIndicators, useFuturesSymbols } from '@/hooks/useFuturesData';
import type { CachedFuturesData } from '@bitscope/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

function stripUsdt(symbol: string): string {
  return symbol.replace(/USDT$/i, '');
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function formatCompact(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

/** 코인별 요약 카드 */
function CoinSummaryCard({ symbol }: { symbol: string }) {
  const { data: indicators, isLoading } = useFuturesIndicators(symbol);
  const [expanded, setExpanded] = useState(false);
  const coinName = stripUsdt(symbol);

  const longShortRatio = indicators?.longShortRatio ?? [];
  const fundingRate = indicators?.fundingRate ?? [];
  const openInterest = indicators?.openInterest ?? [];
  const liquidations = indicators?.liquidations ?? [];
  const topTraderRatio = indicators?.topTraderRatio ?? [];

  const latestLS = longShortRatio[longShortRatio.length - 1];
  const latestFR = fundingRate[fundingRate.length - 1];
  const latestOI = openInterest[openInterest.length - 1];
  const latestTop = topTraderRatio[topTraderRatio.length - 1];
  const totalLiq = liquidations.reduce((sum, l) => sum + l.quoteQuantity, 0);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!indicators) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <p className="text-xs text-muted-foreground">{coinName} 데이터 수집 중...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {/* 요약 헤더 (클릭으로 상세 토글) */}
      <button
        type="button"
        className="w-full text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold">{coinName}</CardTitle>
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </CardHeader>
        <CardContent className="pb-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {/* 롱숏 비율 */}
            <div>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-profit" />롱/숏
              </p>
              {latestLS ? (
                <>
                  <div className="h-2 rounded-full bg-loss overflow-hidden mt-1">
                    <div className="h-full rounded-full bg-profit" style={{ width: `${latestLS.longAccount * 100}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] mt-0.5">
                    <span className="text-profit">{(latestLS.longAccount * 100).toFixed(1)}%</span>
                    <span className="text-loss">{(latestLS.shortAccount * 100).toFixed(1)}%</span>
                  </div>
                </>
              ) : <p className="text-[10px] text-muted-foreground">-</p>}
            </div>

            {/* 펀딩 비율 */}
            <div>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-3 w-3 text-primary" />펀딩
              </p>
              {latestFR ? (
                <p className={cn('text-sm font-bold mt-0.5', latestFR.fundingRate >= 0 ? 'text-profit' : 'text-loss')}>
                  {(latestFR.fundingRate * 100).toFixed(4)}%
                </p>
              ) : <p className="text-[10px] text-muted-foreground">-</p>}
            </div>

            {/* 미결제 약정 */}
            <div>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Activity className="h-3 w-3 text-orange-500" />OI
              </p>
              {latestOI ? (
                <p className="text-sm font-bold text-foreground mt-0.5">
                  {formatCompact(latestOI.sumOpenInterestValue)}
                </p>
              ) : <p className="text-[10px] text-muted-foreground">-</p>}
            </div>

            {/* 강제 청산 */}
            <div>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Zap className="h-3 w-3 text-red-500" />청산
              </p>
              <p className="text-sm font-bold text-foreground mt-0.5">
                {formatCompact(totalLiq)}
              </p>
            </div>

            {/* 탑 트레이더 */}
            <div>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3 text-purple-500" />탑 트레이더
              </p>
              {latestTop ? (
                <>
                  <div className="h-2 rounded-full bg-loss overflow-hidden mt-1">
                    <div className="h-full rounded-full bg-profit" style={{ width: `${latestTop.longAccount * 100}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] mt-0.5">
                    <span className="text-profit">L {(latestTop.longAccount * 100).toFixed(1)}%</span>
                    <span className="text-loss">S {(latestTop.shortAccount * 100).toFixed(1)}%</span>
                  </div>
                </>
              ) : <p className="text-[10px] text-muted-foreground">-</p>}
            </div>
          </div>
        </CardContent>
      </button>

      {/* 상세 차트 (펼침) */}
      {expanded && (
        <CardContent className="pt-0 border-t border-border">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-3">
            {/* 롱숏 비율 차트 */}
            {longShortRatio.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">롱/숏 비율 추이</p>
                <div className="h-[120px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={longShortRatio.slice(-20)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="timestamp" tickFormatter={formatTime} tick={{ fontSize: 10 }} />
                      <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
                      <Tooltip labelFormatter={(v) => formatTime(v as number)} />
                      <Line type="monotone" dataKey="longShortRatio" stroke="hsl(217.2, 91.2%, 59.8%)" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* 펀딩 비율 차트 */}
            {fundingRate.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">펀딩 비율</p>
                <div className="h-[120px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={fundingRate}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="fundingTime" tickFormatter={formatTime} tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={(v) => `${(v * 100).toFixed(3)}%`} tick={{ fontSize: 10 }} />
                      <Tooltip labelFormatter={(v) => formatTime(v as number)} formatter={(v: number) => [`${(v * 100).toFixed(4)}%`, '펀딩']} />
                      <Bar dataKey="fundingRate">
                        {fundingRate.map((entry, i) => (
                          <Cell key={i} fill={entry.fundingRate >= 0 ? 'hsl(142.1, 76.2%, 36.3%)' : 'hsl(0, 84.2%, 60.2%)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* OI 차트 */}
            {openInterest.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">미결제 약정 (OI)</p>
                <div className="h-[120px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={openInterest.slice(-20)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="timestamp" tickFormatter={formatTime} tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={(v) => formatCompact(v)} tick={{ fontSize: 10 }} />
                      <Tooltip labelFormatter={(v) => formatTime(v as number)} formatter={(v: number) => [formatCompact(v), 'OI']} />
                      <Line type="monotone" dataKey="sumOpenInterestValue" stroke="hsl(30, 80%, 55%)" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* 강제 청산 리스트 */}
            {liquidations.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">최근 강제 청산</p>
                <div className="space-y-1 max-h-[120px] overflow-auto">
                  {liquidations.slice(0, 8).map((liq, i) => (
                    <div key={i} className="flex items-center justify-between text-[10px]">
                      <div className="flex items-center gap-1">
                        <Badge variant={liq.side === 'SELL' ? 'destructive' : 'default'} className="text-[8px] px-1 py-0">
                          {liq.side === 'SELL' ? '롱청산' : '숏청산'}
                        </Badge>
                        <span className="text-muted-foreground">{formatTime(liq.time)}</span>
                      </div>
                      <span className="font-medium">{formatCompact(liq.quoteQuantity)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 탑 트레이더 차트 */}
            {topTraderRatio.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">탑 트레이더 포지션 추이</p>
                <div className="h-[120px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={topTraderRatio.slice(-20)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="timestamp" tickFormatter={formatTime} tick={{ fontSize: 10 }} />
                      <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
                      <Tooltip labelFormatter={(v) => formatTime(v as number)} />
                      <Line type="monotone" dataKey="longShortRatio" stroke="hsl(280, 65%, 60%)" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function FuturesPage() {
  const { data: symbols } = useFuturesSymbols();
  const allSymbols = symbols ?? ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT'];

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold text-foreground">Futures Market Data</h1>
        <span className="text-xs text-muted-foreground">Binance USDT-M</span>
      </div>

      {/* 전체 코인 카드 */}
      <div className="space-y-3">
        {allSymbols.map((sym) => (
          <CoinSummaryCard key={sym} symbol={sym} />
        ))}
      </div>
    </div>
  );
}
