/**
 * 선물 마켓 데이터 수집 서비스
 *
 * 바이낸스 Futures 공개 API에서 5가지 지표를 주기적으로 수집한다.
 * 인증 불필요, 인메모리 캐시에 저장한다.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import type {
  LongShortRatioEntry,
  TakerBuySellEntry,
  OpenInterestEntry,
  FundingRateEntry,
  TopTraderRatioEntry,
  CachedFuturesData,
} from '@bitscope/shared';

/** 바이낸스 Futures API base URL */
const FAPI_BASE = 'https://fapi.binance.com';

/** 수집 간격 (3분) */
const COLLECT_INTERVAL_MS = 3 * 60 * 1000;

/** 기본 수집 심볼 */
const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT'];

@Injectable()
export class FuturesCollectorService implements OnModuleInit {
  private readonly logger = new Logger(FuturesCollectorService.name);

  /** 인메모리 캐시: symbol -> CachedFuturesData */
  private readonly cache = new Map<string, CachedFuturesData>();

  /** 연속 오류 횟수 (Rate Limit 백오프용) */
  private consecutiveErrors = 0;

  /** 수집 대상 심볼 목록 */
  private readonly symbols: string[];

  constructor() {
    const envSymbols = process.env.FUTURES_SYMBOLS;
    this.symbols = envSymbols
      ? envSymbols.split(',').map((s) => s.trim().toUpperCase())
      : DEFAULT_SYMBOLS;
  }

  /** 서버 시작 시 즉시 1회 수집 */
  async onModuleInit(): Promise<void> {
    this.logger.log('선물 데이터 초기 수집 시작');
    await this.collect();
  }

  /**
   * 주기적 수집 (3분 간격)
   */
  @Interval('futures-collect', COLLECT_INTERVAL_MS)
  async collect(): Promise<void> {
    // Rate Limit 백오프
    if (this.consecutiveErrors > 3) {
      this.logger.warn(`Rate Limit 백오프 중 (연속 오류: ${this.consecutiveErrors})`);
      return;
    }

    for (const symbol of this.symbols) {
      try {
        await this.collectSymbol(symbol);
        this.consecutiveErrors = 0;
      } catch (error) {
        this.consecutiveErrors++;
        if (this.consecutiveErrors <= 3) {
          this.logger.warn(
            `${symbol} 수집 실패 (${this.consecutiveErrors}): ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
  }

  /**
   * 단일 심볼의 모든 지표를 수집한다.
   */
  private async collectSymbol(symbol: string): Promise<void> {
    const [longShortRatio, takerBuySell, openInterest, fundingRate, topTraderRatio] =
      await Promise.allSettled([
        this.fetchLongShortRatio(symbol),
        this.fetchTakerBuySell(symbol),
        this.fetchOpenInterest(symbol),
        this.fetchFundingRate(symbol),
        this.fetchTopTraderRatio(symbol),
      ]);

    const existing = this.cache.get(symbol);

    this.cache.set(symbol, {
      symbol,
      longShortRatio: longShortRatio.status === 'fulfilled' ? longShortRatio.value : existing?.longShortRatio ?? [],
      takerBuySell: takerBuySell.status === 'fulfilled' ? takerBuySell.value : existing?.takerBuySell ?? [],
      openInterest: openInterest.status === 'fulfilled' ? openInterest.value : existing?.openInterest ?? [],
      fundingRate: fundingRate.status === 'fulfilled' ? fundingRate.value : existing?.fundingRate ?? [],
      topTraderRatio: topTraderRatio.status === 'fulfilled' ? topTraderRatio.value : existing?.topTraderRatio ?? [],
      lastUpdated: Date.now(),
    });
  }

  /**
   * 캐시에서 심볼 데이터를 반환한다.
   */
  getData(symbol: string): CachedFuturesData | null {
    return this.cache.get(symbol.toUpperCase()) ?? null;
  }

  /**
   * 지원하는 심볼 목록을 반환한다.
   */
  getSymbols(): string[] {
    return [...this.symbols];
  }

  // ===== 바이낸스 API 호출 =====

  private async fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  private async fetchLongShortRatio(symbol: string): Promise<LongShortRatioEntry[]> {
    const data = await this.fetchJson<Array<{
      symbol: string; longAccount: string; shortAccount: string; longShortRatio: string; timestamp: number;
    }>>(`${FAPI_BASE}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=1h&limit=24`);

    return data.map((d) => ({
      symbol: d.symbol,
      longAccount: parseFloat(d.longAccount),
      shortAccount: parseFloat(d.shortAccount),
      longShortRatio: parseFloat(d.longShortRatio),
      timestamp: d.timestamp,
    }));
  }

  private async fetchTakerBuySell(symbol: string): Promise<TakerBuySellEntry[]> {
    const data = await this.fetchJson<Array<{
      buySellRatio: string; buyVol: string; sellVol: string; timestamp: number;
    }>>(`${FAPI_BASE}/futures/data/takerlongshortRatio?symbol=${symbol}&period=1h&limit=24`);

    return data.map((d) => ({
      symbol,
      buySellRatio: parseFloat(d.buySellRatio),
      buyVol: parseFloat(d.buyVol),
      sellVol: parseFloat(d.sellVol),
      timestamp: d.timestamp,
    }));
  }

  private async fetchOpenInterest(symbol: string): Promise<OpenInterestEntry[]> {
    const data = await this.fetchJson<Array<{
      symbol: string; sumOpenInterest: string; sumOpenInterestValue: string; timestamp: number;
    }>>(`${FAPI_BASE}/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=24`);

    return data.map((d) => ({
      symbol: d.symbol,
      sumOpenInterest: parseFloat(d.sumOpenInterest),
      sumOpenInterestValue: parseFloat(d.sumOpenInterestValue),
      timestamp: d.timestamp,
    }));
  }

  private async fetchFundingRate(symbol: string): Promise<FundingRateEntry[]> {
    const data = await this.fetchJson<Array<{
      symbol: string; fundingRate: string; fundingTime: number;
    }>>(`${FAPI_BASE}/fapi/v1/fundingRate?symbol=${symbol}&limit=10`);

    return data.map((d) => ({
      symbol: d.symbol,
      fundingRate: parseFloat(d.fundingRate),
      fundingTime: d.fundingTime,
    }));
  }

  private async fetchTopTraderRatio(symbol: string): Promise<TopTraderRatioEntry[]> {
    const data = await this.fetchJson<Array<{
      symbol: string; longAccount: string; shortAccount: string; longShortRatio: string; timestamp: number;
    }>>(`${FAPI_BASE}/futures/data/topLongShortPositionRatio?symbol=${symbol}&period=1h&limit=24`);

    return data.map((d) => ({
      symbol: d.symbol,
      longAccount: parseFloat(d.longAccount),
      shortAccount: parseFloat(d.shortAccount),
      longShortRatio: parseFloat(d.longShortRatio),
      timestamp: d.timestamp,
    }));
  }
}
