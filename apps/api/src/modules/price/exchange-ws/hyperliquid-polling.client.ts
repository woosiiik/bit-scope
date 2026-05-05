/**
 * 하이퍼리퀴드 REST 폴링 시세 클라이언트
 *
 * 하이퍼리퀴드 공개 REST API(POST /info { type: "allMids" })를
 * 주기적으로 폴링하여 전체 Perps 시세 데이터를 수신한다.
 *
 * 알림 시스템에서 하이퍼리퀴드 코인(OIL, GOLD 등 포함)의
 * 가격 알림 트리거를 위해 사용된다.
 *
 * @see https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';

import type { ExchangeType, PriceUpdate } from '@bitscope/shared';
import { HYPERLIQUID_CONFIG } from '@bitscope/shared';

/** 폴링 간격 (밀리초) - 5초 */
const HYPERLIQUID_POLLING_INTERVAL_MS = 5_000;

@Injectable()
export class HyperliquidPollingClient extends EventEmitter implements OnModuleDestroy {
  private readonly logger = new Logger(HyperliquidPollingClient.name);

  /** 폴링 타이머 */
  private pollingTimer: ReturnType<typeof setInterval> | null = null;

  /** 연속 오류 횟수 */
  private consecutiveErrors = 0;

  /** AbortController for fetch 취소 */
  private abortController: AbortController | null = null;

  /** 구독 중인 심볼 목록 */
  private subscribedSymbols: string[] = [];

  /** 내부 가격 맵: 심볼 -> 가격 */
  private readonly priceMap = new Map<string, number>();

  /** 시작 상태 플래그 */
  private running = false;

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  getExchangeType(): ExchangeType {
    return 'hyperliquid';
  }

  /**
   * 하이퍼리퀴드 시세 폴링을 시작한다.
   *
   * @param symbols 구독할 코인 심볼 목록
   */
  async start(symbols: string[]): Promise<void> {
    this.subscribedSymbols = [...symbols];
    this.running = true;
    this.consecutiveErrors = 0;

    this.logger.log(
      `하이퍼리퀴드 시세 폴링 시작 - 심볼: [${symbols.join(', ')}]`,
    );

    // 최초 1회 즉시 호출
    await this.fetchPrices();

    // 주기적 폴링 시작
    this.pollingTimer = setInterval(() => {
      this.fetchPrices().catch((error) => {
        this.logger.error(
          '하이퍼리퀴드 폴링 오류',
          error instanceof Error ? error.message : String(error),
        );
      });
    }, HYPERLIQUID_POLLING_INTERVAL_MS);

    this.logger.log(
      `하이퍼리퀴드 REST 폴링 시작 - 간격: ${HYPERLIQUID_POLLING_INTERVAL_MS}ms`,
    );
  }

  async stop(): Promise<void> {
    this.running = false;

    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.logger.log('하이퍼리퀴드 시세 폴링 중지');
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
    this.logger.log(`하이퍼리퀴드 심볼 구독 추가: [${newSymbols.join(', ')}]`);
  }

  /**
   * 폴링 활성 여부를 반환한다.
   */
  isActive(): boolean {
    return this.running;
  }

  /**
   * 하이퍼리퀴드 REST API에서 전체 시세 데이터를 조회한다.
   *
   * POST /info { type: "allMids" } 응답: { "BTC": "67000.0", "ETH": "3500.0", ... }
   * 구독 중인 심볼만 PriceUpdate 이벤트로 발행한다.
   */
  private async fetchPrices(): Promise<void> {
    const url = `${HYPERLIQUID_CONFIG.restBaseUrl}/info`;

    try {
      this.abortController = new AbortController();

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'allMids' }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(
          `하이퍼리퀴드 API 응답 오류: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as Record<string, string>;

      // 성공 시 연속 오류 카운터 리셋
      this.consecutiveErrors = 0;

      const subscribedSet = new Set(
        this.subscribedSymbols.map((s) => s.toUpperCase()),
      );

      const now = Date.now();

      for (const [symbol, priceStr] of Object.entries(data)) {
        // @숫자 형태의 스팟 토큰 내부 인덱스는 제외
        if (symbol.startsWith('@')) {
          continue;
        }

        if (!subscribedSet.has(symbol.toUpperCase())) {
          continue;
        }

        const price = parseFloat(priceStr);
        if (isNaN(price) || price <= 0) {
          continue;
        }

        const prevPrice = this.priceMap.get(symbol) ?? 0;
        this.priceMap.set(symbol, price);

        // PriceUpdate 이벤트 발행
        const update: PriceUpdate = {
          exchange: 'hyperliquid',
          symbol: symbol.toUpperCase(),
          price,
          changeRate: prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0,
          volume24h: 0,
          timestamp: now,
        };

        this.emit('priceUpdate', update);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      this.consecutiveErrors++;
      if (this.consecutiveErrors === 1 || this.consecutiveErrors % 10 === 0) {
        const errDetail = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `하이퍼리퀴드 시세 조회 실패 (연속 ${this.consecutiveErrors}회): ${errDetail}`,
        );
      }
    } finally {
      this.abortController = null;
    }
  }
}
