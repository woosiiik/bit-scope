/**
 * 가격 이력 엔티티
 *
 * 거래소별 코인 가격 이력을 저장한다.
 * 시계열 분석 및 차트 표시를 위해 활용된다.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('price_history')
@Index('idx_price_symbol_exchange_recorded', ['symbol', 'exchange', 'recordedAt'])
@Index('idx_price_recorded', ['recordedAt'])
export class PriceHistoryEntity {
  /** 이력 고유 ID (UUID) */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** 코인 심볼 (예: "BTC", "ETH") */
  @Column({ type: 'varchar', length: 20 })
  symbol!: string;

  /** 거래소 식별자 */
  @Column({ type: 'varchar', length: 20 })
  exchange!: string;

  /** 가격 */
  @Column({ type: 'decimal', precision: 20, scale: 4, default: 0 })
  price!: number;

  /** 24시간 거래량 */
  @Column({ name: 'volume_24h', type: 'decimal', precision: 30, scale: 8, default: 0 })
  volume24h!: number;

  /** 기록 시각 */
  @CreateDateColumn({ name: 'recorded_at', type: 'timestamp' })
  recordedAt!: Date;
}
