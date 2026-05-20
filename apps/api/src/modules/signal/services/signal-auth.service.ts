/**
 * 시그널 인증 서비스
 *
 * 히든 메뉴 비밀번호 검증 및 인메모리 토큰 관리를 담당한다.
 */

import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { SystemConfigService } from './system-config.service';

/** 토큰 TTL: 24시간 */
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** 만료 토큰 정리 주기: 1시간 */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class SignalAuthService {
  private readonly logger = new Logger(SignalAuthService.name);
  private readonly tokens = new Map<string, { createdAt: number }>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly configService: SystemConfigService) {
    this.cleanupTimer = setInterval(() => this.cleanupExpiredTokens(), CLEANUP_INTERVAL_MS);
  }

  /**
   * 비밀번호를 검증하고 성공 시 토큰을 발급한다.
   */
  async verifyPassword(password: string): Promise<{ success: boolean; token?: string }> {
    if (!password) return { success: false };

    const storedHash = await this.configService.get('hidden_menu_password');
    if (!storedHash) {
      this.logger.warn('hidden_menu_password가 설정되지 않았습니다.');
      return { success: false };
    }

    const isMatch = await bcrypt.compare(password, storedHash);
    if (!isMatch) return { success: false };

    const token = crypto.randomUUID();
    this.tokens.set(token, { createdAt: Date.now() });

    return { success: true, token };
  }

  /**
   * 토큰의 유효성을 검사한다.
   */
  validateToken(token: string): boolean {
    if (!token) return false;

    const entry = this.tokens.get(token);
    if (!entry) return false;

    if (Date.now() - entry.createdAt > TOKEN_TTL_MS) {
      this.tokens.delete(token);
      return false;
    }

    return true;
  }

  private cleanupExpiredTokens(): void {
    const now = Date.now();
    for (const [token, entry] of this.tokens) {
      if (now - entry.createdAt > TOKEN_TTL_MS) {
        this.tokens.delete(token);
      }
    }
  }
}
