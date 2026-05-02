/**
 * ErrorDisplay 컴포넌트 단위 테스트
 *
 * 오류 표시 컴포넌트의 렌더링, 오류 유형별 메시지,
 * 재시도 기능, 접근성 속성을 검증한다.
 *
 * @see 요구사항 9.6 (사용자 친화적 오류 메시지 + 재시도 옵션)
 * @see 요구사항 NF4.1 (WCAG 2.1 AA 접근성)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorDisplay, ExchangeErrorBadge } from '../error-display';

describe('ErrorDisplay', () => {
  it('기본 오류 메시지를 표시한다', () => {
    render(<ErrorDisplay />);
    expect(screen.getByText('오류가 발생했습니다')).toBeInTheDocument();
    expect(screen.getByText(/일시적인 오류가 발생했습니다/)).toBeInTheDocument();
  });

  it('커스텀 제목과 메시지를 표시한다', () => {
    render(
      <ErrorDisplay
        title="업비트 연결 실패"
        message="업비트 서버에 연결할 수 없습니다."
      />,
    );
    expect(screen.getByText('업비트 연결 실패')).toBeInTheDocument();
    expect(screen.getByText('업비트 서버에 연결할 수 없습니다.')).toBeInTheDocument();
  });

  it('network 오류 유형의 기본 메시지를 표시한다', () => {
    render(<ErrorDisplay type="network" />);
    expect(screen.getByText('네트워크 오류')).toBeInTheDocument();
    expect(screen.getByText(/인터넷 연결을 확인해주세요/)).toBeInTheDocument();
  });

  it('timeout 오류 유형의 기본 메시지를 표시한다', () => {
    render(<ErrorDisplay type="timeout" />);
    expect(screen.getByText('응답 시간 초과')).toBeInTheDocument();
    expect(screen.getByText(/거래소 서버 응답이 지연/)).toBeInTheDocument();
  });

  it('auth 오류 유형의 기본 메시지를 표시한다', () => {
    render(<ErrorDisplay type="auth" />);
    expect(screen.getByText('인증 오류')).toBeInTheDocument();
    expect(screen.getByText(/API 키가 유효하지 않거나/)).toBeInTheDocument();
  });

  it('rate_limit 오류 유형의 기본 메시지를 표시한다', () => {
    render(<ErrorDisplay type="rate_limit" />);
    expect(screen.getByText('요청 제한 초과')).toBeInTheDocument();
  });

  it('exchange_maintenance 오류 유형의 기본 메시지를 표시한다', () => {
    render(<ErrorDisplay type="exchange_maintenance" />);
    expect(screen.getByText('거래소 점검 중')).toBeInTheDocument();
  });

  it('role="alert"를 설정한다', () => {
    render(<ErrorDisplay />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('aria-live="polite"를 설정한다', () => {
    render(<ErrorDisplay />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'polite');
  });

  describe('재시도 버튼', () => {
    it('onRetry가 있으면 재시도 버튼을 표시한다', () => {
      render(<ErrorDisplay onRetry={() => {}} />);
      expect(screen.getByRole('button', { name: '다시 시도하기' })).toBeInTheDocument();
    });

    it('onRetry가 없으면 재시도 버튼을 표시하지 않는다', () => {
      render(<ErrorDisplay />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('재시도 버튼 클릭 시 onRetry를 호출한다', () => {
      const onRetry = vi.fn();
      render(<ErrorDisplay onRetry={onRetry} />);
      fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
      expect(onRetry).toHaveBeenCalledOnce();
    });

    it('isRetrying이 true이면 재시도 버튼을 비활성화한다', () => {
      render(<ErrorDisplay onRetry={() => {}} isRetrying />);
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('isRetrying이 true이면 "재시도 중..." 텍스트를 표시한다', () => {
      render(<ErrorDisplay onRetry={() => {}} isRetrying />);
      expect(screen.getByText('재시도 중...')).toBeInTheDocument();
    });
  });

  describe('인라인 모드', () => {
    it('인라인 레이아웃으로 렌더링한다', () => {
      render(<ErrorDisplay inline onRetry={() => {}} />);
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
    });

    it('인라인에서 재시도 버튼을 표시한다', () => {
      render(<ErrorDisplay inline onRetry={() => {}} />);
      expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
    });

    it('인라인에서 재시도 클릭 시 onRetry를 호출한다', () => {
      const onRetry = vi.fn();
      render(<ErrorDisplay inline onRetry={onRetry} />);
      fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
      expect(onRetry).toHaveBeenCalledOnce();
    });
  });
});

describe('ExchangeErrorBadge', () => {
  it('거래소 이름을 표시한다', () => {
    render(<ExchangeErrorBadge exchangeName="업비트" />);
    expect(screen.getByText('업비트')).toBeInTheDocument();
  });

  it('마지막 업데이트 시각을 표시한다', () => {
    const date = new Date('2025-01-15T14:30:00');
    render(<ExchangeErrorBadge exchangeName="업비트" lastUpdated={date} />);
    // 시간 형식은 locale에 따라 다를 수 있으므로 "마지막 업데이트:" 텍스트 존재 확인
    expect(screen.getByText(/마지막 업데이트:/)).toBeInTheDocument();
  });

  it('lastUpdated가 없으면 "알 수 없음"을 표시한다', () => {
    render(<ExchangeErrorBadge exchangeName="빗썸" />);
    expect(screen.getByText(/알 수 없음/)).toBeInTheDocument();
  });

  it('role="status"를 설정한다', () => {
    render(<ExchangeErrorBadge exchangeName="코인원" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('접근성 레이블에 거래소명을 포함한다', () => {
    render(<ExchangeErrorBadge exchangeName="업비트" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute(
      'aria-label',
      expect.stringContaining('업비트'),
    );
  });
});
