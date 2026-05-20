/**
 * Telegram User API 서비스
 *
 * gramjs (MTProto)를 사용하여 Telegram Private 채널의
 * 시그널 메시지를 실시간 수신한다.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

import { SystemConfigService } from './system-config.service';
import { SignalParserService } from './signal-parser.service';
import { SignalService } from './signal.service';

/** 최대 재연결 대기 시간: 5분 */
const MAX_RECONNECT_DELAY_MS = 5 * 60 * 1000;

@Injectable()
export class TelegramUserService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramUserService.name);
  private client: any = null;
  private connected = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly configService: SystemConfigService,
    private readonly parserService: SignalParserService,
    private readonly signalService: SignalService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.init();
    } catch (error) {
      this.logger.error(
        `Telegram 초기화 실패 (서비스 계속 운영): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    await this.disconnect();
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async init(): Promise<void> {
    const apiIdStr = await this.configService.get('telegram_api_id');
    const apiHash = await this.configService.get('telegram_api_hash');

    if (!apiIdStr || !apiHash) {
      this.logger.warn('Telegram API credentials 미설정. 시그널 수집 비활성화.');
      return;
    }

    const sessionStr = await this.configService.get('telegram_session');
    if (!sessionStr) {
      this.logger.warn('Telegram 세션 없음. 수동 인증이 필요합니다.');
      return;
    }

    await this.connect(Number(apiIdStr), apiHash, sessionStr);
  }

  private async connect(apiId: number, apiHash: string, sessionStr: string): Promise<void> {
    try {
      // gramjs 동적 import (ESM 호환)
      const { TelegramClient } = await import('telegram');
      const { StringSession } = await import('telegram/sessions');
      const { NewMessage } = await import('telegram/events');

      const session = new StringSession(sessionStr);
      this.client = new TelegramClient(session, apiId, apiHash, {
        connectionRetries: 5,
        useWSS: true,
      });

      await this.client.connect();
      this.connected = true;
      this.reconnectAttempts = 0;

      // 세션 문자열 업데이트
      const newSession = this.client.session.save() as unknown as string;
      if (newSession && newSession !== sessionStr) {
        await this.configService.set('telegram_session', newSession, true);
        this.logger.log('Telegram 세션 업데이트 완료');
      }

      // 시그널 채널 메시지 수신 등록
      const channelIdStr = await this.configService.get('telegram_signal_channel_id');
      if (channelIdStr) {
        const channelId = Number(channelIdStr);
        this.client.addEventHandler(
          async (event: any) => {
            try {
              await this.handleNewMessage(event);
            } catch (error) {
              this.logger.error(
                `메시지 처리 오류: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          },
          new NewMessage({ chats: [channelId] }),
        );
        this.logger.log(`Telegram 시그널 수신 시작 (채널: ${channelIdStr})`);

        // 최근 10건 히스토리 로드
        await this.fetchRecentMessages(channelId, 10);
      } else {
        this.logger.warn('telegram_signal_channel_id 미설정. 메시지 수신 비활성화.');
      }
    } catch (error) {
      this.connected = false;
      this.logger.error(
        `Telegram 연결 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.scheduleReconnect(apiId, apiHash, sessionStr);
    }
  }

  /**
   * 연결 직후 최근 N건의 메시지를 가져와 DB에 저장한다.
   */
  private async fetchRecentMessages(channelId: number, limit: number): Promise<void> {
    try {
      const messages = await this.client.getMessages(channelId, { limit });
      let savedTotal = 0;

      for (const msg of messages) {
        if (!msg.text) continue;
        const messageDate = msg.date ? new Date(msg.date * 1000) : new Date();
        const signals = this.parserService.parse(msg.text, Number(msg.id), messageDate);
        if (signals.length > 0) {
          savedTotal += await this.signalService.saveSignals(signals);
        }
      }

      this.logger.log(`최근 메시지 ${limit}건 로드 완료 - 신규 시그널: ${savedTotal}건`);
    } catch (error) {
      this.logger.error(
        `최근 메시지 로드 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async handleNewMessage(event: any): Promise<void> {
    const message = event.message;
    if (!message?.text) return;

    const rawMessage = message.text as string;
    const messageId = Number(message.id);
    const messageDate = message.date ? new Date(message.date * 1000) : new Date();

    this.logger.log(`시그널 메시지 수신 (ID: ${messageId}): ${rawMessage.slice(0, 80)}...`);

    const signals = this.parserService.parse(rawMessage, messageId, messageDate);
    if (signals.length > 0) {
      const savedCount = await this.signalService.saveSignals(signals);
      this.logger.log(`시그널 저장 완료 - 파싱: ${signals.length}건, 신규: ${savedCount}건`);
    }
  }

  private scheduleReconnect(apiId: number, apiHash: string, sessionStr: string): void {
    const delay = Math.min(
      5000 * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY_MS,
    );
    this.reconnectAttempts++;

    this.logger.warn(`Telegram 재연결 예정: ${Math.round(delay / 1000)}초 후 (시도 #${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect(apiId, apiHash, sessionStr);
      } catch (error) {
        this.logger.error(
          `Telegram 재연결 실패: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }, delay);
  }

  private async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch {
        // 무시
      }
      this.client = null;
      this.connected = false;
    }
  }
}
