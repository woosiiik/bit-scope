/**
 * PriceMonitorService - 실시간 시세 모니터링 서비스
 *
 * 거래소 WebSocket/REST 클라이언트로부터 수신한 시세 데이터를 관리한다.
 * 내부 가격 맵을 유지하고, 시세 업데이트 이벤트를 구독자에게 전달한다.
 *
 * @see 설계 문서 3.3.1 PriceMonitorService
 * @see 요구사항 12.9, 12.10
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type { ExchangeType, PriceUpdate } from '@bitscope/shared';
import { MAJOR_COIN_SYMBOLS, UPBIT_CONFIG } from '@bitscope/shared';

import { UpbitWsClient } from './exchange-ws/upbit-ws.client';
import { BithumbWsClient } from './exchange-ws/bithumb-ws.client';
import { CoinonePollingClient } from './exchange-ws/coinone-polling.client';
import { BinancePollingClient } from './exchange-ws/binance-polling.client';
import type { BinancePriceEntry } from './exchange-ws/binance-polling.client';
import { BaseExchangeClient } from './exchange-ws/base-exchange.client';

/** 거래소+심볼 조합의 가격 키 (예: "upbit:BTC") */
type PriceKey = `${ExchangeType}:${string}`;

/** 내부 가격 맵의 항목 구조 */
export interface PriceEntry {
  exchange: ExchangeType;
  symbol: string;
  price: number;
  changeRate: number;
  volume24h: number;
  timestamp: number;
  /** 마지막으로 업데이트된 시각 (로컬) */
  updatedAt: number;
}

/** PriceMonitorService가 발행하는 이벤트명 상수 */
export const PRICE_EVENTS = {
  /** 개별 시세 업데이트 이벤트 */
  PRICE_UPDATE: 'price.update',
  /** 모니터링 시작 이벤트 */
  MONITORING_STARTED: 'price.monitoring.started',
  /** 모니터링 중지 이벤트 */
  MONITORING_STOPPED: 'price.monitoring.stopped',
} as const;

@Injectable()
export class PriceMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PriceMonitorService.name);

  /** 내부 가격 맵: "거래소:심볼" -> PriceEntry */
  private readonly priceMap = new Map<PriceKey, PriceEntry>();

  /** 거래소별 시세 클라이언트 목록 */
  private readonly exchangeClients: BaseExchangeClient[];

  /** 모니터링 활성 여부 */
  private isMonitoring = false;

  /** USDT/KRW 환율 (업비트 KRW-USDT 마켓 시세 기준) */
  private usdtKrwRate = 0;

  /** USDT/KRW 환율 마지막 업데이트 시각 */
  private usdtKrwRateUpdatedAt = 0;

  /** USDT/KRW 폴링 타이머 */
  private usdtKrwTimer: ReturnType<typeof setInterval> | null = null;

  /** USDT/KRW 폴링 간격 (밀리초) - 5초 */
  private readonly USDT_KRW_POLLING_INTERVAL_MS = 5_000;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly upbitClient: UpbitWsClient,
    private readonly bithumbClient: BithumbWsClient,
    private readonly coinoneClient: CoinonePollingClient,
    private readonly binanceClient: BinancePollingClient,
  ) {
    this.exchangeClients = [
      this.upbitClient,
      this.bithumbClient,
      this.coinoneClient,
    ];
  }

  /**
   * 모듈 초기화 시 시세 모니터링을 자동 시작한다.
   */
  async onModuleInit(): Promise<void> {
    await this.startMonitoring();
  }

  /**
   * 모듈 종료 시 시세 모니터링을 중지한다.
   */
  async onModuleDestroy(): Promise<void> {
    await this.stopMonitoring();
  }

  /**
   * 시세 모니터링을 시작한다.
   *
   * 모든 거래소 클라이언트에 시세 업데이트 이벤트를 바인딩하고,
   * 주요 코인 심볼에 대한 시세 수신을 시작한다.
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      this.logger.warn('이미 시세 모니터링이 진행 중입니다.');
      return;
    }

    this.logger.log('시세 모니터링 시작');

    // 기존 이벤트 핸들러를 모두 제거한 후 재등록하여 중복 등록을 방지한다.
    for (const client of this.exchangeClients) {
      client.removeAllListeners();

      client.on('priceUpdate', (update: PriceUpdate) => {
        this.handlePriceUpdate(update);
      });

      client.on('error', (error: Error) => {
        this.logger.error(
          `${client.getExchangeType()} 클라이언트 오류: ${error.message}`,
        );
      });

      client.on('connected', () => {
        this.logger.log(`${client.getExchangeType()} 클라이언트 연결됨`);
      });

      client.on('disconnected', (reason?: string) => {
        this.logger.warn(
          `${client.getExchangeType()} 클라이언트 연결 해제: ${reason || '알 수 없음'}`,
        );
      });
    }

    // 주요 코인 심볼로 모니터링 시작
    const symbols = [...MAJOR_COIN_SYMBOLS];

    // 각 거래소별로 병렬 시작 (개별 실패 시에도 나머지는 정상 시작)
    const results = await Promise.allSettled(
      this.exchangeClients.map((client) => client.start(symbols)),
    );

    results.forEach((result, i) => {
      const client = this.exchangeClients[i];
      if (!client) return;
      const exchange = client.getExchangeType();

      if (result.status === 'rejected') {
        this.logger.error(
          `${exchange} 시세 수신 시작 실패: ${result.reason}`,
        );
      } else {
        this.logger.log(`${exchange} 시세 수신 시작 성공`);
      }
    });

    // 바이낸스 시세 폴링 시작 (김치 프리미엄 비교용)
    try {
      await this.binanceClient.start(symbols);
      this.logger.log('바이낸스 시세 수신 시작 성공');
    } catch (error) {
      this.logger.error(
        `바이낸스 시세 수신 시작 실패: ${error}`,
      );
    }

    // USDT/KRW 환율 폴링 시작
    await this.fetchUsdtKrwRate();
    this.startUsdtKrwPolling();

    this.isMonitoring = true;
    this.eventEmitter.emit(PRICE_EVENTS.MONITORING_STARTED);
    this.logger.log('시세 모니터링 시작 완료');
  }

  /**
   * 시세 모니터링을 중지한다.
   *
   * 모든 거래소 클라이언트의 시세 수신을 중지하고,
   * 이벤트 핸들러를 제거한다.
   */
  async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    this.logger.log('시세 모니터링 중지');

    // 모든 클라이언트 중지
    await Promise.allSettled(
      this.exchangeClients.map((client) => client.stop()),
    );

    // 바이낸스 폴링 중지
    await this.binanceClient.stop();

    // USDT/KRW 폴링 중지
    this.stopUsdtKrwPolling();

    // 이벤트 핸들러 제거
    for (const client of this.exchangeClients) {
      client.removeAllListeners();
    }

    this.isMonitoring = false;
    this.eventEmitter.emit(PRICE_EVENTS.MONITORING_STOPPED);
    this.logger.log('시세 모니터링 중지 완료');
  }

  /**
   * 특정 거래소+심볼의 현재 가격을 조회한다.
   *
   * @param exchange 거래소 타입
   * @param symbol 코인 심볼 (예: "BTC")
   * @returns 가격 정보 또는 null (데이터가 없는 경우)
   */
  getCurrentPrice(exchange: ExchangeType, symbol: string): PriceEntry | null {
    const key: PriceKey = `${exchange}:${symbol}`;
    return this.priceMap.get(key) ?? null;
  }

  /**
   * 전체 가격 맵을 조회한다.
   *
   * @returns 모든 거래소+심볼의 가격 정보 맵
   */
  getAllPrices(): Map<string, PriceEntry> {
    return new Map(this.priceMap);
  }

  /**
   * 특정 심볼의 모든 거래소 가격을 조회한다.
   *
   * @param symbol 코인 심볼 (예: "BTC")
   * @returns 거래소별 가격 정보 배열
   */
  getPricesBySymbol(symbol: string): PriceEntry[] {
    const entries: PriceEntry[] = [];

    for (const [key, entry] of this.priceMap) {
      if (key.endsWith(`:${symbol}`)) {
        entries.push(entry);
      }
    }

    return entries;
  }

  /**
   * 심볼을 모든 거래소에 추가 구독한다.
   *
   * @param symbols 추가 구독할 심볼 목록
   */
  subscribeToSymbols(symbols: string[]): void {
    for (const client of this.exchangeClients) {
      client.subscribe(symbols);
    }

    this.logger.log(`심볼 구독 추가: [${symbols.join(', ')}]`);
  }

  /**
   * 심볼을 모든 거래소에서 구독 해제한다.
   *
   * @param symbols 구독 해제할 심볼 목록
   */
  unsubscribeFromSymbols(symbols: string[]): void {
    for (const client of this.exchangeClients) {
      client.unsubscribe(symbols);
    }

    // 가격 맵에서도 제거
    for (const symbol of symbols) {
      for (const exchange of ['upbit', 'bithumb', 'coinone', 'binance'] as ExchangeType[]) {
        this.priceMap.delete(`${exchange}:${symbol}`);
      }
    }

    this.logger.log(`심볼 구독 해제: [${symbols.join(', ')}]`);
  }

  /**
   * 모니터링 활성 여부를 반환한다.
   */
  isActive(): boolean {
    return this.isMonitoring;
  }

  /**
   * 특정 심볼의 바이낸스 USDT 가격을 조회한다.
   *
   * @param symbol 코인 심볼 (예: "BTC")
   * @returns 바이낸스 가격 정보 또는 null
   */
  getBinancePrice(symbol: string): BinancePriceEntry | null {
    return this.binanceClient.getPrice(symbol);
  }

  /**
   * 현재 USDT/KRW 환율을 반환한다.
   *
   * 업비트 KRW-USDT 마켓 시세를 기반으로 한다.
   * 환율 데이터가 없으면 0을 반환한다.
   *
   * @returns USDT/KRW 환율
   */
  getUsdtKrwRate(): number {
    return this.usdtKrwRate;
  }

  /**
   * USDT/KRW 환율 폴링을 시작한다.
   */
  private startUsdtKrwPolling(): void {
    this.usdtKrwTimer = setInterval(() => {
      this.fetchUsdtKrwRate().catch((error) => {
        this.logger.error(
          'USDT/KRW 환율 조회 실패',
          error instanceof Error ? error.message : String(error),
        );
      });
    }, this.USDT_KRW_POLLING_INTERVAL_MS);

    this.logger.log(
      `USDT/KRW 환율 폴링 시작 - 간격: ${this.USDT_KRW_POLLING_INTERVAL_MS}ms`,
    );
  }

  /**
   * USDT/KRW 환율 폴링을 중지한다.
   */
  private stopUsdtKrwPolling(): void {
    if (this.usdtKrwTimer) {
      clearInterval(this.usdtKrwTimer);
      this.usdtKrwTimer = null;
    }
  }

  /**
   * 업비트 공개 API에서 USDT/KRW 현재가를 조회한다.
   *
   * @see https://docs.upbit.com/reference/ticker%ED%98%84%EC%9E%AC%EA%B0%80-%EC%A0%95%EB%B3%B4
   */
  private async fetchUsdtKrwRate(): Promise<void> {
    const url = `${UPBIT_CONFIG.restBaseUrl}/ticker?markets=KRW-USDT`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new Error(
          `업비트 USDT/KRW 조회 오류: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as Array<{
        market: string;
        trade_price: number;
      }>;

      if (Array.isArray(data) && data.length > 0 && data[0]) {
        const tradePrice = data[0].trade_price;
        if (typeof tradePrice === 'number' && tradePrice > 0) {
          this.usdtKrwRate = tradePrice;
          this.usdtKrwRateUpdatedAt = Date.now();
        }
      }
    } catch (error) {
      this.logger.error(
        'USDT/KRW 환율 조회 실패',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * 시세 업데이트를 처리하는 내부 핸들러.
   *
   * 가격 맵을 업데이트하고, EventEmitter2를 통해 이벤트를 발행한다.
   */
  private handlePriceUpdate(update: PriceUpdate): void {
    const key: PriceKey = `${update.exchange}:${update.symbol}`;

    const entry: PriceEntry = {
      exchange: update.exchange,
      symbol: update.symbol,
      price: update.price,
      changeRate: update.changeRate,
      volume24h: update.volume24h,
      timestamp: update.timestamp,
      updatedAt: Date.now(),
    };

    this.priceMap.set(key, entry);

    // EventEmitter2를 통해 시세 업데이트 이벤트 발행
    // (WebSocket Gateway, AlertService 등이 구독)
    this.eventEmitter.emit(PRICE_EVENTS.PRICE_UPDATE, update);
  }
}
