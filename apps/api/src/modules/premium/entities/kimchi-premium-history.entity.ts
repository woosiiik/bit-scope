/**
 * 김치 프리미엄 이력 엔티티
 *
 * 국내 거래소 vs 바이낸스 시세 차이(김치 프리미엄) 이력을 저장한다.
 * PremiumService가 1분 간격으로 스냅샷을 기록한다.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

import type { ExchangeType } from '@bitscope/shared';

@Entity('kimchi_premium_history')
@Index('idx_premium_symbol_exchange_recorded', ['symbol', 'domesticExchange', 'recordedAt'])
export class KimchiPremiumHistoryEntity {
  /** 이력 고유 ID (UUID) */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** 코인 심볼 (예: "BTC", "ETH") */
  @Column({ type: 'varchar', length: 20 })
  symbol!: string;

  /** 비교 기준 국내 거래소 */
  @Column({ name: 'domestic_exchange', type: 'varchar', length: 20 })
  domesticExchange!: ExchangeType;

  /** 국내 거래소 KRW 가격 */
  @Column({ name: 'domestic_price', type: 'decimal', precision: 20, scale: 4, default: 0 })
  domesticPrice!: number;

  /** 바이낸스 USDT 가격 */
  @Column({ name: 'binance_usdt_price', type: 'decimal', precision: 20, scale: 8, default: 0 })
  binanceUsdtPrice!: number;

  /** USDT/KRW 환율 */
  @Column({ name: 'usdt_krw_rate', type: 'decimal', precision: 20, scale: 4, default: 0 })
  usdtKrwRate!: number;

  /** 프리미엄 비율 (%) */
  @Column({ name: 'premium_rate', type: 'decimal', precision: 10, scale: 4, default: 0 })
  premiumRate!: number;

  /** 기록 시각 */
  @CreateDateColumn({ name: 'recorded_at', type: 'timestamp' })
  recordedAt!: Date;
}
