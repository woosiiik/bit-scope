/**
 * 숫자 포맷 표시 컴포넌트
 *
 * 금액, 수익률 등 숫자 데이터를 적절한 포맷과 색상으로 표시한다.
 * 수익은 녹색/파란색, 손실은 빨간색으로 색상을 구분한다.
 *
 * @see 요구사항 9.7 (숫자 데이터 포맷)
 * @see 요구사항 9.8 (수익 녹색/손실 빨간색 색상 구분)
 * @see 요구사항 NF4.2 (ARIA 레이블)
 */

'use client';

import {
  formatCurrency,
  formatPercent,
  formatCoinPrice,
  formatQuantity,
  formatCompactKRW,
  formatNumber,
  type CurrencyCode,
} from '@bitscope/shared';
import { cn } from '@/lib/utils';

/** 공통 Props */
interface BaseFormattedProps {
  /** 추가 CSS 클래스 */
  className?: string;
  /** 수익/손실 색상 적용 여부 */
  colorize?: boolean;
}

/**
 * 값에 따른 수익/손실 색상 클래스를 반환한다.
 *
 * @param value - 수치 값
 * @param colorize - 색상 적용 여부
 * @returns Tailwind CSS 클래스 문자열
 */
function getProfitLossColor(value: number, colorize: boolean): string {
  if (!colorize) return '';
  if (value > 0) return 'text-profit';
  if (value < 0) return 'text-loss';
  return 'text-muted-foreground';
}

/**
 * 값에 대한 스크린 리더용 설명을 생성한다.
 *
 * @param value - 수치 값
 * @param type - 데이터 유형
 * @returns ARIA 라벨 문자열
 */
function getAriaLabel(value: number, type: string): string {
  if (value > 0) return `${type} 수익 ${Math.abs(value)}`;
  if (value < 0) return `${type} 손실 ${Math.abs(value)}`;
  return `${type} 변동 없음`;
}

// ============================================================
// FormattedCurrency - 통화 포맷 컴포넌트
// ============================================================

/** FormattedCurrency Props */
interface FormattedCurrencyProps extends BaseFormattedProps {
  /** 포맷할 금액 */
  value: number;
  /** 통화 코드 (기본: KRW) */
  currency?: CurrencyCode;
  /** 부호 표시 여부 */
  showSign?: boolean;
  /** 축약 표시 여부 (1.2억, 3.5조 등) */
  compact?: boolean;
}

/**
 * 통화 금액을 포맷하여 표시한다.
 *
 * 천 단위 구분, 통화 기호, 수익/손실 색상 구분을 지원한다.
 *
 * @example
 * <FormattedCurrency value={1234567} /> // "₩1,234,567"
 * <FormattedCurrency value={1234567} compact /> // "123만"
 * <FormattedCurrency value={-500000} colorize /> // "-₩500,000" (빨간색)
 * <FormattedCurrency value={1234.56} currency="USD" /> // "$1,234.56"
 */
export function FormattedCurrency({
  value,
  currency = 'KRW',
  showSign = false,
  compact = false,
  colorize = false,
  className,
}: FormattedCurrencyProps) {
  const formatted = compact && currency === 'KRW'
    ? formatCompactKRW(value)
    : formatCurrency(value, currency, { showSign });

  return (
    <span
      className={cn(getProfitLossColor(value, colorize), className)}
      aria-label={colorize ? getAriaLabel(value, '금액') : undefined}
    >
      {formatted}
    </span>
  );
}

// ============================================================
// FormattedPercent - 수익률 포맷 컴포넌트
// ============================================================

/** FormattedPercent Props */
interface FormattedPercentProps extends BaseFormattedProps {
  /** 수익률 (%) */
  value: number;
  /** 소수점 자릿수 (기본: 2) */
  decimalPlaces?: number;
  /** 부호 표시 여부 (기본: true) */
  showSign?: boolean;
}

/**
 * 수익률(%)을 포맷하여 표시한다.
 *
 * 양수는 + 부호, 음수는 - 부호를 표시하며,
 * colorize 옵션에 따라 수익/손실 색상을 적용한다.
 *
 * @example
 * <FormattedPercent value={12.345} /> // "+12.35%"
 * <FormattedPercent value={-5.678} colorize /> // "-5.68%" (빨간색)
 * <FormattedPercent value={0} /> // "0.00%"
 */
export function FormattedPercent({
  value,
  decimalPlaces,
  showSign = true,
  colorize = false,
  className,
}: FormattedPercentProps) {
  const formatted = formatPercent(value, { decimalPlaces, showSign });

  return (
    <span
      className={cn(getProfitLossColor(value, colorize), className)}
      aria-label={colorize ? getAriaLabel(value, '수익률') : undefined}
    >
      {formatted}
    </span>
  );
}

// ============================================================
// FormattedPrice - 코인 가격 포맷 컴포넌트
// ============================================================

/** FormattedPrice Props */
interface FormattedPriceProps extends BaseFormattedProps {
  /** 가격 */
  value: number;
  /** 코인 심볼 (소수점 자릿수 결정에 사용) */
  symbol?: string;
}

/**
 * 코인 가격을 포맷하여 표시한다.
 *
 * 코인별로 적절한 소수점 자릿수를 적용한다.
 *
 * @example
 * <FormattedPrice value={98765432} symbol="BTC" /> // "98,765,432"
 * <FormattedPrice value={3.45} symbol="XRP" /> // "3.45"
 */
export function FormattedPrice({ value, symbol, className }: FormattedPriceProps) {
  const formatted = formatCoinPrice(value, symbol);

  return <span className={className}>{formatted}</span>;
}

// ============================================================
// FormattedQuantity - 코인 수량 포맷 컴포넌트
// ============================================================

/** FormattedQuantity Props */
interface FormattedQuantityProps extends BaseFormattedProps {
  /** 보유 수량 */
  value: number;
}

/**
 * 코인 수량을 포맷하여 표시한다.
 *
 * 불필요한 후행 0을 제거하여 깔끔하게 표시한다.
 *
 * @example
 * <FormattedQuantity value={1.23456789} /> // "1.23456789"
 * <FormattedQuantity value={100} /> // "100"
 */
export function FormattedQuantity({ value, className }: FormattedQuantityProps) {
  const formatted = formatQuantity(value);

  return <span className={className}>{formatted}</span>;
}

// ============================================================
// FormattedNumber - 범용 숫자 포맷 컴포넌트
// ============================================================

/** FormattedNumber Props */
interface FormattedNumberProps extends BaseFormattedProps {
  /** 포맷할 숫자 */
  value: number;
  /** 소수점 자릿수 */
  decimalPlaces?: number;
}

/**
 * 숫자를 천 단위 구분과 함께 포맷하여 표시한다.
 *
 * @example
 * <FormattedNumber value={1234567} /> // "1,234,567"
 * <FormattedNumber value={1234.5678} decimalPlaces={2} /> // "1,234.57"
 */
export function FormattedNumber({
  value,
  decimalPlaces = 0,
  colorize = false,
  className,
}: FormattedNumberProps) {
  const formatted = formatNumber(value, decimalPlaces);

  return (
    <span
      className={cn(getProfitLossColor(value, colorize), className)}
      aria-label={colorize ? getAriaLabel(value, '수치') : undefined}
    >
      {formatted}
    </span>
  );
}

// ============================================================
// ProfitLossIndicator - 수익/손실 표시기
// ============================================================

/** ProfitLossIndicator Props */
interface ProfitLossIndicatorProps {
  /** 수익/손실 금액 */
  amount: number;
  /** 수익률 (%) */
  rate: number;
  /** 통화 코드 (기본: KRW) */
  currency?: CurrencyCode;
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * 수익/손실 금액과 수익률을 함께 표시한다.
 *
 * 수익 시 녹색, 손실 시 빨간색으로 표시하며,
 * 금액과 수익률을 한 줄에 함께 보여준다.
 *
 * @example
 * <ProfitLossIndicator amount={150000} rate={12.5} />
 * // "+₩150,000 (+12.50%)" (녹색)
 *
 * <ProfitLossIndicator amount={-50000} rate={-3.2} />
 * // "-₩50,000 (-3.20%)" (빨간색)
 */
export function ProfitLossIndicator({
  amount,
  rate,
  currency = 'KRW',
  className,
}: ProfitLossIndicatorProps) {
  const colorClass = getProfitLossColor(amount, true);
  const formattedAmount = formatCurrency(amount, currency, { showSign: true });
  const formattedRate = formatPercent(rate);

  const ariaDescription =
    amount > 0
      ? `수익 ${Math.abs(amount)}원, 수익률 ${Math.abs(rate)}퍼센트`
      : amount < 0
        ? `손실 ${Math.abs(amount)}원, 손실률 ${Math.abs(rate)}퍼센트`
        : '변동 없음';

  return (
    <span className={cn(colorClass, 'inline-flex items-center gap-1', className)} aria-label={ariaDescription}>
      <span>{formattedAmount}</span>
      <span className="text-sm">({formattedRate})</span>
    </span>
  );
}
