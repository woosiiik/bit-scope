/**
 * ReportScheduleEntity 단위 테스트
 *
 * 엔티티 인스턴스 생성 및 기본 속성을 검증한다.
 */

import { ReportScheduleEntity } from './report-schedule.entity';

describe('ReportScheduleEntity', () => {
  it('인스턴스를 생성할 수 있어야 한다', () => {
    const entity = new ReportScheduleEntity();
    expect(entity).toBeDefined();
    expect(entity).toBeInstanceOf(ReportScheduleEntity);
  });

  it('일간 리포트 스케줄을 설정할 수 있어야 한다', () => {
    const entity = new ReportScheduleEntity();
    entity.id = 'schedule-uuid';
    entity.walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
    entity.type = 'daily';
    entity.isActive = true;
    entity.nextRunAt = new Date('2026-01-02T09:00:00Z');
    entity.cronExpression = '0 9 * * *';

    expect(entity.type).toBe('daily');
    expect(entity.cronExpression).toBe('0 9 * * *');
    expect(entity.isActive).toBe(true);
  });

  it('주간 리포트 스케줄을 설정할 수 있어야 한다', () => {
    const entity = new ReportScheduleEntity();
    entity.type = 'weekly';
    entity.cronExpression = '0 9 * * 1';

    expect(entity.type).toBe('weekly');
    expect(entity.cronExpression).toBe('0 9 * * 1');
  });

  it('월간 리포트 스케줄을 설정할 수 있어야 한다', () => {
    const entity = new ReportScheduleEntity();
    entity.type = 'monthly';
    entity.cronExpression = '0 9 1 * *';

    expect(entity.type).toBe('monthly');
    expect(entity.cronExpression).toBe('0 9 1 * *');
  });

  it('스케줄 비활성화를 설정할 수 있어야 한다', () => {
    const entity = new ReportScheduleEntity();
    entity.isActive = false;

    expect(entity.isActive).toBe(false);
  });
});
