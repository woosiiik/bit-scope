/**
 * 거래소 실시간 시세 클라이언트 기본 인터페이스 및 추상 클래스
 *
 * 업비트, 빗썸, 코인원 등 각 거래소별 시세 수신 클라이언트가
 * 구현해야 할 공통 인터페이스와 재연결 로직을 제공한다.
 */

import { Logger } from '@nestjs/common';
import { EventEmitter } from 'events';

import type { ExchangeType, PriceUpdate } from '@bitscope/shared';
import { WS_MAX_RECONNECT_ATTEMPTS } from '@bitscope/shared';

/** 거래소 시세 클라이언트 이벤트 맵 */
export interface ExchangeClientEvents {
  /** 시세 업데이트 수신 */
  priceUpdate: (update: PriceUpdate) => void;
  /** 연결 성공 */
  connected: () => void;
  /** 연결 해제 */
  disconnected: (reason?: string) => void;
  /** 오류 발생 */
  error: (error: Error) => void;
}

/** 거래소 시세 클라이언트 공통 인터페이스 */
export interface IExchangeClient {
  /** 거래소 타입 반환 */
  getExchangeType(): ExchangeType;
  /** 시세 수신 시작 */
  start(symbols: string[]): Promise<void>;
  /** 시세 수신 중지 */
  stop(): Promise<void>;
  /** 구독 심볼 추가 */
  subscribe(symbols: string[]): void;
  /** 구독 심볼 제거 */
  unsubscribe(symbols: string[]): void;
  /** 연결 상태 확인 */
  isConnected(): boolean;
}

/**
 * 거래소 시세 클라이언트 추상 기본 클래스
 *
 * WebSocket 자동 재연결 로직(지수 백오프, 최대 시도 횟수)과
 * 이벤트 발행 인프라를 공통으로 제공한다.
 */
export abstract class BaseExchangeClient
  extends EventEmitter
  implements IExchangeClient
{
  protected readonly logger: Logger;

  /** 현재 연결 상태 */
  protected connected = false;

  /** 재연결 시도 횟수 */
  protected reconnectAttempts = 0;

  /** 최대 재연결 시도 횟수 */
  protected readonly maxReconnectAttempts: number;

  /** 재연결 타이머 */
  protected reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /** 현재 구독 중인 심볼 목록 */
  protected subscribedSymbols: string[] = [];

  /** 시작 상태 (stop 호출 시 재연결을 방지하기 위한 플래그) */
  protected running = false;

  constructor(
    protected readonly exchangeType: ExchangeType,
    maxReconnectAttempts: number = WS_MAX_RECONNECT_ATTEMPTS,
  ) {
    super();
    this.logger = new Logger(`${this.constructor.name}`);
    this.maxReconnectAttempts = maxReconnectAttempts;
  }

  /** 거래소 타입 반환 */
  getExchangeType(): ExchangeType {
    return this.exchangeType;
  }

  /** 연결 상태 확인 */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * 시세 수신을 시작한다.
   *
   * 하위 클래스에서 실제 연결 로직을 doConnect()로 구현한다.
   */
  async start(symbols: string[]): Promise<void> {
    this.subscribedSymbols = [...symbols];
    this.running = true;
    this.reconnectAttempts = 0;

    this.logger.log(
      `시세 수신 시작 - 심볼: [${symbols.join(', ')}]`,
    );

    await this.doConnect();
  }

  /**
   * 시세 수신을 중지한다.
   *
   * 하위 클래스에서 실제 연결 해제 로직을 doDisconnect()로 구현한다.
   */
  async stop(): Promise<void> {
    this.running = false;
    this.clearReconnectTimer();

    this.logger.log('시세 수신 중지');
    await this.doDisconnect();
  }

  /**
   * 구독 심볼을 추가한다.
   *
   * 이미 구독 중인 심볼은 무시한다.
   */
  subscribe(symbols: string[]): void {
    const newSymbols = symbols.filter(
      (s) => !this.subscribedSymbols.includes(s),
    );
    if (newSymbols.length === 0) return;

    this.subscribedSymbols.push(...newSymbols);
    this.logger.log(`심볼 구독 추가: [${newSymbols.join(', ')}]`);

    if (this.connected) {
      this.doSubscribe(newSymbols);
    }
  }

  /**
   * 구독 심볼을 제거한다.
   */
  unsubscribe(symbols: string[]): void {
    this.subscribedSymbols = this.subscribedSymbols.filter(
      (s) => !symbols.includes(s),
    );
    this.logger.log(`심볼 구독 제거: [${symbols.join(', ')}]`);

    if (this.connected) {
      this.doUnsubscribe(symbols);
    }
  }

  /**
   * 자동 재연결을 시도한다 (지수 백오프).
   *
   * 재연결 시도 횟수가 최대치를 초과하면 포기하고 오류를 발행한다.
   */
  protected scheduleReconnect(): void {
    if (!this.running) {
      this.logger.log('running=false, 재연결 스킵');
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      const errorMsg =
        `최대 재연결 시도 횟수(${this.maxReconnectAttempts}회) 초과. 재연결 포기.`;
      this.logger.error(errorMsg);
      this.emit('error', new Error(errorMsg));
      return;
    }

    // 지수 백오프: 1초, 2초, 4초, 8초, 16초 ...
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      30_000,
    );
    this.reconnectAttempts++;

    this.logger.warn(
      `재연결 시도 ${this.reconnectAttempts}/${this.maxReconnectAttempts} - ${delay}ms 후`,
    );

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.doConnect();
      } catch (error) {
        this.logger.error('재연결 실패', error instanceof Error ? error.stack : String(error));
        this.scheduleReconnect();
      }
    }, delay);
  }

  /** 재연결 타이머를 초기화한다. */
  protected clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * 연결 성공 시 호출하는 헬퍼.
   * 재연결 카운터를 리셋하고 connected 이벤트를 발행한다.
   */
  protected onConnected(): void {
    this.connected = true;
    this.reconnectAttempts = 0;
    this.logger.log('연결 성공');
    this.emit('connected');
  }

  /**
   * 연결 해제 시 호출하는 헬퍼.
   * disconnected 이벤트를 발행하고, running 상태이면 재연결을 스케줄한다.
   */
  protected onDisconnected(reason?: string): void {
    this.connected = false;
    this.logger.warn(`연결 해제 - 사유: ${reason || '알 수 없음'}`);
    this.emit('disconnected', reason);

    if (this.running) {
      this.scheduleReconnect();
    }
  }

  /**
   * 시세 업데이트를 발행하는 헬퍼.
   */
  protected emitPriceUpdate(update: PriceUpdate): void {
    this.emit('priceUpdate', update);
  }

  // ===== 하위 클래스에서 구현해야 하는 추상 메서드 =====

  /** 실제 연결 수행 */
  protected abstract doConnect(): Promise<void>;

  /** 실제 연결 해제 수행 */
  protected abstract doDisconnect(): Promise<void>;

  /** 연결 후 추가 심볼을 구독 */
  protected abstract doSubscribe(symbols: string[]): void;

  /** 구독 중인 심볼을 해제 */
  protected abstract doUnsubscribe(symbols: string[]): void;
}
