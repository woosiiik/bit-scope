/**
 * ReportEntity 단위 테스트
 *
 * 엔티티 인스턴스 생성 및 기본 속성을 검증한다.
 */

import { ReportEntity } from './report.entity';

describe('ReportEntity', () => {
  it('인스턴스를 생성할 수 있어야 한다', () => {
    const entity = new ReportEntity();
    expect(entity).toBeDefined();
    expect(entity).toBeInstanceOf(ReportEntity);
  });

  it('모든 속성을 설정할 수 있어야 한다', () => {
    const entity = new ReportEntity();
    entity.id = 'report-uuid';
    entity.walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
    entity.type = 'weekly';
    entity.generatedAt = new Date('2026-01-07T09:00:00Z');
    entity.periodStart = new Date('2026-01-01T00:00:00Z');
    entity.periodEnd = new Date('2026-01-07T00:00:00Z');
    entity.summary = {
      totalEvaluation: 10000000,
      evaluationChange: 500000,
      evaluationChangeRate: 5.26,
      topGainers: [{ symbol: 'ETH', rate: 12.5 }],
      topLosers: [{ symbol: 'XRP', rate: -3.2 }],
      newCoins: ['SOL'],
      removedCoins: [],
    };
    entity.data = {
      walletAddress: '0x1234',
      totalEvaluation: 10000000,
      holdings: [],
    };

    expect(entity.type).toBe('weekly');
    expect(entity.summary).toBeDefined();
    expect((entity.summary as Record<string, unknown>).totalEvaluation).toBe(10000000);
    expect(entity.data).toBeDefined();
  });

  it('유효한 리포트 유형을 저장할 수 있어야 한다', () => {
    const types = ['daily', 'weekly', 'monthly', 'custom'];

    types.forEach((type) => {
      const entity = new ReportEntity();
      entity.type = type;
      expect(entity.type).toBe(type);
    });
  });
});
