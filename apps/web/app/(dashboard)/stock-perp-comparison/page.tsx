'use client';

import { useCallback, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  PAIR_CONFIGS,
  DEFAULT_PAIR,
  DEFAULT_RANGE,
  type ComparisonRange,
} from '@bitscope/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useStockPerpComparison } from '@/hooks/useStockPerpComparison';
import { PairSelector } from './components/pair-selector';
import { RangeSelector } from './components/range-selector';
import { ComparisonChart } from './components/comparison-chart';

/** URL ?pair 기본값 (삼성전자). DEFAULT_PAIR는 noUncheckedIndexedAccess로 undefined 가능. */
const DEFAULT_PAIR_SYMBOL = DEFAULT_PAIR?.stockSymbol ?? '005930.KS';

/** 유효한 range 토큰 집합 — URL 파라미터 검증용. */
const VALID_RANGES: readonly ComparisonRange[] = ['1d', '5d', '1mo', '6mo', '1y'];

function isComparisonRange(value: string | null): value is ComparisonRange {
  return value !== null && (VALID_RANGES as readonly string[]).includes(value);
}

/** 페어 심볼이 PAIR_CONFIGS에 존재하는지 검증. */
function isValidPairSymbol(symbol: string | null): boolean {
  return symbol !== null && PAIR_CONFIGS.some((p) => p.stockSymbol === symbol);
}

export default function StockPerpComparisonPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // URL 파라미터에서 초기 상태 도출 (검증 후 기본값 폴백)
  const pairParam = searchParams.get('pair');
  const rangeParam = searchParams.get('range');

  const [pair, setPair] = useState<string>(
    isValidPairSymbol(pairParam) && pairParam !== null ? pairParam : DEFAULT_PAIR_SYMBOL,
  );
  const [range, setRange] = useState<ComparisonRange>(
    isComparisonRange(rangeParam) ? rangeParam : DEFAULT_RANGE,
  );

  // 현재 페어 설정(라벨/perp 코인). 못 찾으면 기본 페어로 폴백.
  const pairConfig = useMemo(
    () => PAIR_CONFIGS.find((p) => p.stockSymbol === pair) ?? DEFAULT_PAIR,
    [pair],
  );

  // 페어 변경 — 현재 range는 유지 (R1.5)
  const handlePairChange = useCallback(
    (stockSymbol: string) => {
      setPair(stockSymbol);
      const params = new URLSearchParams(searchParams.toString());
      params.set('pair', stockSymbol);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [searchParams, router],
  );

  // range 변경
  const handleRangeChange = useCallback(
    (next: ComparisonRange) => {
      setRange(next);
      const params = new URLSearchParams(searchParams.toString());
      params.set('range', next);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [searchParams, router],
  );

  const { data, isLoading, isError, error, refetch, isFetching } = useStockPerpComparison(
    pair,
    range,
  );

  const stockLabel = pairConfig?.nameKo ?? '주식';
  const perpLabel = pairConfig?.perpCoin ?? '';

  // 최신 non-null appliedRate (적용 환율 헤더, R4.5)
  const latestRate = useMemo(() => {
    const points = data?.points;
    if (!points || points.length === 0) return null;
    for (let i = points.length - 1; i >= 0; i--) {
      const p = points[i];
      if (p !== undefined && p.appliedRate !== null) return p.appliedRate;
    }
    return null;
  }, [data]);

  const errors = data?.errors;
  const points = data?.points ?? [];
  const hasStockError = !!errors?.stock;
  const hasPerpError = !!errors?.perp;
  const hasRateError = !!errors?.rate;

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* 헤더 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-bold text-foreground">주식·선물 비교</h1>
          {latestRate !== null ? (
            <p className="text-xs text-muted-foreground">
              적용 환율: 1 USD = {Math.round(latestRate).toLocaleString('ko-KR')}원 (시점별 변동)
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">종목</span>
            <PairSelector selected={pair} onChange={handlePairChange} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">기간</span>
            <RangeSelector selected={range} onChange={handleRangeChange} />
          </div>
        </div>
      </div>

      {/* 본문 */}
      <Card className="overflow-hidden">
        <CardContent className="p-3 sm:p-4">
          {/* 폴백 안내 (R8.3) */}
          {data?.fallbackApplied ? (
            <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              분봉 한계로 {data.appliedInterval}봉으로 전환됨
            </div>
          ) : null}

          {/* 환율 실패 안내 (R9.4) */}
          {hasRateError ? (
            <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              환율 조회 실패로 통화 변환 불가
            </div>
          ) : null}

          {/* perp 없음 배너 (R9.3) — 주식 라인만 단독 렌더 */}
          {hasPerpError ? (
            <div className="mb-3 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
              perp 데이터 없음 — 주식 라인만 표시합니다.
            </div>
          ) : null}

          {/* 부분 렌더 누락 안내 (R9.5) */}
          {!hasStockError && (hasPerpError || hasRateError) && points.length > 0 ? (
            <div className="mb-3 rounded-md border border-border bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              일부 데이터 누락:
              {hasPerpError ? ' perp' : ''}
              {hasRateError ? ' 환율' : ''}
            </div>
          ) : null}

          <div className="h-[420px]">
            {isLoading ? (
              /* 로딩 스켈레톤 (R9.1) */
              <div className="h-full w-full animate-pulse rounded bg-muted" />
            ) : hasStockError || (isError && !data) ? (
              /* 주식 데이터 조회 실패 + 재시도 (R9.2) */
              <div className="flex h-full flex-col items-center justify-center gap-3">
                <p className="text-center text-sm text-muted-foreground">
                  주식 데이터 조회 실패
                  {error instanceof Error ? (
                    <span className="mt-1 block text-xs text-muted-foreground/70">
                      {error.message}
                    </span>
                  ) : null}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => refetch()}
                  disabled={isFetching}
                >
                  재시도
                </Button>
              </div>
            ) : points.length === 0 ? (
              /* 빈 상태 (R9.6) */
              <div className="flex h-full flex-col items-center justify-center gap-1">
                <p className="text-sm text-muted-foreground">표시할 데이터가 없습니다.</p>
                <p className="text-xs text-muted-foreground/70">
                  다른 페어 또는 기간을 선택해보세요.
                </p>
              </div>
            ) : (
              /* 오버레이 비교 차트 (R6/R7) */
              <ComparisonChart points={points} stockLabel={stockLabel} perpLabel={perpLabel} />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
