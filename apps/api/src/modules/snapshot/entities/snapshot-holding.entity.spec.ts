/**
 * SnapshotHoldingEntity 단위 테스트
 *
 * 엔티티 인스턴스 생성 및 기본 속성을 검증한다.
 */

import { SnapshotHoldingEntity } from './snapshot-holding.entity';

describe('SnapshotHoldingEntity', () => {
  it('인스턴스를 생성할 수 있어야 한다', () => {
    const entity = new SnapshotHoldingEntity();
    expect(entity).toBeDefined();
    expect(entity).toBeInstanceOf(SnapshotHoldingEntity);
  });

  it('모든 속성을 설정할 수 있어야 한다', () => {
    const entity = new SnapshotHoldingEntity();
    entity.id = 'holding-uuid';
    entity.snapshotId = 'snapshot-uuid';
    entity.symbol = 'ETH';
    entity.exchange = 'bithumb';
    entity.balance = 10.5;
    entity.avgBuyPrice = 2500000;
    entity.currentPrice = 3000000;
    entity.evaluation = 31500000;

    expect(entity.id).toBe('holding-uuid');
    expect(entity.snapshotId).toBe('snapshot-uuid');
    expect(entity.symbol).toBe('ETH');
    expect(entity.exchange).toBe('bithumb');
    expect(entity.balance).toBe(10.5);
    expect(entity.avgBuyPrice).toBe(2500000);
    expect(entity.currentPrice).toBe(3000000);
    expect(entity.evaluation).toBe(31500000);
  });

  it('유효한 거래소 값을 저장할 수 있어야 한다', () => {
    const exchanges = ['upbit', 'bithumb', 'coinone'];

    exchanges.forEach((exchange) => {
      const entity = new SnapshotHoldingEntity();
      entity.exchange = exchange;
      expect(entity.exchange).toBe(exchange);
    });
  });
});
