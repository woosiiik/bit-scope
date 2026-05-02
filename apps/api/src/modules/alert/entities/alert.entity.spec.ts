/**
 * AlertEntity 단위 테스트
 *
 * 엔티티 인스턴스 생성 및 기본 속성을 검증한다.
 */

import { AlertEntity } from './alert.entity';
import { AlertHistoryEntity } from './alert-history.entity';

describe('AlertEntity', () => {
  it('인스턴스를 생성할 수 있어야 한다', () => {
    const entity = new AlertEntity();
    expect(entity).toBeDefined();
    expect(entity).toBeInstanceOf(AlertEntity);
  });

  it('가격 알림 설정을 저장할 수 있어야 한다', () => {
    const entity = new AlertEntity();
    entity.id = 'alert-uuid';
    entity.walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
    entity.symbol = 'BTC';
    entity.exchange = 'upbit';
    entity.condition = 'above';
    entity.targetValue = 100000000;
    entity.isActive = true;

    expect(entity.symbol).toBe('BTC');
    expect(entity.condition).toBe('above');
    expect(entity.targetValue).toBe(100000000);
    expect(entity.isActive).toBe(true);
  });

  it('모든 거래소 대상 알림 설정(exchange=null)을 저장할 수 있어야 한다', () => {
    const entity = new AlertEntity();
    entity.symbol = 'ETH';
    entity.exchange = null;
    entity.condition = 'below';
    entity.targetValue = 2000000;

    expect(entity.exchange).toBeNull();
  });

  it('김프 알림 조건을 저장할 수 있어야 한다', () => {
    const conditions = ['above', 'below', 'premium_above', 'premium_below'];

    conditions.forEach((condition) => {
      const entity = new AlertEntity();
      entity.condition = condition;
      expect(entity.condition).toBe(condition);
    });
  });

  it('알림 이력 관계를 포함할 수 있어야 한다', () => {
    const entity = new AlertEntity();
    const history = new AlertHistoryEntity();
    history.triggeredValue = 105000000;
    history.message = 'BTC 가격이 1억을 초과했습니다.';

    entity.histories = [history];

    expect(entity.histories).toHaveLength(1);
    expect(entity.histories[0]!.message).toBe('BTC 가격이 1억을 초과했습니다.');
  });
});
