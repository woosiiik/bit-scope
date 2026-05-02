/**
 * 코인원 REST 폴링 실시간 시세 클라이언트
 *
 * 코인원은 공개 WebSocket API를 제공하지 않으므로
 * REST API를 주기적으로 폴링하여 시세 데이터를 수신한다.
 * 시세 데이터는 공개 데이터이므로 API Key가 불필요하다.
 *
 * @see https://docs.coinone.co.kr/reference/public-ticker
 */

import { BaseExchangeClient } from './base-exchange.client';
import {
  COINONE_CONFIG,
  COINONE_ENDPOINTS,
  COINONE_POLLING_INTERVAL_MS,
} from '@bitscope/shared';
import type { PriceUpdate } from '@bitscope/shared';

/**
 * 코인원 REST ticker 응답 내 개별 코인 데이터 구조
 *
 * @see https://docs.coinone.co.kr/reference/public-ticker
 */
export interface CoinoneTickerItem {
  /** 마켓(쿼트) 통화 (예: "KRW") */
  quote_currency: string;
  /** 대상(타깃) 통화 (예: "BTC") */
  target_currency: string;
  /** 타임스탬프 (밀리초) */
  timestamp: number;
  /** 종가 (현재가) */
  last: string;
  /** 시가 */
  first: string;
  /** 고가 */
  high: string;
  /** 저가 */
  low: string;
  /** 24시간 거래량 */
  volume: string;
  /** 전일 종가 */
  yesterday_last: string;
  /** 전일 대비 변동금액 */
  yesterday_volume: string;
  /** 24시간 거래대금 */
  target_volume: string;
}

/**
 * 코인원 REST ticker API 전체 응답 구조
 */
export interface CoinoneTickerResponse {
  /** 응답 결과 ("0"이면 성공) */
  result: string;
  /** 오류 코드 */
  error_code: string;
  /** 서버 타임스탬프 (밀리초) */
  server_time: number;
  /** 각 코인의 시세 데이터 배열 */
  tickers: CoinoneTickerItem[];
}

/**
 * 코인원 REST 폴링 시세 클라이언트
 *
 * - 코인원 공개 REST API를 5초 간격으로 폴링
 * - WebSocket 기반 클라이언트와 동일한 인터페이스(BaseExchangeClient)를 구현
 * - 네트워크 오류 시 지수 백오프로 자동 재시도
 */
export class CoinonePollingClient extends BaseExchangeClient {
  /** 폴링 타이머 */
  private pollingTimer: ReturnType<typeof setInterval> | null = null;

  /** 폴링 간격 (밀리초) */
  private readonly pollingIntervalMs: number;

  /** 연속 오류 횟수 (너무 많으면 폴링 간격을 늘림) */
  private consecutiveErrors = 0;

  /** 최대 연속 오류 횟수 (이 횟수를 넘으면 재연결 로직 발동) */
  private readonly maxConsecutiveErrors = 10;

  /** AbortController for fetch 취소 */
  private abortController: AbortController | null = null;

  constructor(pollingIntervalMs?: number) {
    super('coinone');
    this.pollingIntervalMs =
      pollingIntervalMs ?? COINONE_POLLING_INTERVAL_MS;
  }

  /**
   * 코인원 REST 폴링을 시작한다.
   *
   * WebSocket 연결 대신 주기적인 REST API 호출로 시세를 수신한다.
   */
  protected async doConnect(): Promise<void> {
    this.stopPolling();
    this.consecutiveErrors = 0;

    // 최초 1회 즉시 호출
    await this.fetchTickers();

    // 주기적 폴링 시작
    this.startPolling();
    this.onConnected();
  }

  /**
   * REST 폴링을 중지한다.
   */
  protected async doDisconnect(): Promise<void> {
    this.stopPolling();

    // 진행 중인 fetch가 있으면 취소
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.connected = false;
  }

  /**
   * 구독 심볼 추가 시 즉시 1회 폴링을 수행한다.
   */
  protected doSubscribe(_symbols: string[]): void {
    // 새 심볼 추가 시 즉시 데이터 가져오기
    this.fetchTickers().catch((error) => {
      this.logger.error(
        '구독 추가 시 폴링 실패',
        error instanceof Error ? error.message : String(error),
      );
    });
  }

  /**
   * 구독 심볼 제거 시 특별한 작업이 필요 없다.
   * (다음 폴링에서 필터링이 적용된다)
   */
  protected doUnsubscribe(_symbols: string[]): void {
    // 코인원 REST 폴링은 전체 코인을 한 번에 조회하므로
    // 구독 해제 시 별도 처리가 필요 없다. 응답 데이터 중
    // subscribedSymbols에 포함된 것만 발행한다.
  }

  /**
   * 폴링 타이머를 시작한다.
   */
  private startPolling(): void {
    this.pollingTimer = setInterval(() => {
      this.fetchTickers().catch((error) => {
        this.logger.error(
          '폴링 오류',
          error instanceof Error ? error.message : String(error),
        );
      });
    }, this.pollingIntervalMs);

    this.logger.log(
      `REST 폴링 시작 - 간격: ${this.pollingIntervalMs}ms`,
    );
  }

  /**
   * 폴링 타이머를 중지한다.
   */
  private stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  /**
   * 코인원 REST API에서 시세 데이터를 조회한다.
   *
   * 구독 중인 심볼에 해당하는 시세만 PriceUpdate로 발행한다.
   */
  private async fetchTickers(): Promise<void> {
    const url = `${COINONE_CONFIG.restBaseUrl}${COINONE_ENDPOINTS.ticker}`;

    try {
      this.abortController = new AbortController();

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(
          `코인원 API 응답 오류: ${response.status} ${response.statusText}`,
        );
      }

      const data: CoinoneTickerResponse = await response.json();

      // 응답 결과 확인
      if (data.result !== '0') {
        throw new Error(
          `코인원 API 오류: result=${data.result}, error_code=${data.error_code}`,
        );
      }

      // 성공 시 연속 오류 카운터 리셋
      this.consecutiveErrors = 0;

      // 구독 중인 심볼에 해당하는 ticker만 처리
      const subscribedSet = new Set(
        this.subscribedSymbols.map((s) => s.toUpperCase()),
      );

      for (const ticker of data.tickers) {
        const symbol = ticker.target_currency.toUpperCase();

        if (subscribedSet.size > 0 && !subscribedSet.has(symbol)) {
          continue;
        }

        const priceUpdate = this.normalizeTicker(ticker);
        if (priceUpdate) {
          this.emitPriceUpdate(priceUpdate);
        }
      }
    } catch (error) {
      // AbortError는 정상적인 취소이므로 무시
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      this.consecutiveErrors++;
      this.logger.error(
        `코인원 시세 조회 실패 (연속 ${this.consecutiveErrors}회)`,
        error instanceof Error ? error.message : String(error),
      );

      // 연속 오류 횟수 초과 시 재연결 로직 발동
      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        this.logger.warn(
          `연속 오류 ${this.consecutiveErrors}회 초과 - 연결 재설정`,
        );
        this.stopPolling();
        this.onDisconnected('연속 폴링 오류 초과');
      }
    } finally {
      this.abortController = null;
    }
  }

  /**
   * 코인원 ticker 응답을 통일된 PriceUpdate 형식으로 변환한다.
   */
  private normalizeTicker(raw: CoinoneTickerItem): PriceUpdate | null {
    try {
      const symbol = raw.target_currency.toUpperCase();
      const price = parseFloat(raw.last);
      const volume24h = parseFloat(raw.volume);
      const yesterdayLast = parseFloat(raw.yesterday_last);

      // 유효하지 않은 데이터 필터링
      if (isNaN(price) || price <= 0) return null;

      // 변동률 계산: (현재가 - 전일종가) / 전일종가 * 100
      let changeRate = 0;
      if (!isNaN(yesterdayLast) && yesterdayLast > 0) {
        changeRate =
          ((price - yesterdayLast) / yesterdayLast) * 100;
      }

      return {
        exchange: 'coinone',
        symbol,
        price,
        changeRate,
        volume24h: isNaN(volume24h) ? 0 : volume24h,
        timestamp: raw.timestamp || Date.now(),
      };
    } catch (error) {
      this.logger.error(
        'ticker 정규화 오류',
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }
}
