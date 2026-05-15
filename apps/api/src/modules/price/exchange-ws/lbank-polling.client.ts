/**
 * LBank REST 폴링 시세 클라이언트
 *
 * LBank 공개 REST API를 주기적으로 폴링하여 USDT 마켓 시세 데이터를 수신한다.
 * 국내 거래소와의 김치 프리미엄 비교를 위한 해외 시세 수집 전용 클라이언트이다.
 *
 * LBank API는 공개 API이므로 인증이 불필요하다.
 *
 * @see https://github.com/LBank-exchange/lbank-official-api-docs
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';
import type { PriceUpdate } from '@bitscope/shared';
import { LBANK_CONFIG, LBANK_ENDPOINTS, LBANK_POLLING_INTERVAL_MS } from '@bitscope/shared';

/** LBank ticker/24hr 응답 항목 */
export interface LbankTickerItem {
  symbol: string;
  ticker: {
    change: number;
    high: number;
    latest: number;
    low: number;
    turnover: number;
    vol: number;
  };
  timestamp: number;
}

/** LBank 시세 항목 (정규화 후) */
export interface LbankPriceEntry {
  /** 코인 심볼 (예: "BTC") - USDT 마켓 기준으로 접미사 제거 */
  symbol: string;
  /** USDT 가격 */
  usdtPrice: number;
  /** 타임스탬프 (밀리초) */
  timestamp: number;
}

/**
 * LBank REST 폴링 시세 클라이언트
 *
 * - LBank 공개 REST API를 5초 간격으로 폴링
 * - USDT 마켓 시세만 수집 (김프 계산용)
 * - 네트워크 오류 시 로그 스팸 방지
 */
@Injectable()
export class LbankPollingClient extends EventEmitter implements OnModuleDestroy {
  private readonly logger = new Logger(LbankPollingClient.name);

  /** 폴링 타이머 */
  private pollingTimer: ReturnType<typeof setInterval> | null = null;

  /** 폴링 간격 (밀리초) */
  private readonly pollingIntervalMs: number;

  /** 연속 오류 횟수 */
  private consecutiveErrors = 0;

  /** AbortController for fetch 취소 */
  private abortController: AbortController | null = null;

  /** 구독 중인 심볼 목록 (예: ["BTC", "ETH"]) */
  private subscribedSymbols: string[] = [];

  /** 내부 가격 맵: 심볼 -> LbankPriceEntry */
  private readonly priceMap = new Map<string, LbankPriceEntry>();

  /** 시작 상태 플래그 */
  private running = false;

  constructor() {
    super();
    this.pollingIntervalMs = LBANK_POLLING_INTERVAL_MS;
  }

  /**
   * 모듈 종료 시 폴링을 중지한다.
   */
  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  /**
   * LBank 시세 폴링을 시작한다.
   *
   * @param symbols 구독할 코인 심볼 목록 (예: ["BTC", "ETH"])
   */
  async start(symbols: string[]): Promise<void> {
    this.subscribedSymbols = [...symbols];
    this.running = true;
    this.consecutiveErrors = 0;

    this.logger.log(
      `LBank 시세 폴링 시작 - 심볼: [${symbols.join(', ')}]`,
    );

    // 최초 1회 즉시 호출
    await this.fetchTickers();

    // 주기적 폴링 시작
    this.startPolling();
  }

  /**
   * LBank 시세 폴링을 중지한다.
   */
  async stop(): Promise<void> {
    this.running = false;
    this.stopPolling();

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.logger.log('LBank 시세 폴링 중지');
  }

  /**
   * 구독 심볼을 추가한다.
   */
  subscribe(symbols: string[]): void {
    const newSymbols = symbols.filter(
      (s) => !this.subscribedSymbols.includes(s),
    );
    if (newSymbols.length === 0) return;

    this.subscribedSymbols.push(...newSymbols);
    this.logger.log(`LBank 심볼 구독 추가: [${newSymbols.join(', ')}]`);
  }

  /**
   * 특정 심볼의 현재 LBank USDT 가격을 조회한다.
   *
   * @param symbol 코인 심볼 (예: "BTC")
   * @returns LBank 가격 정보 또는 null
   */
  getPrice(symbol: string): LbankPriceEntry | null {
    return this.priceMap.get(symbol.toUpperCase()) ?? null;
  }

  /**
   * 전체 LBank 가격 맵을 반환한다.
   */
  getAllPrices(): Map<string, LbankPriceEntry> {
    return new Map(this.priceMap);
  }

  /**
   * 폴링 활성 여부를 반환한다.
   */
  isActive(): boolean {
    return this.running;
  }

  /**
   * 폴링 타이머를 시작한다.
   */
  private startPolling(): void {
    this.pollingTimer = setInterval(() => {
      this.fetchTickers().catch((error) => {
        this.logger.error(
          'LBank 폴링 오류',
          error instanceof Error ? error.message : String(error),
        );
      });
    }, this.pollingIntervalMs);

    this.logger.log(
      `LBank REST 폴링 시작 - 간격: ${this.pollingIntervalMs}ms`,
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
   * LBank REST API에서 전체 시세 데이터를 조회한다.
   *
   * 구독 중인 심볼의 USDT 마켓 가격만 내부 맵에 저장한다.
   */
  private async fetchTickers(): Promise<void> {
    const url = `${LBANK_CONFIG.restBaseUrl}${LBANK_ENDPOINTS.ticker}?symbol=all`;

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
          `LBank API 응답 오류: ${response.status} ${response.statusText}`,
        );
      }

      const rawData = (await response.json()) as { data: LbankTickerItem[] };
      const data = rawData?.data;

      if (!Array.isArray(data)) {
        throw new Error('LBank API 응답 형식이 예상과 다릅니다.');
      }

      // 성공 시 연속 오류 카운터 리셋
      this.consecutiveErrors = 0;

      // 구독 중인 심볼의 USDT 마켓만 필터링
      const subscribedSet = new Set(
        this.subscribedSymbols.map((s) => `${s.toLowerCase()}_usdt`),
      );

      const now = Date.now();

      for (const item of data) {
        if (!item.symbol?.endsWith('_usdt')) {
          continue;
        }

        if (!subscribedSet.has(item.symbol)) {
          continue;
        }

        // "eth_usdt" -> "ETH"
        const coinSymbol = item.symbol.split('_')[0]!.toUpperCase();
        const usdtPrice = item.ticker?.latest;

        if (!usdtPrice || usdtPrice <= 0) {
          continue;
        }

        const prevPrice = this.priceMap.get(coinSymbol)?.usdtPrice ?? 0;

        const entry: LbankPriceEntry = {
          symbol: coinSymbol,
          usdtPrice,
          timestamp: now,
        };

        this.priceMap.set(coinSymbol, entry);

        // 알림 시스템용 priceUpdate 이벤트 발행
        const priceUpdate: PriceUpdate = {
          exchange: 'lbank',
          symbol: coinSymbol,
          price: usdtPrice,
          changeRate: prevPrice > 0 ? ((usdtPrice - prevPrice) / prevPrice) * 100 : 0,
          volume24h: item.ticker?.vol || 0,
          timestamp: now,
        };
        this.emit('priceUpdate', priceUpdate);
      }
    } catch (error) {
      // AbortError는 정상적인 취소이므로 무시
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      this.consecutiveErrors++;
      // 첫 번째와 10회마다만 로그 출력 (로그 스팸 방지)
      if (this.consecutiveErrors === 1 || this.consecutiveErrors % 10 === 0) {
        const errDetail = error instanceof Error
          ? `${error.message} / cause: ${(error as NodeJS.ErrnoException).cause ?? 'none'} / code: ${(error as NodeJS.ErrnoException).code ?? 'none'}`
          : String(error);
        this.logger.warn(
          `LBank 시세 조회 실패 (연속 ${this.consecutiveErrors}회): ${errDetail} / url: ${url}`,
        );
      }
    } finally {
      this.abortController = null;
    }
  }
}
