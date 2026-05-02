/**
 * 오류 표시 컴포넌트
 *
 * 거래소 API 호출 오류, 네트워크 오류 등 다양한 오류 상황에서
 * 사용자 친화적인 오류 메시지와 재시도 옵션을 제공한다.
 *
 * @see 요구사항 9.6 (사용자 친화적 오류 메시지 + 재시도 옵션)
 * @see 요구사항 NF4.1 (WCAG 2.1 AA 접근성)
 * @see 요구사항 NF4.2 (ARIA 레이블)
 */

'use client';

import { AlertCircle, RefreshCw, WifiOff, ShieldAlert, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/** 오류 유형 */
export type ErrorType =
  | 'network'
  | 'timeout'
  | 'auth'
  | 'rate_limit'
  | 'exchange_maintenance'
  | 'general';

/** ErrorDisplay Props */
interface ErrorDisplayProps {
  /** 오류 제목 */
  title?: string;
  /** 오류 설명 메시지 */
  message?: string;
  /** 오류 유형 (아이콘 및 기본 메시지 결정) */
  type?: ErrorType;
  /** 재시도 콜백 함수 (없으면 재시도 버튼 미표시) */
  onRetry?: () => void;
  /** 재시도 중 여부 */
  isRetrying?: boolean;
  /** 인라인 표시 여부 (true이면 컴팩트 레이아웃) */
  inline?: boolean;
  /** 추가 CSS 클래스 */
  className?: string;
}

/** 오류 유형별 기본 정보 */
const errorDefaults: Record<
  ErrorType,
  { title: string; message: string; icon: React.ComponentType<{ className?: string }> }
> = {
  network: {
    title: '네트워크 오류',
    message: '인터넷 연결을 확인해주세요. 연결이 불안정한 경우 잠시 후 다시 시도해주세요.',
    icon: WifiOff,
  },
  timeout: {
    title: '응답 시간 초과',
    message: '거래소 서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.',
    icon: Clock,
  },
  auth: {
    title: '인증 오류',
    message: 'API 키가 유효하지 않거나 권한이 부족합니다. API 키를 확인해주세요.',
    icon: ShieldAlert,
  },
  rate_limit: {
    title: '요청 제한 초과',
    message: '거래소 API 요청 한도에 도달했습니다. 잠시 후 자동으로 재시도됩니다.',
    icon: Clock,
  },
  exchange_maintenance: {
    title: '거래소 점검 중',
    message: '거래소가 점검 중입니다. 마지막으로 조회된 데이터를 표시합니다.',
    icon: AlertCircle,
  },
  general: {
    title: '오류가 발생했습니다',
    message: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    icon: AlertCircle,
  },
};

/**
 * 사용자 친화적 오류 표시 컴포넌트
 *
 * 오류 유형에 따라 적절한 아이콘과 메시지를 표시하며,
 * 재시도 버튼을 제공한다.
 *
 * @example
 * // 기본 사용
 * <ErrorDisplay type="network" onRetry={() => refetch()} />
 *
 * // 커스텀 메시지
 * <ErrorDisplay
 *   title="업비트 연결 실패"
 *   message="업비트 서버에 연결할 수 없습니다."
 *   onRetry={handleRetry}
 * />
 *
 * // 인라인 (테이블 행 등에서 사용)
 * <ErrorDisplay type="timeout" inline onRetry={handleRetry} />
 */
export function ErrorDisplay({
  title,
  message,
  type = 'general',
  onRetry,
  isRetrying = false,
  inline = false,
  className,
}: ErrorDisplayProps) {
  const defaults = errorDefaults[type];
  const displayTitle = title || defaults.title;
  const displayMessage = message || defaults.message;
  const Icon = defaults.icon;

  // 인라인 모드: 컴팩트 레이아웃
  if (inline) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm',
          className,
        )}
        role="alert"
        aria-live="polite"
      >
        <Icon className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        <span className="text-destructive">{displayMessage}</span>
        {onRetry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
            className="ml-auto shrink-0 h-7 px-2"
            aria-label="다시 시도"
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', isRetrying && 'animate-spin')}
              aria-hidden="true"
            />
            <span className="ml-1">재시도</span>
          </Button>
        )}
      </div>
    );
  }

  // 블록 모드: 전체 영역 레이아웃
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-border bg-card p-8 text-center',
        className,
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="rounded-full bg-destructive/10 p-3">
        <Icon className="h-8 w-8 text-destructive" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-foreground">{displayTitle}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{displayMessage}</p>
      {onRetry && (
        <Button
          variant="outline"
          onClick={onRetry}
          disabled={isRetrying}
          className="mt-6"
          aria-label="다시 시도하기"
        >
          <RefreshCw
            className={cn('mr-2 h-4 w-4', isRetrying && 'animate-spin')}
            aria-hidden="true"
          />
          {isRetrying ? '재시도 중...' : '다시 시도'}
        </Button>
      )}
    </div>
  );
}

// ============================================================
// ExchangeErrorBadge - 거래소 오류 배지
// ============================================================

/** ExchangeErrorBadge Props */
interface ExchangeErrorBadgeProps {
  /** 거래소 이름 */
  exchangeName: string;
  /** 마지막 성공 업데이트 시각 */
  lastUpdated?: Date;
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * 거래소별 오류 상태 배지
 *
 * 특정 거래소의 API 오류 상태를 인라인으로 표시한다.
 * 마지막 성공 업데이트 시각을 함께 안내한다.
 *
 * @see 요구사항 2.6 (거래소 오류 시 마지막 성공 시점 데이터 표시)
 */
export function ExchangeErrorBadge({
  exchangeName,
  lastUpdated,
  className,
}: ExchangeErrorBadgeProps) {
  const timeString = lastUpdated
    ? lastUpdated.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '알 수 없음';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs',
        className,
      )}
      role="status"
      aria-label={`${exchangeName} 데이터 지연 중. 마지막 업데이트: ${timeString}`}
    >
      <AlertCircle className="h-3 w-3 text-destructive" aria-hidden="true" />
      <span className="text-destructive font-medium">{exchangeName}</span>
      <span className="text-muted-foreground">
        마지막 업데이트: {timeString}
      </span>
    </div>
  );
}
