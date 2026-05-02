/**
 * 리포트 스케줄 엔티티
 *
 * 정기 리포트 생성 스케줄을 저장한다.
 * NestJS cron 스케줄러가 이 데이터를 참조하여 자동 리포트를 생성한다.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('report_schedule')
@Index('idx_schedule_wallet', ['walletAddress'])
@Index('idx_schedule_active_next', ['isActive', 'nextRunAt'])
export class ReportScheduleEntity {
  /** 스케줄 고유 ID (UUID) */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** 사용자 지갑 주소 */
  @Column({ name: 'wallet_address', type: 'varchar', length: 42 })
  walletAddress!: string;

  /** 리포트 유형 (daily, weekly, monthly) */
  @Column({ type: 'varchar', length: 20 })
  type!: string;

  /** 활성 상태 여부 */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  /** 다음 실행 예정 시각 */
  @Column({ name: 'next_run_at', type: 'timestamp' })
  nextRunAt!: Date;

  /** cron 표현식 (예: "0 9 * * *" - 매일 오전 9시) */
  @Column({ name: 'cron_expression', type: 'varchar', length: 50 })
  cronExpression!: string;

  /** 생성 일시 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  /** 수정 일시 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
