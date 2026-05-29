import { Entity, PrimaryGeneratedColumn, Column, Index, Unique } from 'typeorm';

@Entity('taker_volume_snapshot')
@Index('idx_tvs_symbol_time', ['symbol', 'timestamp'])
@Index('idx_tvs_timestamp', ['timestamp'])
@Unique('uq_tvs_symbol_exchange_time', ['symbol', 'exchange', 'timestamp'])
export class TakerVolumeSnapshotEntity {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ type: 'varchar', length: 20 })
  symbol!: string;

  /** 거래소 ID (현재 Binance 단독, 향후 확장 대비) */
  @Column({ type: 'varchar', length: 20, default: 'binance' })
  exchange!: string;

  @Column({ name: 'buy_volume', type: 'decimal', precision: 20, scale: 4, default: 0 })
  buyVolume!: number;

  @Column({ name: 'sell_volume', type: 'decimal', precision: 20, scale: 4, default: 0 })
  sellVolume!: number;

  /** 1시간 단위 floor 타임스탬프 (ms) */
  @Column({ type: 'bigint' })
  timestamp!: number;
}
