/**
 * 시스템 설정 서비스
 *
 * t_system_config 테이블의 CRUD, 민감 값 AES-256 암호화/복호화,
 * 시드 데이터 초기화를 담당한다.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';

import { SystemConfigEntity } from '../entities/system-config.entity';

/** 시드 데이터 키 목록 */
const SEED_KEYS: { key: string; description: string; isSensitive: boolean }[] = [
  { key: 'hidden_menu_password', description: '히든 메뉴 접근 비밀번호 (bcrypt 해시)', isSensitive: true },
  { key: 'telegram_api_id', description: 'Telegram API ID', isSensitive: true },
  { key: 'telegram_api_hash', description: 'Telegram API Hash', isSensitive: true },
  { key: 'telegram_signal_channel_id', description: '시그널 수신 채널 ID', isSensitive: false },
  { key: 'telegram_session', description: 'gramjs StringSession', isSensitive: true },
];

const AES_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

@Injectable()
export class SystemConfigService implements OnModuleInit {
  private readonly logger = new Logger(SystemConfigService.name);
  private encryptionKey: Buffer | null = null;

  constructor(
    @InjectRepository(SystemConfigEntity)
    private readonly configRepo: Repository<SystemConfigEntity>,
  ) {
    const keyEnv = process.env.SYSTEM_CONFIG_ENCRYPTION_KEY;
    if (keyEnv) {
      this.encryptionKey = Buffer.from(keyEnv, 'base64');
      if (this.encryptionKey.length !== 32) {
        this.logger.warn('SYSTEM_CONFIG_ENCRYPTION_KEY는 32바이트(base64)여야 합니다. 암호화 비활성화.');
        this.encryptionKey = null;
      }
    } else {
      this.logger.warn('SYSTEM_CONFIG_ENCRYPTION_KEY 미설정. 민감 값 암호화가 비활성화됩니다.');
    }
  }

  async onModuleInit(): Promise<void> {
    await this.initSeedData();
  }

  /**
   * 설정 값을 조회한다 (민감 값은 복호화).
   */
  async get(key: string): Promise<string | null> {
    const entity = await this.configRepo.findOne({ where: { configKey: key } });
    if (!entity) return null;

    if (entity.isSensitive && this.encryptionKey) {
      try {
        return this.decrypt(entity.configValue);
      } catch {
        this.logger.error(`설정값 복호화 실패: ${key}`);
        return entity.configValue;
      }
    }
    return entity.configValue;
  }

  /**
   * 마스킹된 설정 값을 반환한다 (API 응답용).
   */
  async getPublic(key: string): Promise<string | null> {
    const entity = await this.configRepo.findOne({ where: { configKey: key } });
    if (!entity) return null;
    if (entity.isSensitive) return '****';
    return entity.configValue;
  }

  /**
   * 설정 값을 저장한다 (민감 값은 암호화).
   */
  async set(key: string, value: string, isSensitive?: boolean): Promise<void> {
    let entity = await this.configRepo.findOne({ where: { configKey: key } });

    const storedValue = isSensitive && this.encryptionKey
      ? this.encrypt(value)
      : value;

    if (entity) {
      entity.configValue = storedValue;
      if (isSensitive !== undefined) entity.isSensitive = isSensitive;
      await this.configRepo.save(entity);
    } else {
      entity = this.configRepo.create({
        configKey: key,
        configValue: storedValue,
        isSensitive: isSensitive ?? false,
      });
      await this.configRepo.save(entity);
    }
  }

  private async initSeedData(): Promise<void> {
    for (const seed of SEED_KEYS) {
      const exists = await this.configRepo.findOne({ where: { configKey: seed.key } });
      if (!exists) {
        await this.configRepo.save(
          this.configRepo.create({
            configKey: seed.key,
            configValue: '',
            isSensitive: seed.isSensitive,
            description: seed.description,
          }),
        );
        this.logger.log(`시드 데이터 등록: ${seed.key}`);
      }
    }
  }

  private encrypt(plainText: string): string {
    if (!this.encryptionKey) return plainText;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(AES_ALGORITHM, this.encryptionKey, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  private decrypt(encryptedText: string): string {
    if (!this.encryptionKey) return encryptedText;
    const parts = encryptedText.split(':');
    if (parts.length !== 3) return encryptedText;

    const iv = Buffer.from(parts[0]!, 'hex');
    const authTag = Buffer.from(parts[1]!, 'hex');
    const encrypted = parts[2]!;

    const decipher = crypto.createDecipheriv(AES_ALGORITHM, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
