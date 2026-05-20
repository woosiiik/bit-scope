/**
 * 시그널 엔티티
 *
 * Telegram 채널에서 수신한 롱/숏 시그널 데이터를 저장한다.
 * 하나의 메시지에서 여러 코인 시그널이 파생될 수 있다.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('t_signal')
@Index('IDX_signal_coin_at', ['coinSymbol', 'signalAt'])
export class SignalEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'coin_symbol', type: 'varchar', length: 20 })
  coinSymbol!: string;

  @Column({ type: 'enum', enum: ['LONG', 'SHORT'] })
  direction!: 'LONG' | 'SHORT';

  @Column({ name: 'signal_type', type: 'varchar', length: 20 })
  signalType!: string;

  @Column({ name: 'section_name', type: 'varchar', length: 100, nullable: true })
  sectionName!: string | null;

  @Column({ name: 'telegram_message_id', type: 'bigint' })
  @Index('IDX_signal_telegram_msg')
  telegramMessageId!: number;

  @Column({ name: 'signal_at', type: 'timestamp' })
  @Index('IDX_signal_at')
  signalAt!: Date;

  @Column({ name: 'raw_message', type: 'text' })
  rawMessage!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
