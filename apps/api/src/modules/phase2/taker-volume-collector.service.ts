/**
 * Taker Buy/Sell Volume 수집 서비스
 *
 * Binance takerlongshortRatio API에서 주요 코인의 taker 데이터를 수집한다.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TakerVolumeSnapshotEntity } from './entities/taker-volume-snapshot.entity';
import { FundingOICollectorService } from './funding-oi-collector.service';
import { SymbolNormalizer } from './symbol-normalizer';

const COLLECT_INTERVAL = 3_600_000;
const FETCH_TIMEOUT = 10_000;
const DELAY_BETWEEN_CALLS = 100; // 100ms

function safeFloat(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

function floorHour(ts: number): number {
  return Math.floor(ts / 3_600_000) * 3_600_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class TakerVolumeCollectorService implements OnModuleInit {
  private readonly logger = new Logger(TakerVolumeCollectorService.name);
  private isCollecting = false;

  constructor(
    @InjectRepository(TakerVolumeSnapshotEntity)
    private readonly repo: Repository<TakerVolumeSnapshotEntity>,
    private readonly fundingOICollector: FundingOICollectorService,
    private readonly symbolNormalizer: SymbolNormalizer,
  ) {}

  async onModuleInit(): Promise<void> {
    // FundingOI가 먼저 수집되도록 5초 대기
    setTimeout(() => this.collect(), 5000);
  }

  @Interval('taker-volume-collect', COLLECT_INTERVAL)
  async collect(): Promise<void> {
    if (this.isCollecting) return;
    this.isCollecting = true;
    const start = Date.now();
    const timestamp = floorHour(start);

    try {
      const binanceSymbols = this.fundingOICollector.getBinanceSymbols();
      if (binanceSymbols.length === 0) {
        this.logger.warn('Binance 심볼 목록 비어있음 — 건너뛰기');
        return;
      }

      // 상위 50개만 수집 (API 부하 제한)
      const symbols = binanceSymbols.slice(0, 50);
      let count = 0;

      for (const rawSymbol of symbols) {
        try {
          const url = `https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=${rawSymbol}&period=1h&limit=1`;
          const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
          if (!res.ok) continue;

          const data = (await res.json()) as Array<{ buyVol?: string; sellVol?: string }>;
          if (!Array.isArray(data) || data.length === 0) continue;

          const item = data[0]!;
          const symbol = this.symbolNormalizer.normalize('binance', rawSymbol);
          if (!symbol) continue;

          await this.repo.upsert(
            { symbol, buyVolume: safeFloat(item.buyVol), sellVolume: safeFloat(item.sellVol), timestamp },
            ['symbol', 'timestamp'],
          );
          count++;
        } catch {
          // 개별 실패 무시
        }
        await sleep(DELAY_BETWEEN_CALLS);
      }

      const elapsed = Date.now() - start;
      this.logger.log(`TakerVolume 수집 완료: ${count}/${symbols.length}건, ${elapsed}ms`);
    } finally {
      this.isCollecting = false;
    }
  }
}
