/**
 * 시스템 설정 엔티티
 *
 * 히든 메뉴 비밀번호, Telegram API 인증 정보 등
 * 보안 민감 설정을 key-value로 관리한다.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('t_system_config')
export class SystemConfigEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'config_key', type: 'varchar', length: 100, unique: true })
  configKey!: string;

  @Column({ name: 'config_value', type: 'text' })
  configValue!: string;

  @Column({ name: 'is_sensitive', type: 'boolean', default: false })
  isSensitive!: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
