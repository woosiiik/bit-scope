/**
 * 알림 발생 이력 엔티티
 *
 * 알림 조건이 충족되어 발생한 알림의 이력을 기록한다.
 * AlertEntity와 다대일 관계를 갖는다.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

import { AlertEntity } from './alert.entity';

@Entity('alert_history')
@Index('idx_alert_history_alert', ['alertId'])
@Index('idx_alert_history_triggered', ['triggeredAt'])
export class AlertHistoryEntity {
  /** 이력 고유 ID (UUID) */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** 알림 ID (FK) */
  @Column({ name: 'alert_id', type: 'varchar', length: 36 })
  alertId!: string;

  /** 알림 발생 시각 */
  @CreateDateColumn({ name: 'triggered_at', type: 'timestamp' })
  triggeredAt!: Date;

  /** 알림 발생 시점의 값 (가격 또는 프리미엄 비율) */
  @Column({ name: 'triggered_value', type: 'decimal', precision: 20, scale: 4 })
  triggeredValue!: number;

  /** 알림 메시지 */
  @Column({ type: 'varchar', length: 500 })
  message!: string;

  /** 소속 알림 설정 */
  @ManyToOne(
    () => AlertEntity,
    (alert) => alert.histories,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'alert_id' })
  alert!: AlertEntity;
}
