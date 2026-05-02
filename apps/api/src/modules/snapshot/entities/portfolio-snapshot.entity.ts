/**
 * 포트폴리오 스냅샷 엔티티
 *
 * 클라이언트가 대시보드 접속 시 전송한 포트폴리오 데이터를 저장한다.
 * 서버에 API Key가 없으므로, 사용자 접속 시에만 스냅샷이 축적된다.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';

import { SnapshotHoldingEntity } from './snapshot-holding.entity';

@Entity('portfolio_snapshot')
@Index('idx_snapshot_wallet_created', ['walletAddress', 'createdAt'])
export class PortfolioSnapshotEntity {
  /** 스냅샷 고유 ID (UUID) */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** 사용자 지갑 주소 */
  @Column({ name: 'wallet_address', type: 'varchar', length: 42 })
  @Index('idx_snapshot_wallet')
  walletAddress!: string;

  /** 스냅샷 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  /** 총 평가금액 (KRW) */
  @Column({ name: 'total_evaluation', type: 'decimal', precision: 20, scale: 4, default: 0 })
  totalEvaluation!: number;

  /** 총 투자금액 (KRW) */
  @Column({ name: 'total_investment', type: 'decimal', precision: 20, scale: 4, default: 0 })
  totalInvestment!: number;

  /** 총 손익 (KRW) */
  @Column({ name: 'total_profit_loss', type: 'decimal', precision: 20, scale: 4, default: 0 })
  totalProfitLoss!: number;

  /** 수익률 (%) */
  @Column({ name: 'profit_loss_rate', type: 'decimal', precision: 10, scale: 4, default: 0 })
  profitLossRate!: number;

  /** 보유 코인 상세 목록 */
  @OneToMany(
    () => SnapshotHoldingEntity,
    (holding) => holding.snapshot,
    { cascade: true, eager: true },
  )
  holdings!: SnapshotHoldingEntity[];
}
