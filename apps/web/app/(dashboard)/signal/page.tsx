/**
 * 롱/숏 시그널 페이지 (히든 메뉴)
 *
 * 코인별 최신 시그널을 한 라인 테이블로 표시하고,
 * 클릭 시 차트 + 시그널 타임라인이 펼쳐진다.
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Loader2, ChevronDown } from 'lucide-react';

import { useSignalAuth, useSignalLatest, useSignalList, useSignalByCoin } from '@/hooks/useSignal';
import { useTranslation } from '@/lib/i18n/i18n-context';
import dynamic from 'next/dynamic';

const SignalChart = dynamic(
  () => import('@/components/signal/signal-chart').then((m) => m.SignalChart),
  { ssr: false, loading: () => <div className="h-[300px] flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> },
);
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CoinLatestSignal, SignalItem } from '@bitscope/shared';

/** 주요 코인 우선 정렬 (인덱스가 낮을수록 상위) */
const COIN_PRIORITY: string[] = [
  'BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT',
  'MATIC', 'UNI', 'LTC', 'BCH', 'ATOM', 'NEAR', 'APT', 'ARB', 'OP', 'SUI',
  'FIL', 'TRX', 'AAVE', 'MKR', 'INJ', 'TIA', 'SEI', 'FET', 'RENDER', 'PEPE',
];

function getCoinSortKey(coinSymbol: string): number {
  const base = coinSymbol.split('/')[0] ?? coinSymbol;
  const idx = COIN_PRIORITY.indexOf(base);
  return idx >= 0 ? idx : COIN_PRIORITY.length + 1;
}

function sortSignals<T extends { coinSymbol: string }>(signals: T[]): T[] {
  return [...signals].sort((a, b) => {
    const diff = getCoinSortKey(a.coinSymbol) - getCoinSortKey(b.coinSymbol);
    if (diff !== 0) return diff;
    return a.coinSymbol.localeCompare(b.coinSymbol);
  });
}

function timeAgo(dateStr: string): string {
  const diffMin = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return `${Math.floor(diffHour / 24)}일 전`;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function CoinIcon({ symbol }: { symbol: string }) {
  const base = (symbol.split('/')[0] ?? symbol).toLowerCase();
  const src = `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/32/color/${base}.png`;

  return (
    <img
      src={src}
      alt=""
      width={18}
      height={18}
      className="rounded-full shrink-0"
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

/** 펼침 영역: 캔들 차트(시그널 마커 포함) + 시그널 타임라인 */
function SignalDetail({ coinSymbol }: { coinSymbol: string }) {
  const { data: history, isLoading } = useSignalByCoin(coinSymbol);

  return (
    <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-3">
      {/* Lightweight Charts + 시그널 마커 */}
      <div className="rounded-lg overflow-hidden border border-border">
        <SignalChart coinSymbol={coinSymbol} signals={history ?? []} />
      </div>

      {/* 시그널 타임라인 */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">시그널 이력</p>
        {isLoading && (
          <div className="flex justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {history && history.length > 0 && (
          <div className="space-y-1">
            {history.map((s, i) => {
              const isLong = s.direction === 'LONG';
              return (
                <div
                  key={i}
                  className={cn(
                    'flex items-center gap-3 px-2 py-1 rounded text-xs',
                    isLong ? 'bg-green-50/60 dark:bg-green-900/10' : 'bg-red-50/60 dark:bg-red-900/10',
                  )}
                >
                  <span className={cn(
                    'font-bold w-[60px]',
                    isLong ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
                  )}>
                    {isLong ? '▲ LONG' : '▼ SHORT'}
                  </span>
                  <span className="text-muted-foreground w-[80px]">[{s.signalType}]</span>
                  <span className="text-muted-foreground flex-1">{s.sectionName ?? ''}</span>
                  <span className="text-muted-foreground shrink-0">{formatTime(s.signalAt)}</span>
                </div>
              );
            })}
          </div>
        )}
        {history && history.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">이력 없음</p>
        )}
      </div>
    </div>
  );
}

/** 코인 행 (클릭 시 상세 펼침) */
function SignalRow({
  signal,
  isExpanded,
  onToggle,
}: {
  signal: CoinLatestSignal;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const isLong = signal.direction === 'LONG';

  return (
    <>
      <tr
        className={cn(
          'border-b border-border text-sm transition-colors cursor-pointer',
          isLong ? 'hover:bg-green-50/50 dark:hover:bg-green-900/5' : 'hover:bg-red-50/50 dark:hover:bg-red-900/5',
          isExpanded && 'bg-muted/30',
        )}
        onClick={onToggle}
      >
        <td className="px-3 py-2 w-[140px]">
          <div className="flex items-center gap-2">
            <CoinIcon symbol={signal.coinSymbol} />
            <span className="font-semibold text-foreground">{signal.coinSymbol}</span>
          </div>
        </td>
        <td className="px-3 py-2 w-[80px]">
          <span className={cn(
            'text-xs font-bold',
            isLong ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
          )}>
            {isLong ? '▲ LONG' : '▼ SHORT'}
          </span>
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground w-[100px]">[{signal.signalType}]</td>
        <td className="px-3 py-2 text-[11px] text-muted-foreground">{signal.sectionName ?? ''}</td>
        <td className="px-3 py-2 text-xs text-muted-foreground text-right w-[80px]">{timeAgo(signal.signalAt)}</td>
        <td className="px-1 py-2 w-[24px]">
          <ChevronDown className={cn(
            'h-3.5 w-3.5 text-muted-foreground transition-transform',
            isExpanded && 'rotate-180',
          )} />
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={6} className="p-0">
            <SignalDetail coinSymbol={signal.coinSymbol} />
          </td>
        </tr>
      )}
    </>
  );
}

function SignalHistoryRow({ signal }: { signal: SignalItem }) {
  const isLong = signal.direction === 'LONG';

  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-muted/30 text-sm">
      <td className="px-3 py-2 font-medium">{signal.coinSymbol}</td>
      <td className="px-3 py-2">
        <span className={cn(
          'text-xs font-bold',
          isLong ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
        )}>
          {isLong ? '▲ LONG' : '▼ SHORT'}
        </span>
      </td>
      <td className="px-3 py-2 text-muted-foreground">[{signal.signalType}]</td>
      <td className="px-3 py-2 text-muted-foreground text-xs">{signal.sectionName ?? '-'}</td>
      <td className="px-3 py-2 text-muted-foreground text-xs">{timeAgo(signal.signalAt)}</td>
    </tr>
  );
}

export default function SignalPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { isAuthenticated, isReady } = useSignalAuth();
  const [page, setPage] = useState(1);
  const [expandedCoin, setExpandedCoin] = useState<string | null>(null);

  // 미인증 시 메인으로 리다이렉트 (초기 로딩 완료 후에만 판단)
  useEffect(() => {
    if (isReady && !isAuthenticated) {
      router.replace('/');
    }
  }, [isReady, isAuthenticated, router]);

  const { data: latestSignals, isLoading: isLatestLoading } = useSignalLatest(isAuthenticated);
  const { data: signalList, isLoading: isListLoading } = useSignalList(page, isAuthenticated);

  if (!isReady || !isAuthenticated) return null;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <Lock className="h-5 w-5 text-purple-500" />
        <h1 className="text-lg font-semibold text-foreground">
          {t.signal.pageTitle}
        </h1>
      </div>

      {/* 코인별 최신 시그널 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{t.signal.latestSignals}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLatestLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLatestLoading && (!latestSignals || latestSignals.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t.signal.emptyState}
            </p>
          )}

          {latestSignals && latestSignals.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">코인</th>
                    <th className="px-3 py-2 text-left font-medium">방향</th>
                    <th className="px-3 py-2 text-left font-medium">타입</th>
                    <th className="px-3 py-2 text-left font-medium">섹션</th>
                    <th className="px-3 py-2 text-right font-medium">시간</th>
                    <th className="w-[24px]" />
                  </tr>
                </thead>
                <tbody>
                  {sortSignals(latestSignals).map((signal) => (
                    <SignalRow
                      key={signal.coinSymbol}
                      signal={signal}
                      isExpanded={expandedCoin === signal.coinSymbol}
                      onToggle={() => setExpandedCoin(
                        expandedCoin === signal.coinSymbol ? null : signal.coinSymbol,
                      )}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 시그널 히스토리 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{t.signal.signalHistory}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isListLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {signalList && signalList.items.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">코인</th>
                      <th className="px-3 py-2 text-left font-medium">방향</th>
                      <th className="px-3 py-2 text-left font-medium">타입</th>
                      <th className="px-3 py-2 text-left font-medium">섹션</th>
                      <th className="px-3 py-2 text-left font-medium">시간</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signalList.items.map((signal) => (
                      <SignalHistoryRow key={signal.id} signal={signal} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 페이지네이션 */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  총 {signalList.total}건
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    이전
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {page} / {Math.ceil(signalList.total / signalList.limit) || 1}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page * signalList.limit >= signalList.total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    다음
                  </Button>
                </div>
              </div>
            </>
          )}

          {!isListLoading && signalList && signalList.items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t.signal.emptyState}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
