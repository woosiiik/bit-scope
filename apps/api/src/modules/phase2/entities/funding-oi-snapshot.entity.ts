import { Entity, PrimaryGeneratedColumn, Column, Index, Unique } from 'typeorm';

@Entity('funding_oi_snapshot')
@Index('idx_fos_symbol_time', ['symbol', 'timestamp'])
@Index('idx_fos_exchange_time', ['exchange', 'timestamp'])
@Index('idx_fos_timestamp', ['timestamp'])
@Unique('uq_fos_symbol_exchange_time', ['symbol', 'exchange', 'timestamp'])
export class FundingOISnapshotEntity {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ type: 'varchar', length: 20 })
  symbol!: string;

  @Column({ type: 'varchar', length: 20 })
  exchange!: string;

  @Column({ name: 'funding_rate', type: 'decimal', precision: 20, scale: 10, default: 0 })
  fundingRate!: number;

  @Column({ name: 'open_interest', type: 'decimal', precision: 20, scale: 4, default: 0 })
  openInterest!: number;

  /** 1시간 단위 floor 타임스탬프 (ms) */
  @Column({ type: 'bigint' })
  timestamp!: number;
}
