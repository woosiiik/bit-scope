/**
 * 알림 설정 엔티티
 *
 * 사용자가 설정한 가격 알림 및 김치 프리미엄 알림 조건을 저장한다.
 * NestJS 백그라운드 서비스에서 실시간 시세와 비교하여 조건 충족 여부를 판단한다.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';

import { AlertHistoryEntity } from './alert-history.entity';

@Entity('alert')
@Index('idx_alert_wallet_active', ['walletAddress', 'isActive'])
export class AlertEntity {
  /** 알림 고유 ID (UUID) */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** 사용자 지갑 주소 */
  @Column({ name: 'wallet_address', type: 'varchar', length: 42 })
  @Index('idx_alert_wallet')
  walletAddress!: string;

  /** 코인 심볼 (예: "BTC", "ETH") */
  @Column({ type: 'varchar', length: 20 })
  symbol!: string;

  /** 대상 거래소 (null이면 모든 거래소) */
  @Column({ type: 'varchar', length: 20, nullable: true })
  exchange!: string | null;

  /** 알림 조건 (above, below, premium_above, premium_below) */
  @Column({ type: 'varchar', length: 20 })
  condition!: string;

  /** 목표 가격 또는 프리미엄 비율 (%) */
  @Column({ name: 'target_value', type: 'decimal', precision: 20, scale: 4 })
  targetValue!: number;

  /** 활성 상태 여부 */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  /** 생성 일시 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  /** 수정 일시 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;

  /** 알림 발생 이력 */
  @OneToMany(
    () => AlertHistoryEntity,
    (history) => history.alert,
    { cascade: true },
  )
  histories!: AlertHistoryEntity[];
}
