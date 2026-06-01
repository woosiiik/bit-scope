'use client';

import type { ComparisonPoint } from '@bitscope/shared';
import { formatAlertPrice } from '@bitscope/shared';

/**
 * 비교 차트 호버 정보 패널 (R6)
 *
 * lightweight-charts `subscribeCrosshairMove`로 역매핑한 `ComparisonPoint`를 받아
 * 해당 시점의 주식가/perp가/적용 환율/괴리를 한국어로 표시한다. recharts payload 계약을
 * 제거하고 props를 `{ point }`로 단순화했다(기존 `divergence-tooltip.tsx` 표시 로직 미러링).
 *
 * - 주식가 (KRW)
 * - perp가 (KRW 변환값 + 원본 USD)
 * - 적용 환율 (USD/KRW)
 * - 괴리: perp − stock (KRW) 및 (perp/stock − 1) × 100%
 *
 * 모든 값은 null 가능하며, 결측 시 '—' 또는 '데이터 없음'으로 안전하게 처리한다.
 * `formatAlertPrice`(@bitscope/shared)로 통화 포맷을 재사용한다.
 */
interface DivergencePanelProps {
  point: ComparisonPoint | null;
}

const EMPTY = '—';

/** 호버 시각을 KST(Asia/Seoul) 날짜·시각 문자열로 포맷한다. */
function formatKstTime(timestamp: number | null | undefined): string {
  if (timestamp == null || !Number.isFinite(timestamp)) return EMPTY;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

export function DivergencePanel({ point }: DivergencePanelProps) {
  if (!point) return null;

  const { timestamp, stockPrice, perpPrice, perpPriceRaw, appliedRate } = point;

  // 괴리 계산: 양쪽 KRW 가격이 모두 유효할 때만 산출한다.
  const hasBoth =
    stockPrice != null &&
    Number.isFinite(stockPrice) &&
    perpPrice != null &&
    Number.isFinite(perpPrice);
  const diffAbs = hasBoth ? perpPrice - stockPrice : null;
  const diffPct =
    hasBoth && stockPrice !== 0 ? (perpPrice / stockPrice - 1) * 100 : null;

  return (
    <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-md border border-border bg-popover/95 px-2.5 py-2 text-[11px] text-popover-foreground shadow-md backdrop-blur-sm">
      <div className="mb-1 font-medium text-muted-foreground">{formatKstTime(timestamp)}</div>

      <dl className="space-y-0.5">
        <Row label="주식가">
          {stockPrice != null && Number.isFinite(stockPrice)
            ? formatAlertPrice(stockPrice, 'KRW')
            : EMPTY}
        </Row>

        <Row label="perp가">
          {perpPrice != null && Number.isFinite(perpPrice) ? (
            <span>
              {formatAlertPrice(perpPrice, 'KRW')}
              {perpPriceRaw != null && Number.isFinite(perpPriceRaw) && (
                <span className="ml-1 text-muted-foreground">
                  ({formatAlertPrice(perpPriceRaw, 'USD')})
                </span>
              )}
            </span>
          ) : perpPriceRaw != null && Number.isFinite(perpPriceRaw) ? (
            <span className="text-muted-foreground">{formatAlertPrice(perpPriceRaw, 'USD')}</span>
          ) : (
            '데이터 없음'
          )}
        </Row>

        <Row label="적용 환율">
          {appliedRate != null && Number.isFinite(appliedRate)
            ? `1 USD = ${appliedRate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원`
            : EMPTY}
        </Row>

        <Row label="괴리">
          {diffAbs != null ? (
            <span className={diffAbs >= 0 ? 'text-emerald-500' : 'text-red-500'}>
              {diffAbs >= 0 ? '+' : '−'}
              {formatAlertPrice(Math.abs(diffAbs), 'KRW')}
              {diffPct != null && (
                <span className="ml-1">
                  ({diffPct >= 0 ? '+' : '−'}
                  {Math.abs(diffPct).toFixed(2)}%)
                </span>
              )}
            </span>
          ) : (
            EMPTY
          )}
        </Row>
      </dl>
    </div>
  );
}

/** 라벨-값 한 줄. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}
