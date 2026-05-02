/**
 * LoadingSpinner 컴포넌트 단위 테스트
 *
 * 로딩 스피너의 렌더링, 크기, 메시지, 접근성 속성을 검증한다.
 *
 * @see 요구사항 9.5 (로딩 인디케이터)
 * @see 요구사항 NF4.1 (WCAG 2.1 AA 접근성)
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner, FullPageLoader } from '../loading-spinner';

describe('LoadingSpinner', () => {
  it('로딩 스피너를 렌더링한다', () => {
    render(<LoadingSpinner />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
  });

  it('기본 접근성 레이블을 제공한다', () => {
    render(<LoadingSpinner />);
    expect(screen.getByLabelText('로딩 중')).toBeInTheDocument();
  });

  it('커스텀 메시지를 표시한다', () => {
    render(<LoadingSpinner message="자산 정보를 불러오는 중..." />);
    // 가시적 텍스트와 sr-only 텍스트 두 곳에 표시됨
    const elements = screen.getAllByText('자산 정보를 불러오는 중...');
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it('커스텀 메시지를 접근성 레이블로 사용한다', () => {
    render(<LoadingSpinner message="데이터 조회 중" />);
    expect(screen.getByLabelText('데이터 조회 중')).toBeInTheDocument();
  });

  it('스크린 리더용 숨겨진 텍스트를 제공한다', () => {
    render(<LoadingSpinner />);
    const srOnly = screen.getByText('로딩 중');
    expect(srOnly).toHaveClass('sr-only');
  });
});

describe('FullPageLoader', () => {
  it('전체 화면 로더를 렌더링한다', () => {
    render(<FullPageLoader />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
  });

  it('기본 메시지를 표시한다', () => {
    render(<FullPageLoader />);
    // 가시적 <p> 텍스트와 sr-only <span> 텍스트가 모두 존재함
    const elements = screen.getAllByText('로딩 중...');
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it('커스텀 메시지를 표시한다', () => {
    render(<FullPageLoader message="페이지를 준비하는 중입니다" />);
    const elements = screen.getAllByText('페이지를 준비하는 중입니다');
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it('접근성 레이블을 제공한다', () => {
    render(<FullPageLoader message="로딩 중..." />);
    expect(screen.getByLabelText('로딩 중...')).toBeInTheDocument();
  });
});
