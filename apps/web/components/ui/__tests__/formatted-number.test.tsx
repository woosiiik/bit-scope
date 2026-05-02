/**
 * 숫자 포맷 컴포넌트 단위 테스트
 *
 * 통화 포맷, 수익률 포맷, 수익/손실 색상 구분,
 * ARIA 접근성 레이블 등을 검증한다.
 *
 * @see 요구사항 9.7 (숫자 데이터 포맷)
 * @see 요구사항 9.8 (수익 녹색/손실 빨간색 색상 구분)
 * @see 요구사항 NF4.2 (ARIA 레이블)
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  FormattedCurrency,
  FormattedPercent,
  FormattedPrice,
  FormattedQuantity,
  FormattedNumber,
  ProfitLossIndicator,
} from '../formatted-number';

describe('FormattedCurrency', () => {
  it('KRW 금액을 원화 포맷으로 표시한다', () => {
    render(<FormattedCurrency value={1234567} />);
    expect(screen.getByText('₩1,234,567')).toBeInTheDocument();
  });

  it('음수 금액에 마이너스 부호를 표시한다', () => {
    render(<FormattedCurrency value={-500000} />);
    expect(screen.getByText('-₩500,000')).toBeInTheDocument();
  });

  it('showSign 옵션으로 양수에 + 부호를 표시한다', () => {
    render(<FormattedCurrency value={100000} showSign />);
    expect(screen.getByText('+₩100,000')).toBeInTheDocument();
  });

  it('USD 통화를 달러 포맷으로 표시한다', () => {
    render(<FormattedCurrency value={1234.56} currency="USD" />);
    expect(screen.getByText('$1,234.56')).toBeInTheDocument();
  });

  it('compact 옵션으로 큰 금액을 축약한다', () => {
    render(<FormattedCurrency value={123456789} compact />);
    expect(screen.getByText('1.23억')).toBeInTheDocument();
  });

  it('colorize 옵션으로 양수 값에 수익 색상을 적용한다', () => {
    const { container } = render(<FormattedCurrency value={100000} colorize />);
    const span = container.querySelector('span');
    expect(span).toHaveClass('text-profit');
  });

  it('colorize 옵션으로 음수 값에 손실 색상을 적용한다', () => {
    const { container } = render(<FormattedCurrency value={-100000} colorize />);
    const span = container.querySelector('span');
    expect(span).toHaveClass('text-loss');
  });

  it('colorize 옵션으로 0 값에 muted 색상을 적용한다', () => {
    const { container } = render(<FormattedCurrency value={0} colorize />);
    const span = container.querySelector('span');
    expect(span).toHaveClass('text-muted-foreground');
  });

  it('colorize 시 ARIA 라벨을 제공한다', () => {
    render(<FormattedCurrency value={100000} colorize />);
    expect(screen.getByLabelText('금액 수익 100000')).toBeInTheDocument();
  });
});

describe('FormattedPercent', () => {
  it('양수 수익률에 + 부호를 표시한다', () => {
    render(<FormattedPercent value={12.345} />);
    expect(screen.getByText('+12.35%')).toBeInTheDocument();
  });

  it('음수 수익률에 - 부호를 표시한다', () => {
    render(<FormattedPercent value={-5.678} />);
    expect(screen.getByText('-5.68%')).toBeInTheDocument();
  });

  it('0 수익률을 표시한다', () => {
    render(<FormattedPercent value={0} />);
    expect(screen.getByText('0.00%')).toBeInTheDocument();
  });

  it('소수점 자릿수를 지정할 수 있다', () => {
    render(<FormattedPercent value={12.3456} decimalPlaces={3} />);
    expect(screen.getByText('+12.346%')).toBeInTheDocument();
  });

  it('colorize 옵션으로 양수에 수익 색상을 적용한다', () => {
    const { container } = render(<FormattedPercent value={5.5} colorize />);
    const span = container.querySelector('span');
    expect(span).toHaveClass('text-profit');
  });

  it('colorize 옵션으로 음수에 손실 색상을 적용한다', () => {
    const { container } = render(<FormattedPercent value={-3.2} colorize />);
    const span = container.querySelector('span');
    expect(span).toHaveClass('text-loss');
  });
});

describe('FormattedPrice', () => {
  it('코인 가격을 포맷하여 표시한다', () => {
    render(<FormattedPrice value={98765432} symbol="BTC" />);
    expect(screen.getByText('98,765,432')).toBeInTheDocument();
  });

  it('심볼 없이도 기본 소수점으로 표시한다', () => {
    render(<FormattedPrice value={1234.5} />);
    // 기본 소수점 (DEFAULT_DECIMAL_PLACES)에 따라 표시
    expect(screen.getByText('1,234.50')).toBeInTheDocument();
  });
});

describe('FormattedQuantity', () => {
  it('소수점이 있는 수량을 표시한다', () => {
    render(<FormattedQuantity value={1.23456789} />);
    expect(screen.getByText('1.23456789')).toBeInTheDocument();
  });

  it('정수 수량은 소수점 없이 표시한다', () => {
    render(<FormattedQuantity value={100} />);
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('0을 표시한다', () => {
    render(<FormattedQuantity value={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});

describe('FormattedNumber', () => {
  it('천 단위 구분을 적용한다', () => {
    render(<FormattedNumber value={1234567} />);
    expect(screen.getByText('1,234,567')).toBeInTheDocument();
  });

  it('소수점 자릿수를 지정할 수 있다', () => {
    render(<FormattedNumber value={1234.5678} decimalPlaces={2} />);
    expect(screen.getByText('1,234.57')).toBeInTheDocument();
  });

  it('colorize 옵션으로 색상을 적용한다', () => {
    const { container } = render(<FormattedNumber value={-100} colorize />);
    const span = container.querySelector('span');
    expect(span).toHaveClass('text-loss');
  });
});

describe('ProfitLossIndicator', () => {
  it('수익 금액과 수익률을 함께 표시한다', () => {
    render(<ProfitLossIndicator amount={150000} rate={12.5} />);
    expect(screen.getByText('+₩150,000')).toBeInTheDocument();
    expect(screen.getByText('(+12.50%)')).toBeInTheDocument();
  });

  it('손실 금액과 손실률을 함께 표시한다', () => {
    render(<ProfitLossIndicator amount={-50000} rate={-3.2} />);
    expect(screen.getByText('-₩50,000')).toBeInTheDocument();
    expect(screen.getByText('(-3.20%)')).toBeInTheDocument();
  });

  it('수익 시 수익 색상을 적용한다', () => {
    const { container } = render(<ProfitLossIndicator amount={100000} rate={10} />);
    const span = container.querySelector('span');
    expect(span).toHaveClass('text-profit');
  });

  it('손실 시 손실 색상을 적용한다', () => {
    const { container } = render(<ProfitLossIndicator amount={-100000} rate={-10} />);
    const span = container.querySelector('span');
    expect(span).toHaveClass('text-loss');
  });

  it('스크린 리더용 ARIA 라벨을 제공한다', () => {
    render(<ProfitLossIndicator amount={150000} rate={12.5} />);
    expect(screen.getByLabelText('수익 150000원, 수익률 12.5퍼센트')).toBeInTheDocument();
  });

  it('손실 시 스크린 리더용 ARIA 라벨을 제공한다', () => {
    render(<ProfitLossIndicator amount={-50000} rate={-3.2} />);
    expect(screen.getByLabelText('손실 50000원, 손실률 3.2퍼센트')).toBeInTheDocument();
  });

  it('변동 없을 시 ARIA 라벨을 제공한다', () => {
    render(<ProfitLossIndicator amount={0} rate={0} />);
    expect(screen.getByLabelText('변동 없음')).toBeInTheDocument();
  });
});
