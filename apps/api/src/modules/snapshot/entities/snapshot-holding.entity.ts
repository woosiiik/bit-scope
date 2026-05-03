/**
 * 스냅샷 보유 코인 엔티티
 *
 * 포트폴리오 스냅샷 내 개별 코인 보유 내역을 저장한다.
 * PortfolioSnapshotEntity와 다대일 관계를 갖는다.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

import { PortfolioSnapshotEntity } from './portfolio-snapshot.entity';

@Entity('snapshot_holding')
@Index('idx_holding_snapshot', ['snapshotId'])
export class SnapshotHoldingEntity {
  /** 보유 내역 고유 ID (UUID) */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** 스냅샷 ID (FK) */
  @Column({ name: 'snapshot_id', type: 'varchar', length: 36 })
  snapshotId!: string;

  /** 코인 심볼 (예: "BTC", "ETH") */
  @Column({ type: 'varchar', length: 20 })
  symbol!: string;

  /** 거래소 식별자 */
  @Column({ type: 'varchar', length: 20 })
  exchange!: string;

  /** 보유 수량 */
  @Column({ type: 'decimal', precision: 30, scale: 8, default: 0 })
  balance!: number;

  /** 매수 평균가 */
  @Column({ name: 'avg_buy_price', type: 'decimal', precision: 20, scale: 4, default: 0 })
  avgBuyPrice!: number;

  /** 현재가 */
  @Column({ name: 'current_price', type: 'decimal', precision: 20, scale: 4, default: 0 })
  currentPrice!: number;

  /** 평가금액 (KRW) */
  @Column({ type: 'decimal', precision: 20, scale: 4, default: 0 })
  evaluation!: number;

  /** 소속 스냅샷 */
  @ManyToOne(
    () => PortfolioSnapshotEntity,
    (snapshot) => snapshot.holdings,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'snapshot_id' })
  snapshot!: PortfolioSnapshotEntity;
}
