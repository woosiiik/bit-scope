/**
 * 빗썸 WebSocket 실시간 시세 클라이언트
 *
 * 빗썸 공개 WebSocket API에 연결하여 실시간 시세(ticker) 데이터를 수신한다.
 * 시세 데이터는 공개 데이터이므로 API Key가 불필요하다.
 *
 * @see https://apidocs.bithumb.com/docs/websocket-public
 */

import WebSocket from 'ws';

import { BaseExchangeClient } from './base-exchange.client';
import { BITHUMB_CONFIG } from '@bitscope/shared';
import type { PriceUpdate } from '@bitscope/shared';

/**
 * 빗썸 WebSocket ticker 응답 데이터 구조
 *
 * 빗썸 WebSocket은 구독 후 content 배열에 시세 정보를 전달한다.
 *
 * @see https://apidocs.bithumb.com/docs/websocket-public
 */
export interface BithumbWsTickerResponse {
  /** 응답 타입 (예: "ticker") */
  type: string;
  content: {
    /** 심볼 (예: "BTC_KRW") */
    symbol: string;
    /** 종가 (현재가) */
    closePrice: string;
    /** 시가 */
    openPrice: string;
    /** 고가 */
    highPrice: string;
    /** 저가 */
    lowPrice: string;
    /** 전일종가 */
    prevClosePrice: string;
    /** 24시간 누적 거래량 */
    volume: string;
    /** 24시간 누적 거래대금 */
    value: string;
    /** 전일 대비 변동률 */
    chgRate: string;
    /** 전일 대비 변동금액 */
    chgAmt: string;
    /** 체결 시각 (HHmmss) */
    time: string;
    /** 일자 (yyyyMMdd) */
    date: string;
  };
}

/**
 * 빗썸 WebSocket 구독 필터 타입
 */
type BithumbTickType = '30M' | '1H' | '12H' | '24H' | 'MID';

/**
 * 빗썸 WebSocket 실시간 시세 클라이언트
 *
 * - 빗썸 WebSocket API(wss://pubwss.bithumb.com/pub/ws)에 연결
 * - KRW 마켓 코인의 ticker 데이터를 실시간 수신
 * - 연결 끊김 시 지수 백오프로 자동 재연결 (최대 5회)
 */
export class BithumbWsClient extends BaseExchangeClient {
  private ws: WebSocket | null = null;

  /** ping/pong 헬스체크 타이머 */
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  /** ping 간격 (밀리초) */
  private readonly pingIntervalMs = 30_000;

  /** 빗썸 ticker 구독 유형 */
  private readonly tickTypes: BithumbTickType[] = ['24H'];

  constructor() {
    super('bithumb');
  }

  /**
   * 빗썸 WebSocket에 연결하고 ticker 구독을 시작한다.
   */
  protected async doConnect(): Promise<void> {
    const wsUrl = BITHUMB_CONFIG.wsUrl;
    if (!wsUrl) {
      throw new Error('빗썸 WebSocket URL이 설정되지 않았습니다.');
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
   * 심볼 구독을 추가한다.
   *
   * 빗썸 WebSocket은 심볼별로 개별 구독 메시지를 보내야 한다.
   */
  protected doSubscribe(symbols: string[]): void {
    this.sendSubscription(symbols);
  }

  /**
   * 심볼 구독을 해제한다.
   *
   * 빗썸 WebSocket은 명시적인 구독 해제 기능이 없으므로,
   * 연결을 재설정하여 전체 구독을 갱신한다.
   */
  protected doUnsubscribe(_symbols: string[]): void {
    // 빗썸은 구독 해제를 직접 지원하지 않으므로 전체 재구독
    this.sendSubscription(this.subscribedSymbols);
  }

  /**
   * 빗썸 WebSocket 구독 메시지를 전송한다.
   *
   * 빗썸은 다음과 같은 JSON 형태의 구독 메시지를 사용한다:
   * {"type":"ticker","symbols":["BTC_KRW","ETH_KRW"],"tickTypes":["24H"]}
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

    // 심볼을 빗썸 형식으로 변환 (예: "BTC" -> "BTC_KRW")
    const bithumbSymbols = symbols.map((symbol) => `${symbol}_KRW`);

    const subscriptionMessage = JSON.stringify({
      type: 'ticker',
      symbols: bithumbSymbols,
      tickTypes: this.tickTypes,
    });

    this.ws.send(subscriptionMessage);
    this.logger.log(
      `ticker 구독 전송 - 심볼: [${bithumbSymbols.join(', ')}]`,
    );
  }

  /**
   * WebSocket 메시지를 처리한다.
   *
   * 빗썸 WebSocket은 문자열(JSON) 형태로 데이터를 전송한다.
   */
  private handleMessage(data: WebSocket.RawData): void {
    try {
      const jsonStr =
        data instanceof Buffer
          ? data.toString('utf-8')
          : String(data);

      const parsed = JSON.parse(jsonStr);

      // 구독 확인 응답 등 status 메시지는 무시
      if (parsed.status) {
        this.logger.log(
          `빗썸 상태 메시지: ${parsed.status} - ${parsed.resmsg || ''}`,
        );
        return;
      }

      // ticker 타입 메시지만 처리
      if (parsed.type !== 'ticker' || !parsed.content) return;

      const priceUpdate = this.normalizeTicker(parsed as BithumbWsTickerResponse);
      if (priceUpdate) {
        this.emitPriceUpdate(priceUpdate);
      }
    } catch (error) {
      this.logger.error(
        '메시지 파싱 오류',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * 빗썸 ticker 응답을 통일된 PriceUpdate 형식으로 변환한다.
   */
  private normalizeTicker(raw: BithumbWsTickerResponse): PriceUpdate | null {
    try {
      const content = raw.content;

      // 심볼 추출 (예: "BTC_KRW" -> "BTC")
      const symbol = content.symbol.replace('_KRW', '');

      const price = parseFloat(content.closePrice);
      const changeRate = parseFloat(content.chgRate);
      const volume24h = parseFloat(content.volume);

      // 유효하지 않은 데이터 필터링
      if (isNaN(price) || price <= 0) return null;

      // 빗썸의 date + time으로 타임스탬프 생성
      const dateStr = content.date; // "yyyyMMdd"
      const timeStr = content.time; // "HHmmss"
      const timestamp = this.parseBithumbTimestamp(dateStr, timeStr);

      return {
        exchange: 'bithumb',
        symbol,
        price,
        changeRate: isNaN(changeRate) ? 0 : changeRate,
        volume24h: isNaN(volume24h) ? 0 : volume24h,
        timestamp,
      };
    } catch (error) {
      this.logger.error(
        'ticker 정규화 오류',
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  /**
   * 빗썸 날짜/시간 문자열을 밀리초 타임스탬프로 변환한다.
   */
  private parseBithumbTimestamp(dateStr: string, timeStr: string): number {
    try {
      // "yyyyMMdd" + "HHmmss" -> ISO 형식
      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      const hour = timeStr.substring(0, 2);
      const minute = timeStr.substring(2, 4);
      const second = timeStr.substring(4, 6);

      const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}+09:00`;
      return new Date(isoString).getTime();
    } catch {
      return Date.now();
    }
  }

  /**
   * 주기적으로 PING을 전송하여 연결을 유지한다.
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
