import { Entity, PrimaryGeneratedColumn, Column, Index, Unique } from 'typeorm';

@Entity('taker_volume_snapshot')
@Index('idx_tvs_symbol_time', ['symbol', 'timestamp'])
@Unique('uq_tvs_symbol_time', ['symbol', 'timestamp'])
export class TakerVolumeSnapshotEntity {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ type: 'varchar', length: 20 })
  symbol!: string;

  @Column({ name: 'buy_volume', type: 'decimal', precision: 20, scale: 4, default: 0 })
  buyVolume!: number;

  @Column({ name: 'sell_volume', type: 'decimal', precision: 20, scale: 4, default: 0 })
  sellVolume!: number;

  /** 1시간 단위 floor 타임스탬프 (ms) */
  @Column({ type: 'bigint' })
  timestamp!: number;
}
