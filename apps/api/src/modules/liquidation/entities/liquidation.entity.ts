/**
 * 청산(Liquidation) 이벤트 엔티티
 *
 * Binance/Bybit WebSocket + OKX/Gate REST API에서 수집한 강제 청산 이벤트를 저장한다.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
} from 'typeorm';

@Entity('liquidation')
@Index('idx_liq_symbol_time', ['symbol', 'timestamp'])
@Index('idx_liq_exchange_time', ['exchange', 'timestamp'])
export class LiquidationEntity {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  /** 코인 심볼 (예: "BTC", "ETH") */
  @Column({ type: 'varchar', length: 20 })
  symbol!: string;

  /** 거래소 ID */
  @Column({ type: 'varchar', length: 20 })
  exchange!: string;

  /** 포지션 방향: LONG 또는 SHORT */
  @Column({ type: 'varchar', length: 10 })
  side!: string;

  /** 청산 수량 (코인 단위) */
  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  quantity!: number;

  /** 청산 가격 (USDT) */
  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  price!: number;

  /** 청산 금액 (USDT) = quantity × price */
  @Column({ name: 'usd_value', type: 'decimal', precision: 20, scale: 4, default: 0 })
  usdValue!: number;

  /** 이벤트 발생 시각 (밀리초 타임스탬프) */
  @Column({ type: 'bigint' })
  timestamp!: number;
}
