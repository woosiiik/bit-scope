/**
 * AlertHistoryEntity 단위 테스트
 *
 * 엔티티 인스턴스 생성 및 기본 속성을 검증한다.
 */

import { AlertHistoryEntity } from './alert-history.entity';

describe('AlertHistoryEntity', () => {
  it('인스턴스를 생성할 수 있어야 한다', () => {
    const entity = new AlertHistoryEntity();
    expect(entity).toBeDefined();
    expect(entity).toBeInstanceOf(AlertHistoryEntity);
  });

  it('모든 속성을 설정할 수 있어야 한다', () => {
    const entity = new AlertHistoryEntity();
    entity.id = 'history-uuid';
    entity.alertId = 'alert-uuid';
    entity.triggeredAt = new Date('2026-01-01T12:00:00Z');
    entity.triggeredValue = 105000000;
    entity.message = 'BTC 가격이 목표가(1억)를 초과하여 105,000,000 KRW에 도달했습니다.';

    expect(entity.id).toBe('history-uuid');
    expect(entity.alertId).toBe('alert-uuid');
    expect(entity.triggeredValue).toBe(105000000);
    expect(entity.message).toContain('BTC');
  });
});
