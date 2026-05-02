/**
 * 김치 프리미엄 이력 엔티티
 *
 * 거래소 간 시세 차이(김치 프리미엄) 이력을 저장한다.
 * PriceMonitorService가 1분 간격으로 스냅샷을 기록한다.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('kimchi_premium_history')
@Index('idx_premium_symbol_recorded', ['symbol', 'recordedAt'])
export class KimchiPremiumHistoryEntity {
  /** 이력 고유 ID (UUID) */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** 코인 심볼 (예: "BTC", "ETH") */
  @Column({ type: 'varchar', length: 20 })
  symbol!: string;

  /** 업비트 가격 */
  @Column({ name: 'upbit_price', type: 'decimal', precision: 20, scale: 4, default: 0 })
  upbitPrice!: number;

  /** 빗썸 가격 */
  @Column({ name: 'bithumb_price', type: 'decimal', precision: 20, scale: 4, default: 0 })
  bithumbPrice!: number;

  /** 코인원 가격 */
  @Column({ name: 'coinone_price', type: 'decimal', precision: 20, scale: 4, default: 0 })
  coinonePrice!: number;

  /** 프리미엄 비율 (%) */
  @Column({ name: 'premium_rate', type: 'decimal', precision: 10, scale: 4, default: 0 })
  premiumRate!: number;

  /** 기록 시각 */
  @CreateDateColumn({ name: 'recorded_at', type: 'timestamp' })
  recordedAt!: Date;
}
