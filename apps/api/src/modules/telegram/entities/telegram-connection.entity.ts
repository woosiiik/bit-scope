/**
 * 텔레그램 연결 정보 엔티티
 *
 * 사용자의 지갑 주소와 텔레그램 채팅 ID를 매핑하여
 * 텔레그램 봇을 통한 알림 발송을 지원한다.
 *
 * 사용자는 설정 페이지에서 인증 코드를 통해 텔레그램을 연결하고,
 * 연결 후 가격/김프 알림을 텔레그램으로 수신할 수 있다.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('telegram_connection')
export class TelegramConnectionEntity {
  /** 연결 고유 ID (UUID) */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** 사용자 지갑 주소 */
  @Column({ name: 'wallet_address', type: 'varchar', length: 42 })
  @Index('idx_telegram_wallet', { unique: true })
  walletAddress!: string;

  /** 텔레그램 채팅 ID */
  @Column({ name: 'chat_id', type: 'varchar', length: 50 })
  chatId!: string;

  /** 텔레그램 사용자명 (nullable) */
  @Column({ type: 'varchar', length: 100, nullable: true })
  username!: string | null;

  /** 활성 상태 여부 */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  /** 생성 일시 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  /** 수정 일시 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
