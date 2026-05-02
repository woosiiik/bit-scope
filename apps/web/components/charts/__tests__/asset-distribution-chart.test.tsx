/**
 * 자산 분포 차트 컴포넌트 단위 테스트
 *
 * 코인별/거래소별 도넛 차트의 렌더링, 빈 상태 처리,
 * 데이터 변환, 범례 표시를 검증한다.
 *
 * @see 요구사항 2.7 (자산 분포를 도넛/파이 차트로 시각화)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AssetDistribution } from '@bitscope/shared';
import {
  AssetDistributionCharts,
  DonutChart,
  ChartLegend,
  ChartTooltip,
  COIN_COLORS,
  EXCHANGE_COLORS,
} from '../asset-distribution-chart';
import type { ChartDataItem } from '../asset-distribution-chart';

// Recharts의 ResponsiveContainer는 테스트 환경에서 크기를 0으로 잡는다.
// 이를 방지하기 위해 모킹한다.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 180, height: 180 }}>{children}</div>
    ),
  };
});

// i18n context 모킹
vi.mock('@/lib/i18n/i18n-context', () => ({
  useTranslation: () => ({
    t: {
      portfolio: {
        coinDistribution: '코인별 비중',
        exchangeDistribution: '거래소별 비중',
      },
    },
  }),
}));

// ===== 테스트 데이터 =====

const mockDistribution: AssetDistribution = {
  byCoin: [
    { symbol: 'BTC', amount: 50_000_000, ratio: 50 },
    { symbol: 'ETH', amount: 30_000_000, ratio: 30 },
    { symbol: 'XRP', amount: 20_000_000, ratio: 20 },
  ],
  byExchange: [
    { exchange: 'upbit', amount: 60_000_000, ratio: 60 },
    { exchange: 'bithumb', amount: 30_000_000, ratio: 30 },
    { exchange: 'coinone', amount: 10_000_000, ratio: 10 },
  ],
};

const emptyDistribution: AssetDistribution = {
  byCoin: [],
  byExchange: [],
};

const singleCoinDistribution: AssetDistribution = {
  byCoin: [{ symbol: 'BTC', amount: 100_000_000, ratio: 100 }],
  byExchange: [{ exchange: 'upbit', amount: 100_000_000, ratio: 100 }],
};

// ===== AssetDistributionCharts 테스트 =====

describe('AssetDistributionCharts', () => {
  it('코인별 비중과 거래소별 비중 차트를 모두 렌더링한다', () => {
    render(<AssetDistributionCharts distribution={mockDistribution} />);

    // 두 카드 제목이 모두 보인다
    expect(screen.getByText('코인별 비중')).toBeInTheDocument();
    expect(screen.getByText('거래소별 비중')).toBeInTheDocument();
  });

  it('분포 데이터가 비어 있으면 아무것도 렌더링하지 않는다', () => {
    const { container } = render(
      <AssetDistributionCharts distribution={emptyDistribution} />,
    );

    // 빈 컨테이너만 존재한다
    expect(container.firstChild).toBeNull();
  });

  it('className 속성이 올바르게 전달된다', () => {
    const { container } = render(
      <AssetDistributionCharts
        distribution={mockDistribution}
        className="mt-4"
      />,
    );

    const grid = container.firstChild as HTMLElement;
    expect(grid).toHaveClass('mt-4');
  });

  it('단일 코인만 있을 때도 정상적으로 렌더링한다', () => {
    render(<AssetDistributionCharts distribution={singleCoinDistribution} />);

    expect(screen.getByText('코인별 비중')).toBeInTheDocument();
    expect(screen.getByText('거래소별 비중')).toBeInTheDocument();
  });

  it('코인별 범례에 코인 심볼과 비율이 표시된다', () => {
    render(<AssetDistributionCharts distribution={mockDistribution} />);

    expect(screen.getByText('BTC')).toBeInTheDocument();
    expect(screen.getByText('ETH')).toBeInTheDocument();
    expect(screen.getByText('XRP')).toBeInTheDocument();
  });

  it('거래소별 범례에 거래소 한글명이 표시된다', () => {
    render(<AssetDistributionCharts distribution={mockDistribution} />);

    expect(screen.getByText('업비트')).toBeInTheDocument();
    expect(screen.getByText('빗썸')).toBeInTheDocument();
    expect(screen.getByText('코인원')).toBeInTheDocument();
  });
});

// ===== DonutChart 테스트 =====

describe('DonutChart', () => {
  const sampleData: ChartDataItem[] = [
    { name: 'BTC', value: 50_000_000, ratio: 50, color: COIN_COLORS[0]! },
    { name: 'ETH', value: 30_000_000, ratio: 30, color: COIN_COLORS[1]! },
  ];

  it('제목을 올바르게 표시한다', () => {
    render(
      <DonutChart title="테스트 차트" data={sampleData} ariaLabel="테스트" />,
    );

    expect(screen.getByText('테스트 차트')).toBeInTheDocument();
  });

  it('데이터가 비어 있으면 빈 상태 메시지를 표시한다', () => {
    render(
      <DonutChart title="빈 차트" data={[]} ariaLabel="빈 차트" />,
    );

    expect(screen.getByText('데이터가 없습니다')).toBeInTheDocument();
  });

  it('접근성 레이블이 올바르게 적용된다', () => {
    render(
      <DonutChart
        title="접근성 테스트"
        data={sampleData}
        ariaLabel="코인별 자산 분포"
      />,
    );

    expect(screen.getByRole('img', { name: '코인별 자산 분포' })).toBeInTheDocument();
  });

  it('범례에 데이터 항목이 표시된다', () => {
    render(
      <DonutChart title="범례 테스트" data={sampleData} ariaLabel="테스트" />,
    );

    expect(screen.getByText('BTC')).toBeInTheDocument();
    expect(screen.getByText('ETH')).toBeInTheDocument();
  });
});

// ===== ChartLegend 테스트 =====

describe('ChartLegend', () => {
  const legendData: ChartDataItem[] = [
    { name: 'BTC', value: 50_000_000, ratio: 40, color: '#ff0000' },
    { name: 'ETH', value: 30_000_000, ratio: 25, color: '#00ff00' },
    { name: 'XRP', value: 10_000_000, ratio: 10, color: '#0000ff' },
    { name: 'ADA', value: 8_000_000, ratio: 8, color: '#ffff00' },
    { name: 'SOL', value: 7_000_000, ratio: 7, color: '#ff00ff' },
    { name: 'DOT', value: 5_000_000, ratio: 5, color: '#00ffff' },
    { name: 'DOGE', value: 5_000_000, ratio: 5, color: '#aaaaaa' },
  ];

  it('모든 항목 수가 maxItems 이하이면 전체를 표시한다', () => {
    const shortData = legendData.slice(0, 3);
    render(<ChartLegend data={shortData} maxItems={5} />);

    expect(screen.getByText('BTC')).toBeInTheDocument();
    expect(screen.getByText('ETH')).toBeInTheDocument();
    expect(screen.getByText('XRP')).toBeInTheDocument();
    expect(screen.queryByText('기타')).not.toBeInTheDocument();
  });

  it('항목 수가 maxItems를 초과하면 기타 항목을 표시한다', () => {
    render(<ChartLegend data={legendData} maxItems={5} />);

    // 상위 5개는 표시된다
    expect(screen.getByText('BTC')).toBeInTheDocument();
    expect(screen.getByText('ETH')).toBeInTheDocument();
    expect(screen.getByText('XRP')).toBeInTheDocument();
    expect(screen.getByText('ADA')).toBeInTheDocument();
    expect(screen.getByText('SOL')).toBeInTheDocument();

    // maxItems를 초과한 항목은 표시되지 않는다
    expect(screen.queryByText('DOT')).not.toBeInTheDocument();
    expect(screen.queryByText('DOGE')).not.toBeInTheDocument();

    // 기타 항목이 표시된다
    expect(screen.getByText('기타')).toBeInTheDocument();
  });

  it('비율이 올바르게 포맷되어 표시된다', () => {
    const shortData: ChartDataItem[] = [
      { name: 'BTC', value: 100, ratio: 75.5, color: '#ff0000' },
    ];
    render(<ChartLegend data={shortData} />);

    // formatPercent(75.5, { showSign: false }) => "75.50%"
    expect(screen.getByText('75.50%')).toBeInTheDocument();
  });

  it('범례 목록에 aria-label이 적용된다', () => {
    render(<ChartLegend data={legendData.slice(0, 2)} />);
    expect(screen.getByRole('list', { name: '차트 범례' })).toBeInTheDocument();
  });
});

// ===== ChartTooltip 테스트 =====

describe('ChartTooltip', () => {
  it('active 상태이고 payload가 있으면 내용을 표시한다', () => {
    const payload = [
      {
        name: 'BTC',
        value: 50_000_000,
        payload: {
          name: 'BTC',
          value: 50_000_000,
          ratio: 50,
          color: '#ff0000',
        },
      },
    ];

    render(<ChartTooltip active={true} payload={payload} />);

    expect(screen.getByText('BTC')).toBeInTheDocument();
    // formatPercent(50, { showSign: false }) => "50.00%"
    expect(screen.getByText('50.00%')).toBeInTheDocument();
  });

  it('active가 false이면 아무것도 렌더링하지 않는다', () => {
    const { container } = render(
      <ChartTooltip active={false} payload={[]} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('payload가 비어 있으면 아무것도 렌더링하지 않는다', () => {
    const { container } = render(
      <ChartTooltip active={true} payload={[]} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('tooltip에 role="tooltip" 속성이 있다', () => {
    const payload = [
      {
        name: 'BTC',
        value: 50_000_000,
        payload: {
          name: 'BTC',
          value: 50_000_000,
          ratio: 50,
          color: '#ff0000',
        },
      },
    ];

    render(<ChartTooltip active={true} payload={payload} />);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });
});

// ===== 색상 상수 테스트 =====

describe('차트 색상 상수', () => {
  it('COIN_COLORS에 충분한 색상이 정의되어 있다', () => {
    expect(COIN_COLORS.length).toBeGreaterThanOrEqual(8);
  });

  it('EXCHANGE_COLORS에 모든 거래소 색상이 정의되어 있다', () => {
    expect(EXCHANGE_COLORS.upbit).toBeDefined();
    expect(EXCHANGE_COLORS.bithumb).toBeDefined();
    expect(EXCHANGE_COLORS.coinone).toBeDefined();
  });

  it('모든 COIN_COLORS가 유효한 HSL 형식이다', () => {
    for (const color of COIN_COLORS) {
      expect(color).toMatch(/^hsl\(\d+\.?\d*,\s*\d+\.?\d*%,\s*\d+\.?\d*%\)$/);
    }
  });

  it('모든 EXCHANGE_COLORS가 유효한 HSL 형식이다', () => {
    for (const color of Object.values(EXCHANGE_COLORS)) {
      expect(color).toMatch(/^hsl\(\d+\.?\d*,\s*\d+\.?\d*%,\s*\d+\.?\d*%\)$/);
    }
  });
});
