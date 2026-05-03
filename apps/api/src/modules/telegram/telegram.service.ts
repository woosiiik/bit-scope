/**
 * TelegramService - 텔레그램 봇 알림 서비스
 *
 * 텔레그램 Bot API를 사용하여 사용자에게 메시지를 전송하고,
 * 인증 코드를 통한 지갑 주소-채팅 ID 매핑을 관리한다.
 *
 * BOT_TOKEN이 설정되지 않으면 모든 기능이 조용히 비활성화된다.
 *
 * 인증 흐름:
 * 1. 사용자가 프론트엔드에서 인증 코드를 요청한다.
 * 2. 6자리 인증 코드를 생성하고 메모리에 5분간 유지한다.
 * 3. 사용자가 텔레그램 봇에 /start {인증코드}를 전송한다.
 * 4. 봇 웹훅이 인증 코드로 지갑 주소를 찾아 chat_id를 저장한다.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TelegramConnectionEntity } from './entities/telegram-connection.entity';

/** 인증 코드 메모리 저장소 항목 */
interface VerificationEntry {
  /** 지갑 주소 */
  walletAddress: string;
  /** 만료 시각 (밀리초 타임스탬프) */
  expiresAt: number;
}

/** 인증 코드 유효 시간 (밀리초) - 5분 */
const VERIFICATION_CODE_TTL_MS = 5 * 60 * 1000;

/** 인증 코드 길이 */
const VERIFICATION_CODE_LENGTH = 6;

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);

  /** 텔레그램 봇 토큰 */
  private readonly botToken: string | undefined;

  /** 텔레그램 봇 사용자명 */
  private readonly botUsername: string | undefined;

  /** 인증 코드 메모리 저장소: Map<code, VerificationEntry> */
  private readonly verificationCodes = new Map<string, VerificationEntry>();

  /** getUpdates 폴링 타이머 */
  private pollingTimer: ReturnType<typeof setInterval> | null = null;

  /** 마지막으로 처리한 update_id */
  private lastUpdateId = 0;

  constructor(
    @InjectRepository(TelegramConnectionEntity)
    private readonly connectionRepository: Repository<TelegramConnectionEntity>,
    private readonly configService: ConfigService,
  ) {
    this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    this.botUsername = this.configService.get<string>('TELEGRAM_BOT_USERNAME');

    if (!this.botToken) {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN이 설정되지 않았습니다. 텔레그램 기능이 비활성화됩니다.',
      );
    } else {
      this.logger.log('텔레그램 봇 서비스 초기화 완료');
    }
  }

  /**
   * 모듈 초기화 시 getUpdates 폴링을 시작한다.
   * 웹훅 없이도 텔레그램 메시지를 수신할 수 있다 (로컬 개발 환경 대응).
   */
  async onModuleInit(): Promise<void> {
    if (!this.botToken) return;

    // 기존 웹훅 해제 (폴링과 웹훅은 동시에 사용 불가)
    try {
      await fetch(`https://api.telegram.org/bot${this.botToken}/deleteWebhook`);
    } catch {
      // 무시
    }

    this.startPolling();
    this.logger.log('텔레그램 getUpdates 폴링 시작');
  }

  /**
   * 모듈 종료 시 폴링을 중단한다.
   */
  onModuleDestroy(): void {
    this.stopPolling();
  }

  /**
   * getUpdates 폴링을 시작한다 (3초 간격).
   */
  private startPolling(): void {
    if (this.pollingTimer) return;

    this.pollingTimer = setInterval(() => {
      this.pollUpdates().catch((error) => {
        this.logger.error(
          `getUpdates 폴링 오류: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, 10_000); // 10초 간격
  }

  /**
   * getUpdates 폴링을 중단한다.
   */
  private stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  /**
   * 텔레그램 getUpdates API를 호출하여 새 메시지를 가져온다.
   */
  private async pollUpdates(): Promise<void> {
    if (!this.botToken) return;

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=0&allowed_updates=["message"]`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        this.logger.error(`[폴링] getUpdates 실패: ${response.status}`);
        return;
      }

      const data = (await response.json()) as {
        ok: boolean;
        result: Array<{ update_id: number } & Record<string, unknown>>;
      };

      if (!data.ok || !data.result || data.result.length === 0) return;

      for (const update of data.result) {
        this.lastUpdateId = update.update_id;
        this.logger.log(`[폴링] 메시지 수신 - update_id: ${update.update_id}, message: ${JSON.stringify((update as Record<string, unknown>).message)?.substring(0, 200)}`);
        await this.handleWebhook(update);
      }
    } catch (error) {
      this.logger.error(`[폴링] 오류: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 텔레그램 기능이 활성화되어 있는지 확인한다.
   *
   * @returns BOT_TOKEN이 설정되어 있으면 true
   */
  isEnabled(): boolean {
    return !!this.botToken;
  }

  /**
   * 텔레그램 Bot API를 통해 메시지를 전송한다.
   *
   * Bot API 호출 실패 시 조용히 로그만 남기고
   * 다른 알림 채널에 영향을 주지 않는다.
   *
   * @param chatId 텔레그램 채팅 ID
   * @param text 전송할 메시지 (HTML 파싱 모드)
   * @returns 전송 성공 여부
   */
  async sendMessage(chatId: string, text: string): Promise<boolean> {
    if (!this.botToken) {
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(
          `텔레그램 메시지 전송 실패 - chatId: ${chatId}, status: ${response.status}, body: ${errorBody}`,
        );
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(
        `텔레그램 메시지 전송 오류 - chatId: ${chatId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * 텔레그램 웹훅 업데이트를 처리한다.
   *
   * /start 명령을 수신하면 인증 코드를 확인하여
   * 지갑 주소와 채팅 ID를 매핑한다.
   *
   * @param update 텔레그램 웹훅 업데이트 데이터
   */
  async handleWebhook(update: Record<string, unknown>): Promise<void> {
    if (!this.botToken) {
      this.logger.debug('[웹훅] botToken 없음, 무시');
      return;
    }

    const message = update.message as Record<string, unknown> | undefined;
    if (!message) {
      this.logger.debug('[웹훅] message 없음, 무시');
      return;
    }

    const text = (message.text as string) ?? '';
    const chat = message.chat as Record<string, unknown> | undefined;
    const from = message.from as Record<string, unknown> | undefined;

    this.logger.log(`[웹훅] 텍스트: "${text}", chat.id: ${chat?.id}, from: ${from?.username}`);

    if (!chat || !chat.id) {
      this.logger.debug('[웹훅] chat.id 없음, 무시');
      return;
    }

    const chatId = String(chat.id);
    const username = from?.username ? String(from.username) : null;

    // /start 명령 처리
    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const code = parts[1]?.trim();
      this.logger.log(`[웹훅] /start 감지 - code: "${code}", chatId: ${chatId}`);

      if (!code) {
        // 인증 코드 없이 /start만 전송한 경우
        await this.sendMessage(
          chatId,
          'BitScope 텔레그램 알림 봇입니다.\n\n' +
            'BitScope 설정 페이지에서 인증 코드를 받은 후\n' +
            '<code>/start 인증코드</code> 형태로 전송해주세요.',
        );
        return;
      }

      await this.processVerificationCode(chatId, username, code);
    }
  }

  /**
   * 인증 코드를 검증하고 텔레그램 연결을 생성한다.
   *
   * @param chatId 텔레그램 채팅 ID
   * @param username 텔레그램 사용자명
   * @param code 인증 코드
   */
  private async processVerificationCode(
    chatId: string,
    username: string | null,
    code: string,
  ): Promise<void> {
    // 만료된 인증 코드 정리
    this.cleanupExpiredCodes();

    this.logger.log(`[인증] 코드 검증 시도 - code: "${code}", 저장된 코드 수: ${this.verificationCodes.size}`);
    this.logger.log(`[인증] 저장된 코드 목록: ${Array.from(this.verificationCodes.keys()).join(', ')}`);

    const entry = this.verificationCodes.get(code);

    if (!entry) {
      this.logger.warn(`[인증] 코드 불일치 또는 만료 - code: "${code}"`);
      await this.sendMessage(
        chatId,
        '유효하지 않거나 만료된 인증 코드입니다.\n' +
          'BitScope 설정 페이지에서 새 인증 코드를 받아주세요.',
      );
      return;
    }

    this.logger.log(`[인증] 코드 매칭 성공 - wallet: ${entry.walletAddress}`);

    // 인증 코드 사용 후 제거
    this.verificationCodes.delete(code);

    try {
      // 기존 연결이 있으면 업데이트, 없으면 신규 생성
      let connection = await this.connectionRepository.findOne({
        where: { walletAddress: entry.walletAddress.toLowerCase() },
      });

      if (connection) {
        connection.chatId = chatId;
        connection.username = username;
        connection.isActive = true;
      } else {
        connection = this.connectionRepository.create({
          walletAddress: entry.walletAddress.toLowerCase(),
          chatId,
          username,
          isActive: true,
        });
      }

      await this.connectionRepository.save(connection);

      await this.sendMessage(
        chatId,
        '텔레그램 연결이 완료되었습니다!\n\n' +
          '이제 BitScope에서 설정한 가격/김프 알림을\n' +
          '텔레그램으로 수신할 수 있습니다.',
      );

      this.logger.log(
        `텔레그램 연결 완료 - wallet: ${entry.walletAddress}, chatId: ${chatId}`,
      );
    } catch (error) {
      this.logger.error(
        `텔레그램 연결 저장 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.sendMessage(
        chatId,
        '연결 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
      );
    }
  }

  /**
   * 인증 코드를 생성한다.
   *
   * 6자리 영숫자 코드를 생성하고 메모리에 5분간 유지한다.
   * 동일 지갑 주소의 기존 미사용 코드는 제거한다.
   *
   * @param walletAddress 지갑 주소
   * @returns 생성된 인증 코드
   */
  generateVerificationCode(walletAddress: string): string {
    // 만료된 코드 정리
    this.cleanupExpiredCodes();

    // 동일 지갑의 기존 코드 제거
    const normalizedAddress = walletAddress.toLowerCase();
    for (const [code, entry] of this.verificationCodes.entries()) {
      if (entry.walletAddress === normalizedAddress) {
        this.verificationCodes.delete(code);
      }
    }

    // 새 인증 코드 생성 (6자리 영숫자)
    const code = this.createRandomCode(VERIFICATION_CODE_LENGTH);

    this.verificationCodes.set(code, {
      walletAddress: normalizedAddress,
      expiresAt: Date.now() + VERIFICATION_CODE_TTL_MS,
    });

    this.logger.log(
      `인증 코드 생성 - wallet: ${normalizedAddress}, code: ${code}`,
    );

    return code;
  }

  /**
   * 지갑 주소로 텔레그램 연결 정보를 조회한다.
   *
   * @param walletAddress 지갑 주소
   * @returns 연결 정보 또는 null
   */
  async getConnection(
    walletAddress: string,
  ): Promise<TelegramConnectionEntity | null> {
    return this.connectionRepository.findOne({
      where: { walletAddress: walletAddress.toLowerCase() },
    });
  }

  /**
   * 텔레그램 연결을 해제한다.
   *
   * 연결 정보를 DB에서 삭제한다.
   *
   * @param walletAddress 지갑 주소
   * @returns 삭제 성공 여부
   */
  async disconnect(walletAddress: string): Promise<boolean> {
    const connection = await this.connectionRepository.findOne({
      where: { walletAddress: walletAddress.toLowerCase() },
    });

    if (!connection) {
      return false;
    }

    await this.connectionRepository.remove(connection);

    this.logger.log(
      `텔레그램 연결 해제 - wallet: ${walletAddress}`,
    );

    return true;
  }

  /**
   * 텔레그램 봇 연결 링크를 생성한다.
   *
   * @returns 텔레그램 봇 딥링크 URL 또는 null
   */
  getBotLink(): string | null {
    if (!this.botUsername) {
      return null;
    }
    return `https://t.me/${this.botUsername}`;
  }

  /**
   * 만료된 인증 코드를 제거한다.
   */
  private cleanupExpiredCodes(): void {
    const now = Date.now();
    for (const [code, entry] of this.verificationCodes.entries()) {
      if (entry.expiresAt < now) {
        this.verificationCodes.delete(code);
      }
    }
  }

  /**
   * 랜덤 영숫자 코드를 생성한다.
   *
   * @param length 코드 길이
   * @returns 생성된 코드
   */
  private createRandomCode(length: number): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
