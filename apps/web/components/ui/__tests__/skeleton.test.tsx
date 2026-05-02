/**
 * Skeleton UI 컴포넌트 단위 테스트
 *
 * 스켈레톤의 렌더링, 접근성 속성을 검증한다.
 *
 * @see 요구사항 9.5 (스켈레톤 UI)
 * @see 요구사항 NF4.1 (WCAG 2.1 AA 접근성)
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Skeleton,
  CardSkeleton,
  TableRowSkeleton,
  ChartSkeleton,
  DashboardSkeleton,
} from '../skeleton';

describe('Skeleton', () => {
  it('스켈레톤 블록을 렌더링한다', () => {
    const { container } = render(<Skeleton className="h-4 w-48" />);
    const skeleton = container.querySelector('div');
    expect(skeleton).toBeInTheDocument();
    expect(skeleton).toHaveClass('animate-pulse');
  });

  it('aria-hidden="true"를 설정한다', () => {
    const { container } = render(<Skeleton />);
    const skeleton = container.querySelector('div');
    expect(skeleton).toHaveAttribute('aria-hidden', 'true');
  });

  it('추가 className을 적용한다', () => {
    const { container } = render(<Skeleton className="h-10 w-10 rounded-full" />);
    const skeleton = container.querySelector('div');
    expect(skeleton).toHaveClass('rounded-full');
  });
});

describe('CardSkeleton', () => {
  it('카드 스켈레톤을 렌더링한다', () => {
    render(<CardSkeleton />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
  });

  it('접근성 레이블을 제공한다', () => {
    render(<CardSkeleton />);
    expect(screen.getByLabelText('데이터를 불러오는 중입니다')).toBeInTheDocument();
  });

  it('스크린 리더용 텍스트를 제공한다', () => {
    render(<CardSkeleton />);
    expect(screen.getByText('데이터를 불러오는 중입니다')).toBeInTheDocument();
  });
});

describe('TableRowSkeleton', () => {
  it('기본 5행의 테이블 스켈레톤을 렌더링한다', () => {
    const { container } = render(<TableRowSkeleton />);
    // 각 행에 border 클래스가 적용된 div
    const rows = container.querySelectorAll('.border.border-border');
    expect(rows).toHaveLength(5);
  });

  it('지정된 행 수로 렌더링한다', () => {
    const { container } = render(<TableRowSkeleton rows={3} />);
    const rows = container.querySelectorAll('.border.border-border');
    expect(rows).toHaveLength(3);
  });

  it('접근성 레이블을 제공한다', () => {
    render(<TableRowSkeleton />);
    expect(screen.getByLabelText('테이블 데이터를 불러오는 중입니다')).toBeInTheDocument();
  });
});

describe('ChartSkeleton', () => {
  it('차트 스켈레톤을 렌더링한다', () => {
    render(<ChartSkeleton />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
  });

  it('접근성 레이블을 제공한다', () => {
    render(<ChartSkeleton />);
    expect(screen.getByLabelText('차트 데이터를 불러오는 중입니다')).toBeInTheDocument();
  });
});

describe('DashboardSkeleton', () => {
  it('대시보드 전체 스켈레톤을 렌더링한다', () => {
    render(<DashboardSkeleton />);
    const status = screen.getByRole('status', { name: '대시보드 데이터를 불러오는 중입니다' });
    expect(status).toBeInTheDocument();
  });

  it('카드, 테이블, 차트 스켈레톤을 모두 포함한다', () => {
    render(<DashboardSkeleton />);
    // DashboardSkeleton 내에 여러 role="status" 영역이 있음
    const statuses = screen.getAllByRole('status');
    expect(statuses.length).toBeGreaterThanOrEqual(3);
  });
});
