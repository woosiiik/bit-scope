/**
 * KimchiPremiumHistoryEntity 단위 테스트
 *
 * 엔티티 인스턴스 생성 및 기본 속성을 검증한다.
 */

import { KimchiPremiumHistoryEntity } from './kimchi-premium-history.entity';

describe('KimchiPremiumHistoryEntity', () => {
  it('인스턴스를 생성할 수 있어야 한다', () => {
    const entity = new KimchiPremiumHistoryEntity();
    expect(entity).toBeDefined();
    expect(entity).toBeInstanceOf(KimchiPremiumHistoryEntity);
  });

  it('모든 속성을 설정할 수 있어야 한다', () => {
    const entity = new KimchiPremiumHistoryEntity();
    entity.id = 'premium-uuid';
    entity.symbol = 'BTC';
    entity.upbitPrice = 100000000;
    entity.bithumbPrice = 100500000;
    entity.coinonePrice = 99800000;
    entity.premiumRate = 0.7;
    entity.recordedAt = new Date('2026-01-01T12:00:00Z');

    expect(entity.symbol).toBe('BTC');
    expect(entity.upbitPrice).toBe(100000000);
    expect(entity.bithumbPrice).toBe(100500000);
    expect(entity.coinonePrice).toBe(99800000);
    expect(entity.premiumRate).toBe(0.7);
  });

  it('프리미엄이 없는 경우(0%)도 저장할 수 있어야 한다', () => {
    const entity = new KimchiPremiumHistoryEntity();
    entity.symbol = 'ETH';
    entity.upbitPrice = 3000000;
    entity.bithumbPrice = 3000000;
    entity.coinonePrice = 3000000;
    entity.premiumRate = 0;

    expect(entity.premiumRate).toBe(0);
  });

  it('음수 프리미엄(역프)도 저장할 수 있어야 한다', () => {
    const entity = new KimchiPremiumHistoryEntity();
    entity.symbol = 'BTC';
    entity.premiumRate = -1.5;

    expect(entity.premiumRate).toBe(-1.5);
  });
});
