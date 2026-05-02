/**
 * PortfolioSnapshotEntity 단위 테스트
 *
 * 엔티티 인스턴스 생성 및 기본 속성을 검증한다.
 */

import { PortfolioSnapshotEntity } from './portfolio-snapshot.entity';
import { SnapshotHoldingEntity } from './snapshot-holding.entity';

describe('PortfolioSnapshotEntity', () => {
  it('인스턴스를 생성할 수 있어야 한다', () => {
    const entity = new PortfolioSnapshotEntity();
    expect(entity).toBeDefined();
    expect(entity).toBeInstanceOf(PortfolioSnapshotEntity);
  });

  it('모든 속성을 설정할 수 있어야 한다', () => {
    const entity = new PortfolioSnapshotEntity();
    entity.id = 'test-uuid';
    entity.walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
    entity.createdAt = new Date('2026-01-01T00:00:00Z');
    entity.totalEvaluation = 10000000;
    entity.totalInvestment = 8000000;
    entity.totalProfitLoss = 2000000;
    entity.profitLossRate = 25.0;
    entity.holdings = [];

    expect(entity.id).toBe('test-uuid');
    expect(entity.walletAddress).toBe('0x1234567890abcdef1234567890abcdef12345678');
    expect(entity.totalEvaluation).toBe(10000000);
    expect(entity.totalInvestment).toBe(8000000);
    expect(entity.totalProfitLoss).toBe(2000000);
    expect(entity.profitLossRate).toBe(25.0);
    expect(entity.holdings).toEqual([]);
  });

  it('holdings 관계를 포함할 수 있어야 한다', () => {
    const entity = new PortfolioSnapshotEntity();
    const holding = new SnapshotHoldingEntity();
    holding.symbol = 'BTC';
    holding.exchange = 'upbit';
    holding.balance = 0.5;
    holding.avgBuyPrice = 50000000;
    holding.currentPrice = 55000000;
    holding.evaluation = 27500000;

    entity.holdings = [holding];

    expect(entity.holdings).toHaveLength(1);
    expect(entity.holdings[0]!.symbol).toBe('BTC');
    expect(entity.holdings[0]!.exchange).toBe('upbit');
  });
});
