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
    // premiumIndex (펀딩비율 + markPrice)
    const res = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex', { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!res.ok) throw new Error(`Binance: ${res.status}`);
    const data = (await res.json()) as Array<{ symbol?: string; lastFundingRate?: string; markPrice?: string }>;
    if (!Array.isArray(data)) return [];

    const tickers: TickerData[] = [];
    const symbols: string[] = [];
    const markPriceMap = new Map<string, number>();

    for (const item of data) {
      const symbol = this.symbolNormalizer.normalize('binance', item.symbol ?? '');
      if (!symbol) continue;
      const rawSymbol = item.symbol ?? '';
      symbols.push(rawSymbol);
      markPriceMap.set(rawSymbol, safeFloat(item.markPrice));
      tickers.push({
        symbol,
        exchange: 'binance',
        fundingRate: safeFloat(item.lastFundingRate),
        openInterest: 0,
      });
    }

    this.binanceSymbols = symbols;

    // 상위 50개 코인 OI 별도 수집 (개별 API 호출)
    const top50 = symbols.slice(0, 50);
    const oiResults = await Promise.allSettled(
      top50.map(async (rawSymbol) => {
        const oiRes = await fetch(
          `https://fapi.binance.com/fapi/v1/openInterest?symbol=${rawSymbol}`,
          { signal: AbortSignal.timeout(5000) },
        );
        if (!oiRes.ok) return null;
        const oiData = (await oiRes.json()) as { openInterest?: string };
        return { rawSymbol, oi: safeFloat(oiData?.openInterest) };
      }),
    );

    // OI를 USD로 환산하여 tickers에 병합
    for (const result of oiResults) {
      if (result.status !== 'fulfilled' || !result.value) continue;
      const { rawSymbol, oi } = result.value;
      const normalizedSymbol = this.symbolNormalizer.normalize('binance', rawSymbol);
      if (!normalizedSymbol) continue;
      const markPrice = markPriceMap.get(rawSymbol) ?? 0;
      const ticker = tickers.find((t) => t.symbol === normalizedSymbol);
      if (ticker) {
        ticker.openInterest = oi * markPrice; // USD 환산
      }
    }

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
    // OKX: OI + 가격(OI USD 환산용) 병렬 호출
    const [oiRes, tickerRes] = await Promise.all([
      fetch('https://www.okx.com/api/v5/public/open-interest?instType=SWAP', { signal: AbortSignal.timeout(FETCH_TIMEOUT) }),
      fetch('https://www.okx.com/api/v5/market/tickers?instType=SWAP', { signal: AbortSignal.timeout(FETCH_TIMEOUT) }),
    ]);

    // 가격 맵 (OI USD 환산용)
    const priceMap = new Map<string, number>();
    if (tickerRes?.ok) {
      const tickerData = (await tickerRes.json()) as { code?: string; data?: Array<Record<string, string>> };
      if (tickerData?.code === '0' && Array.isArray(tickerData.data)) {
        for (const item of tickerData.data) {
          const sym = this.symbolNormalizer.normalize('okx', item.instId ?? '');
          if (sym) {
            priceMap.set(sym, safeFloat(item.last));
          }
        }
      }
    }

    // OI (코인 단위 → USD 환산)
    const oiMap = new Map<string, number>();
    if (oiRes?.ok) {
      const oiData = (await oiRes.json()) as { code?: string; data?: Array<Record<string, string>> };
      if (oiData?.code === '0' && Array.isArray(oiData.data)) {
        for (const item of oiData.data) {
          const sym = this.symbolNormalizer.normalize('okx', item.instId ?? '');
          if (sym) {
            const oiCcy = safeFloat(item.oiCcy);
            const price = priceMap.get(sym) ?? 0;
            oiMap.set(sym, oiCcy * price); // USD 환산
          }
        }
      }
    }

    // 펀딩: OKX funding-rate API는 instId 필수이므로 벌크 조회 불가.
    // Binance OI 패턴과 동일하게 OI 상위 50개 심볼만 개별 병렬 호출한다.
    const fundingMap = new Map<string, number>();
    const topSymbols = Array.from(oiMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([sym]) => sym);

    const fundingResults = await Promise.allSettled(
      topSymbols.map(async (sym) => {
        const fr = await fetch(
          `https://www.okx.com/api/v5/public/funding-rate?instId=${sym}-USDT-SWAP`,
          { signal: AbortSignal.timeout(5000) },
        );
        if (!fr.ok) return null;
        const fd = (await fr.json()) as { code?: string; data?: Array<{ fundingRate?: string }> };
        if (fd?.code !== '0' || !Array.isArray(fd.data) || fd.data.length === 0) return null;
        return { sym, rate: safeFloat(fd.data[0]!.fundingRate) };
      }),
    );
    for (const r of fundingResults) {
      if (r.status === 'fulfilled' && r.value) fundingMap.set(r.value.sym, r.value.rate);
    }

    const allSymbols = new Set([...oiMap.keys(), ...priceMap.keys()]);
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
