import { Entity, PrimaryGeneratedColumn, Column, Index, Unique } from 'typeorm';

@Entity('basis_snapshot')
@Index('idx_bs_symbol_time', ['symbol', 'timestamp'])
@Index('idx_bs_timestamp', ['timestamp'])
@Unique('uq_bs_symbol_time', ['symbol', 'timestamp'])
export class BasisSnapshotEntity {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ type: 'varchar', length: 20 })
  symbol!: string;

  @Column({ name: 'futures_price', type: 'decimal', precision: 20, scale: 8, default: 0 })
  futuresPrice!: number;

  @Column({ name: 'spot_price', type: 'decimal', precision: 20, scale: 8, default: 0 })
  spotPrice!: number;

  /** 분기 선물 만기일 (ms 타임스탬프) */
  @Column({ name: 'delivery_date', type: 'bigint', default: 0 })
  deliveryDate!: number;

  /** 1시간 단위 floor 타임스탬프 (ms) */
  @Column({ type: 'bigint' })
  timestamp!: number;
}
