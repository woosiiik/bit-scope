/**
 * Skeleton UI 컴포넌트
 *
 * 데이터 로딩 중 콘텐츠의 자리표시자로 사용되는 스켈레톤이다.
 * 애니메이션 펄스 효과로 로딩 상태를 시각적으로 안내한다.
 *
 * @see 요구사항 9.5 (스켈레톤 UI / 로딩 인디케이터)
 * @see 요구사항 NF4.1 (WCAG 2.1 AA 접근성)
 */

import { cn } from '@/lib/utils';

/** Skeleton Props */
interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * 기본 스켈레톤 블록
 *
 * 로딩 중 콘텐츠 영역의 자리표시자로, 펄스 애니메이션을 적용한다.
 * width, height를 className으로 제어하여 다양한 형태로 사용 가능하다.
 *
 * @example
 * <Skeleton className="h-4 w-48" /> // 텍스트 한 줄
 * <Skeleton className="h-24 w-full" /> // 카드 영역
 * <Skeleton className="h-10 w-10 rounded-full" /> // 아바타
 */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      aria-hidden="true"
      {...props}
    />
  );
}

// ============================================================
// CardSkeleton - 카드 형태 스켈레톤
// ============================================================

/**
 * 카드 형태의 스켈레톤
 *
 * 대시보드의 요약 카드 로딩 상태를 표현한다.
 */
export function CardSkeleton() {
  return (
    <div
      className="rounded-xl border border-border bg-card p-6 space-y-3"
      role="status"
      aria-label="데이터를 불러오는 중입니다"
    >
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-32" />
      <span className="sr-only">데이터를 불러오는 중입니다</span>
    </div>
  );
}

// ============================================================
// TableRowSkeleton - 테이블 행 스켈레톤
// ============================================================

/** TableRowSkeleton Props */
interface TableRowSkeletonProps {
  /** 열 개수 (기본: 5) */
  columns?: number;
  /** 행 개수 (기본: 5) */
  rows?: number;
}

/**
 * 테이블 행 형태의 스켈레톤
 *
 * 보유 코인 목록 등 테이블 형태 데이터의 로딩 상태를 표현한다.
 */
export function TableRowSkeleton({ columns = 5, rows = 5 }: TableRowSkeletonProps) {
  return (
    <div
      className="space-y-3"
      role="status"
      aria-label="테이블 데이터를 불러오는 중입니다"
    >
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={`skeleton-row-${rowIndex}`}
          className="flex items-center gap-4 rounded-lg border border-border bg-card p-4"
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={`skeleton-col-${rowIndex}-${colIndex}`}
              className={cn(
                'h-4',
                colIndex === 0 ? 'w-20' : 'w-16 flex-1',
              )}
            />
          ))}
        </div>
      ))}
      <span className="sr-only">테이블 데이터를 불러오는 중입니다</span>
    </div>
  );
}

// ============================================================
// ChartSkeleton - 차트 영역 스켈레톤
// ============================================================

/**
 * 차트 영역 스켈레톤
 *
 * 도넛 차트, 시계열 차트 등 차트 영역의 로딩 상태를 표현한다.
 */
export function ChartSkeleton() {
  return (
    <div
      className="rounded-xl border border-border bg-card p-6 flex flex-col items-center justify-center"
      role="status"
      aria-label="차트 데이터를 불러오는 중입니다"
    >
      <Skeleton className="h-48 w-48 rounded-full" />
      <div className="mt-4 flex gap-4">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16" />
      </div>
      <span className="sr-only">차트 데이터를 불러오는 중입니다</span>
    </div>
  );
}

// ============================================================
// DashboardSkeleton - 대시보드 전체 스켈레톤
// ============================================================

/**
 * 대시보드 전체 스켈레톤
 *
 * 대시보드 페이지의 전체 로딩 상태를 표현한다.
 * 요약 카드, 테이블, 차트 스켈레톤을 조합하여 구성한다.
 */
export function DashboardSkeleton() {
  return (
    <div
      className="space-y-6"
      role="status"
      aria-label="대시보드 데이터를 불러오는 중입니다"
    >
      {/* 요약 카드 영역 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>

      {/* 차트 및 테이블 영역 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TableRowSkeleton />
        </div>
        <ChartSkeleton />
      </div>

      <span className="sr-only">대시보드 데이터를 불러오는 중입니다</span>
    </div>
  );
}
