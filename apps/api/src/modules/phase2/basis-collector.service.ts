/**
 * 3M Annualized Basis 수집 서비스
 *
 * Binance 분기 선물 가격 + 스팟 가격을 수집하여 DB에 저장한다.
 * BTC/ETH만 대상.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { BasisSnapshotEntity } from './entities/basis-snapshot.entity';

const COLLECT_INTERVAL = 3_600_000;
const FETCH_TIMEOUT = 10_000;

function safeFloat(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

function floorHour(ts: number): number {
  return Math.floor(ts / 3_600_000) * 3_600_000;
}

interface QuarterlySymbol {
  symbol: string;
  baseAsset: string;
  deliveryDate: number;
}

@Injectable()
export class BasisCollectorService implements OnModuleInit {
  private readonly logger = new Logger(BasisCollectorService.name);
  private quarterlySymbols: QuarterlySymbol[] = [];
  private isCollecting = false;

  constructor(
    @InjectRepository(BasisSnapshotEntity)
    private readonly repo: Repository<BasisSnapshotEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refreshQuarterlySymbols();
    if (this.quarterlySymbols.length > 0) {
      await this.collect();
    }
  }

  /** Binance exchangeInfo에서 CURRENT_QUARTER 심볼 조회 */
  private async refreshQuarterlySymbols(): Promise<void> {
    try {
      // COIN-M(dapi)에만 분기 선물이 있음. USD-M(fapi)에는 없음.
      const res = await fetch('https://dapi.binance.com/dapi/v1/exchangeInfo', { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
      if (!res.ok) return;

      const data = (await res.json()) as { symbols?: Array<{ symbol: string; contractType: string; baseAsset: string; quoteAsset: string; deliveryDate: number }> };

      this.quarterlySymbols = (data.symbols ?? [])
        .filter((s) =>
          s.contractType === 'CURRENT_QUARTER' &&
          s.quoteAsset === 'USD' && // COIN-M은 USD (USDT 아님)
          ['BTC', 'ETH'].includes(s.baseAsset),
        )
        .map((s) => ({
          symbol: s.symbol,
          baseAsset: s.baseAsset,
          deliveryDate: s.deliveryDate,
        }));

      this.logger.log(`분기 선물 심볼: ${this.quarterlySymbols.map((s) => s.symbol).join(', ') || '없음'}`);
    } catch (err) {
      this.logger.error(`exchangeInfo 조회 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  @Interval('basis-collect', COLLECT_INTERVAL)
  async collect(): Promise<void> {
    if (this.isCollecting) return;
    this.isCollecting = true;

    try {
      // 매 수집마다 심볼 갱신 (분기 변경 대응)
      await this.refreshQuarterlySymbols();

      if (this.quarterlySymbols.length === 0) {
        this.logger.warn('CURRENT_QUARTER 심볼 없음 — 건너뛰기');
        return;
      }

      const timestamp = floorHour(Date.now());

      for (const qs of this.quarterlySymbols) {
        try {
          // 선물 가격 (COIN-M dapi 도메인)
          const futuresRes = await fetch(
            `https://dapi.binance.com/dapi/v1/ticker/price?symbol=${qs.symbol}`,
            { signal: AbortSignal.timeout(FETCH_TIMEOUT) },
          );
          // dapi ticker/price 응답은 배열: [{ symbol, price, time }]
          const futuresRaw = futuresRes.ok ? await futuresRes.json() : null;
          const futuresData = Array.isArray(futuresRaw) ? futuresRaw[0] as { price?: string } : futuresRaw as { price?: string } | null;

          // 스팟 가격
          const spotSymbol = `${qs.baseAsset}USDT`;
          const spotRes = await fetch(
            `https://api.binance.com/api/v3/ticker/price?symbol=${spotSymbol}`,
            { signal: AbortSignal.timeout(FETCH_TIMEOUT) },
          );
          const spotData = spotRes.ok ? (await spotRes.json()) as { price?: string } : null;

          const futuresPrice = safeFloat(futuresData?.price);
          const spotPrice = safeFloat(spotData?.price);

          if (futuresPrice > 0 && spotPrice > 0) {
            await this.repo.upsert(
              {
                symbol: qs.baseAsset,
                futuresPrice,
                spotPrice,
                deliveryDate: qs.deliveryDate,
                timestamp,
              },
              ['symbol', 'timestamp'],
            );
          }
        } catch (err) {
          this.logger.error(`${qs.symbol} 수집 실패: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      this.logger.log(`Basis 수집 완료: ${this.quarterlySymbols.length}건`);
    } finally {
      this.isCollecting = false;
    }
  }
}
