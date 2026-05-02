/**
 * 업비트 WebSocket 실시간 시세 클라이언트
 *
 * 업비트 공개 WebSocket API에 연결하여 실시간 시세(ticker) 데이터를 수신한다.
 * 시세 데이터는 공개 데이터이므로 API Key가 불필요하다.
 *
 * @see https://docs.upbit.com/docs/upbit-quotation-websocket
 */

import WebSocket from 'ws';

import { BaseExchangeClient } from './base-exchange.client';
import {
  UPBIT_CONFIG,
  UPBIT_KRW_MARKET_PREFIX,
} from '@bitscope/shared';
import type { PriceUpdate } from '@bitscope/shared';

/**
 * 업비트 WebSocket ticker 응답 데이터 구조
 *
 * @see https://docs.upbit.com/docs/upbit-quotation-websocket
 */
export interface UpbitWsTickerResponse {
  /** 메시지 타입 (ticker) */
  type: string;
  /** 마켓 코드 (예: "KRW-BTC") */
  code: string;
  /** 현재가 */
  trade_price: number;
  /** 시가 */
  opening_price: number;
  /** 고가 */
  high_price: number;
  /** 저가 */
  low_price: number;
  /** 전일 종가 */
  prev_closing_price: number;
  /** 24시간 누적 거래량 */
  acc_trade_volume_24h: number;
  /** 24시간 누적 거래대금 */
  acc_trade_price_24h: number;
  /** 부호 있는 변화율 */
  signed_change_rate: number;
  /** 부호 있는 변화액 */
  signed_change_price: number;
  /** 타임스탬프 (밀리초) */
  timestamp: number;
}

/**
 * 업비트 WebSocket 실시간 시세 클라이언트
 *
 * - 업비트 WebSocket API(wss://api.upbit.com/websocket/v1)에 연결
 * - KRW 마켓 코인의 ticker 데이터를 실시간 수신
 * - 연결 끊김 시 지수 백오프로 자동 재연결 (최대 5회)
 */
export class UpbitWsClient extends BaseExchangeClient {
  private ws: WebSocket | null = null;

  /** ping/pong 헬스체크 타이머 */
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  /** ping 간격 (밀리초) - 업비트는 120초 이내에 PING을 보내야 연결 유지 */
  private readonly pingIntervalMs = 60_000;

  constructor() {
    super('upbit');
  }

  /**
   * 업비트 WebSocket에 연결하고 ticker 구독을 시작한다.
   */
  protected async doConnect(): Promise<void> {
    const wsUrl = UPBIT_CONFIG.wsUrl;
    if (!wsUrl) {
      throw new Error('업비트 WebSocket URL이 설정되지 않았습니다.');
    }

    return new Promise<void>((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
          this.onConnected();
          this.sendSubscription(this.subscribedSymbols);
          this.startPingInterval();
          resolve();
        });

        this.ws.on('message', (data: WebSocket.RawData) => {
          this.handleMessage(data);
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          this.stopPingInterval();
          this.onDisconnected(`code=${code}, reason=${reason.toString()}`);
        });

        this.ws.on('error', (error: Error) => {
          this.logger.error(`WebSocket 오류: ${error.message}`);
          this.emit('error', error);
          // error 이벤트 이후 close가 자동으로 발생하므로 여기서 reject
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * WebSocket 연결을 해제한다.
   */
  protected async doDisconnect(): Promise<void> {
    this.stopPingInterval();

    if (this.ws) {
      // readyState가 OPEN 또는 CONNECTING인 경우에만 close 호출
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close(1000, 'Client disconnect');
      }
      this.ws.removeAllListeners();
      this.ws = null;
    }

    this.connected = false;
  }

  /**
   * 심볼을 업비트 ticker 구독에 추가한다.
   *
   * 업비트 WebSocket은 구독 변경 시 전체 구독 메시지를 다시 보내야 한다.
   */
  protected doSubscribe(_symbols: string[]): void {
    // 업비트는 구독 추가 시 전체 심볼을 다시 전송해야 한다
    this.sendSubscription(this.subscribedSymbols);
  }

  /**
   * 심볼 구독을 해제한다.
   *
   * 업비트 WebSocket은 구독 변경 시 전체 구독 메시지를 다시 보내야 한다.
   */
  protected doUnsubscribe(_symbols: string[]): void {
    // 남은 심볼로 재구독
    this.sendSubscription(this.subscribedSymbols);
  }

  /**
   * 업비트 WebSocket 구독 메시지를 전송한다.
   *
   * 업비트는 JSON 배열 형태의 구독 메시지를 사용한다:
   * [{"ticket":"..."}, {"type":"ticker","codes":["KRW-BTC","KRW-ETH"]}]
   */
  private sendSubscription(symbols: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logger.warn('WebSocket이 열려있지 않아 구독을 전송할 수 없습니다.');
      return;
    }

    if (symbols.length === 0) {
      this.logger.warn('구독할 심볼이 없습니다.');
      return;
    }

    // 심볼을 업비트 마켓 코드 형태로 변환 (예: "BTC" -> "KRW-BTC")
    const marketCodes = symbols.map(
      (symbol) => `${UPBIT_KRW_MARKET_PREFIX}${symbol}`,
    );

    const subscriptionMessage = JSON.stringify([
      { ticket: `bitscope-${Date.now()}` },
      {
        type: 'ticker',
        codes: marketCodes,
        isOnlyRealtime: true,
      },
    ]);

    this.ws.send(subscriptionMessage);
    this.logger.log(
      `ticker 구독 전송 - 마켓: [${marketCodes.join(', ')}]`,
    );
  }

  /**
   * WebSocket 메시지를 처리한다.
   *
   * 업비트는 바이너리(Buffer) 형태로 JSON 데이터를 전송한다.
   */
  private handleMessage(data: WebSocket.RawData): void {
    try {
      // 업비트 WebSocket은 바이너리로 데이터를 전송
      const jsonStr =
        data instanceof Buffer
          ? data.toString('utf-8')
          : String(data);

      const parsed: UpbitWsTickerResponse = JSON.parse(jsonStr);

      // ticker 타입 메시지만 처리
      if (parsed.type !== 'ticker') return;

      const priceUpdate = this.normalizeTicker(parsed);
      this.emitPriceUpdate(priceUpdate);
    } catch (error) {
      this.logger.error(
        '메시지 파싱 오류',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * 업비트 ticker 응답을 통일된 PriceUpdate 형식으로 변환한다.
   */
  private normalizeTicker(raw: UpbitWsTickerResponse): PriceUpdate {
    // 마켓 코드에서 심볼 추출 (예: "KRW-BTC" -> "BTC")
    const symbol = raw.code.replace(UPBIT_KRW_MARKET_PREFIX, '');

    return {
      exchange: 'upbit',
      symbol,
      price: raw.trade_price,
      changeRate: raw.signed_change_rate * 100, // 비율 -> 퍼센트
      volume24h: raw.acc_trade_volume_24h,
      timestamp: raw.timestamp,
    };
  }

  /**
   * 주기적으로 PING 메시지를 전송하여 연결을 유지한다.
   *
   * 업비트 WebSocket은 120초 동안 데이터가 없으면 연결을 끊으므로
   * 주기적으로 PING을 전송한다.
   */
  private startPingInterval(): void {
    this.stopPingInterval();

    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, this.pingIntervalMs);
  }

  /** PING 타이머를 중지한다. */
  private stopPingInterval(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
