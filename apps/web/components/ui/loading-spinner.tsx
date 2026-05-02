/**
 * 로딩 스피너 컴포넌트
 *
 * 데이터 로딩 중 인라인 또는 전체 화면에 표시되는 회전 인디케이터이다.
 * 스켈레톤 UI와 함께 또는 독립적으로 사용할 수 있다.
 *
 * @see 요구사항 9.5 (로딩 인디케이터)
 * @see 요구사항 NF4.1 (WCAG 2.1 AA 접근성)
 */

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** LoadingSpinner Props */
interface LoadingSpinnerProps {
  /** 스피너 크기 */
  size?: 'sm' | 'md' | 'lg';
  /** 로딩 메시지 */
  message?: string;
  /** 추가 CSS 클래스 */
  className?: string;
}

/** 크기별 스피너 스타일 매핑 */
const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-10 w-10',
} as const;

/**
 * 인라인 로딩 스피너
 *
 * 컨텐츠 영역 내에서 로딩 상태를 표시한다.
 *
 * @example
 * <LoadingSpinner size="sm" />
 * <LoadingSpinner message="자산 정보를 불러오는 중..." />
 */
export function LoadingSpinner({
  size = 'md',
  message,
  className,
}: LoadingSpinnerProps) {
  return (
    <div
      className={cn('flex items-center justify-center gap-2', className)}
      role="status"
      aria-label={message || '로딩 중'}
    >
      <Loader2
        className={cn('animate-spin text-muted-foreground', sizeClasses[size])}
        aria-hidden="true"
      />
      {message && (
        <span className="text-sm text-muted-foreground">{message}</span>
      )}
      <span className="sr-only">{message || '로딩 중'}</span>
    </div>
  );
}

// ============================================================
// FullPageLoader - 전체 화면 로딩 인디케이터
// ============================================================

/** FullPageLoader Props */
interface FullPageLoaderProps {
  /** 로딩 메시지 */
  message?: string;
}

/**
 * 전체 화면 로딩 인디케이터
 *
 * 페이지 전체를 덮는 로딩 화면으로,
 * 초기 데이터 로딩 또는 페이지 전환 시 사용한다.
 */
export function FullPageLoader({ message = '로딩 중...' }: FullPageLoaderProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm"
      role="status"
      aria-label={message}
    >
      <Loader2
        className="h-12 w-12 animate-spin text-primary"
        aria-hidden="true"
      />
      <p className="mt-4 text-sm text-muted-foreground">{message}</p>
      <span className="sr-only">{message}</span>
    </div>
  );
}
