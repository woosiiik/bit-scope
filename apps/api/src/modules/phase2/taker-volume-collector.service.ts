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
    // FundingOI가 심볼 목록을 채울 때까지 폴링 후 첫 수집
    // (고정 5초 지연은 FundingOI가 늦으면 빈 배열로 사이클 전체 스킵됨)
    void this.waitForSymbolsThenCollect();
  }

  /** FundingOI 심볼 목록이 준비될 때까지 대기 후 첫 수집을 실행한다. */
  private async waitForSymbolsThenCollect(): Promise<void> {
    const MAX_ATTEMPTS = 12; // 5초 간격 × 12 = 최대 ~60초 대기
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (this.fundingOICollector.getBinanceSymbols().length > 0) {
        await this.collect();
        return;
      }
      await sleep(5000);
    }
    this.logger.warn('FundingOI 심볼 목록 대기 시간 초과 — 다음 주기에 수집');
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
            { symbol, exchange: 'binance', buyVolume: safeFloat(item.buyVol), sellVolume: safeFloat(item.sellVol), timestamp },
            ['symbol', 'exchange', 'timestamp'],
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
