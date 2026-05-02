/**
 * 리포트 엔티티
 *
 * 수동/자동 생성된 포트폴리오 리포트를 저장한다.
 * 리포트 요약 정보와 스냅샷 데이터를 JSON 형태로 포함한다.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('report')
@Index('idx_report_wallet_generated', ['walletAddress', 'generatedAt'])
export class ReportEntity {
  /** 리포트 고유 ID (UUID) */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** 사용자 지갑 주소 */
  @Column({ name: 'wallet_address', type: 'varchar', length: 42 })
  @Index('idx_report_wallet')
  walletAddress!: string;

  /** 리포트 유형 (daily, weekly, monthly, custom) */
  @Column({ type: 'varchar', length: 20 })
  type!: string;

  /** 리포트 생성 일시 */
  @CreateDateColumn({ name: 'generated_at', type: 'timestamp' })
  generatedAt!: Date;

  /** 리포트 기간 시작 */
  @Column({ name: 'period_start', type: 'timestamp' })
  periodStart!: Date;

  /** 리포트 기간 종료 */
  @Column({ name: 'period_end', type: 'timestamp' })
  periodEnd!: Date;

  /** 리포트 요약 (JSON) */
  @Column({ type: 'json' })
  summary!: Record<string, unknown>;

  /** 리포트 시점의 스냅샷 데이터 (JSON) */
  @Column({ type: 'json' })
  data!: Record<string, unknown>;
}
