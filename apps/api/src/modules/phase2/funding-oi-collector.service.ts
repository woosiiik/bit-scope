/**
 * Funding Rate + OI 수집 서비스
 *
 * 6개 거래소 벌크 API를 1시간 간격으로 호출하여 DB에 저장한다.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FundingOISnapshotEntity } from './entities/funding-oi-snapshot.entity';
import { SymbolNormalizer } from './symbol-normalizer';
import { ExchangeBackoffManager } from './exchange-backoff-manager';

const COLLECT_INTERVAL = 3_600_000; // 1시간
const FETCH_TIMEOUT = 10_000;

function safeFloat(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

/** 1시간 단위 floor */
function floorHour(ts: number): number {
  return Math.floor(ts / 3_600_000) * 3_600_000;
}

interface TickerData {
  symbol: string;
  exchange: string;
  fundingRate: number;
  openInterest: number;
}

@Injectable()
export class FundingOICollectorService implements OnModuleInit {
  private readonly logger = new Logger(FundingOICollectorService.name);
  private isCollecting = false;

  /** Binance 심볼 목록 캐시 (TakerVolumeCollector에서 재사용) */
  private binanceSymbols: string[] = [];

  constructor(
    @InjectRepository(FundingOISnapshotEntity)
    private readonly repo: Repository<FundingOISnapshotEntity>,
    private readonly symbolNormalizer: SymbolNormalizer,
    private readonly backoffManager: ExchangeBackoffManager,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('FundingOI collector 초기 수집 시작');
    await this.collect();
  }

  getBinanceSymbols(): string[] {
    return this.binanceSymbols;
  }

  @Interval('funding-oi-collect', COLLECT_INTERVAL)
  async collect(): Promise<void> {
    if (this.isCollecting) return;
    this.isCollecting = true;
    const start = Date.now();
    const timestamp = floorHour(start);

    try {
      const exchanges = ['binance', 'bybit', 'okx', 'gate', 'bitget', 'hyperliquid'];
      const results = await Promise.allSettled(
        exchanges.map((ex) => this.fetchExchange(ex, timestamp)),
      );

      let totalCount = 0;
      const failedExchanges: string[] = [];

      for (let i = 0; i < results.length; i++) {
        const result = results[i]!;
        const ex = exchanges[i]!;
        if (result.status === 'fulfilled') {
          totalCount += result.value;
          this.backoffManager.recordSuccess(ex);
        } else {
          failedExchanges.push(ex);
          this.backoffManager.recordFailure(ex);
          this.logger.error(`${ex} 수집 실패: ${result.reason?.message ?? 'Unknown'}`);
        }
      }

      const elapsed = Date.now() - start;
      this.logger.log(`FundingOI 수집 완료: ${totalCount}건, ${elapsed}ms${failedExchanges.length > 0 ? `, 실패: ${failedExchanges.join(',')}` : ''}`);
    } finally {
      this.isCollecting = false;
    }
  }

  private async fetchExchange(exchange: string, timestamp: number): Promise<number> {
    if (this.backoffManager.shouldSkip(exchange)) return 0;

    const tickers = await this.fetchTickers(exchange);
    if (tickers.length === 0) return 0;

    const entities = tickers.map((t) =>
      this.repo.create({ symbol: t.symbol, exchange: t.exchange, fundingRate: t.fundingRate, openInterest: t.openInterest, timestamp }),
    );

    // upsert (UNIQUE 제약으로 중복 방지)
    await this.repo.upsert(entities, ['symbol', 'exchange', 'timestamp']);
    return entities.length;
  }

  private async fetchTickers(exchange: string): Promise<TickerData[]> {
    switch (exchange) {
      case 'binance': return this.fetchBinance();
      case 'bybit': return this.fetchBybit();
      case 'okx': return this.fetchOkx();
      case 'gate': return this.fetchGate();
      case 'bitget': return this.fetchBitget();
      case 'hyperliquid': return this.fetchHyperliquid();
      default: return [];
    }
  }

  private async fetchBinance(): Promise<TickerData[]> {
    const res = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex', { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!res.ok) throw new Error(`Binance: ${res.status}`);
    const data = (await res.json()) as Array<{ symbol?: string; lastFundingRate?: string; markPrice?: string }>;
    if (!Array.isArray(data)) return [];

    const tickers: TickerData[] = [];
    const symbols: string[] = [];

    for (const item of data) {
      const symbol = this.symbolNormalizer.normalize('binance', item.symbol ?? '');
      if (!symbol) continue;
      symbols.push(item.symbol ?? '');
      tickers.push({
        symbol,
        exchange: 'binance',
        fundingRate: safeFloat(item.lastFundingRate),
        openInterest: 0, // premiumIndex에 OI 없음
      });
    }

    this.binanceSymbols = symbols;
    return tickers;
  }

  private async fetchBybit(): Promise<TickerData[]> {
    const res = await fetch('https://api.bybit.com/v5/market/tickers?category=linear', { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!res.ok) throw new Error(`Bybit: ${res.status}`);
    const data = (await res.json()) as { result?: { list?: Array<Record<string, string>> } };

    return (data?.result?.list ?? [])
      .map((item) => {
        const symbol = this.symbolNormalizer.normalize('bybit', item.symbol ?? '');
        if (!symbol) return null;
        const price = safeFloat(item.lastPrice);
        return {
          symbol,
          exchange: 'bybit',
          fundingRate: safeFloat(item.fundingRate),
          openInterest: safeFloat(item.openInterest) * price,
        };
      })
      .filter((t): t is TickerData => t !== null);
  }

  private async fetchOkx(): Promise<TickerData[]> {
    // OKX: 펀딩 + OI 별도 API
    const [fundingRes, oiRes] = await Promise.all([
      fetch('https://www.okx.com/api/v5/public/funding-rate', { signal: AbortSignal.timeout(FETCH_TIMEOUT) }),
      fetch('https://www.okx.com/api/v5/public/open-interest?instType=SWAP', { signal: AbortSignal.timeout(FETCH_TIMEOUT) }),
    ]);

    const fundingData = fundingRes.ok ? (await fundingRes.json()) as { code?: string; data?: Array<Record<string, string>> } : null;
    const oiData = oiRes.ok ? (await oiRes.json()) as { code?: string; data?: Array<Record<string, string>> } : null;

    const fundingMap = new Map<string, number>();
    if (fundingData?.code === '0' && Array.isArray(fundingData.data)) {
      for (const item of fundingData.data) {
        const sym = this.symbolNormalizer.normalize('okx', item.instId ?? '');
        if (sym) fundingMap.set(sym, safeFloat(item.fundingRate));
      }
    }

    const oiMap = new Map<string, number>();
    if (oiData?.code === '0' && Array.isArray(oiData.data)) {
      for (const item of oiData.data) {
        const sym = this.symbolNormalizer.normalize('okx', item.instId ?? '');
        if (sym) oiMap.set(sym, safeFloat(item.oiCcy));
      }
    }

    const allSymbols = new Set([...fundingMap.keys(), ...oiMap.keys()]);
    return Array.from(allSymbols).map((symbol) => ({
      symbol,
      exchange: 'okx',
      fundingRate: fundingMap.get(symbol) ?? 0,
      openInterest: oiMap.get(symbol) ?? 0,
    }));
  }

  private async fetchGate(): Promise<TickerData[]> {
    const res = await fetch('https://api.gateio.ws/api/v4/futures/usdt/tickers', { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!res.ok) throw new Error(`Gate: ${res.status}`);
    const data = (await res.json()) as Array<Record<string, string>>;
    if (!Array.isArray(data)) return [];

    return data
      .map((item) => {
        const symbol = this.symbolNormalizer.normalize('gate', item.contract ?? '');
        if (!symbol) return null;
        const last = safeFloat(item.last);
        const qm = safeFloat(item.quanto_multiplier) || 1;
        return {
          symbol,
          exchange: 'gate',
          fundingRate: safeFloat(item.funding_rate),
          openInterest: safeFloat(item.total_size) * qm * last,
        };
      })
      .filter((t): t is TickerData => t !== null);
  }

  private async fetchBitget(): Promise<TickerData[]> {
    const res = await fetch('https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES', { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!res.ok) throw new Error(`Bitget: ${res.status}`);
    const data = (await res.json()) as { code?: string; data?: Array<Record<string, string>> };
    if (data?.code !== '00000' || !Array.isArray(data?.data)) throw new Error(`Bitget error: ${data?.code}`);

    return data.data
      .map((item) => {
        const symbol = this.symbolNormalizer.normalize('bitget', item.symbol ?? '');
        if (!symbol) return null;
        const last = safeFloat(item.lastPr || item.last);
        return {
          symbol,
          exchange: 'bitget',
          fundingRate: safeFloat(item.fundingRate),
          openInterest: safeFloat(item.openInterestUsd) || safeFloat(item.openInterest) * last,
        };
      })
      .filter((t): t is TickerData => t !== null);
  }

  private async fetchHyperliquid(): Promise<TickerData[]> {
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok) throw new Error(`Hyperliquid: ${res.status}`);
    const data = (await res.json()) as [{ universe: Array<{ name: string }> }, Array<Record<string, string>>];
    if (!Array.isArray(data) || data.length < 2) return [];

    const [meta, ctxs] = data;
    const tickers: TickerData[] = [];

    for (let i = 0; i < meta.universe.length && i < ctxs.length; i++) {
      const symbol = this.symbolNormalizer.normalize('hyperliquid', meta.universe[i]!.name);
      if (!symbol) continue;
      const ctx = ctxs[i]!;
      const markPx = safeFloat(ctx.markPx);
      tickers.push({
        symbol,
        exchange: 'hyperliquid',
        fundingRate: safeFloat(ctx.funding),
        openInterest: safeFloat(ctx.openInterest) * markPx,
      });
    }

    return tickers;
  }
}
