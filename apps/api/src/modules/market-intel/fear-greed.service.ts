/**
 * 공포/탐욕 지수 서비스
 *
 * Alternative.me API에서 Fear & Greed Index를 수집한다.
 * 무료, 인증 불필요.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

export interface FearGreedEntry {
  value: number;
  classification: string;
  timestamp: number;
}

const API_URL = 'https://api.alternative.me/fng/?limit=30';
const COLLECT_INTERVAL_MS = 10 * 60 * 1000; // 10분

@Injectable()
export class FearGreedService implements OnModuleInit {
  private readonly logger = new Logger(FearGreedService.name);
  private data: FearGreedEntry[] = [];

  async onModuleInit(): Promise<void> {
    await this.collect();
  }

  @Interval('fear-greed-collect', COLLECT_INTERVAL_MS)
  async collect(): Promise<void> {
    try {
      const res = await fetch(API_URL, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return;

      const json = await res.json() as { data: Array<{ value: string; value_classification: string; timestamp: string }> };

      this.data = (json.data ?? []).map((d) => ({
        value: parseInt(d.value, 10),
        classification: d.value_classification,
        timestamp: parseInt(d.timestamp, 10) * 1000,
      }));

      this.logger.log(`공포/탐욕 지수 수집 완료: ${this.data.length}건`);
    } catch (error) {
      this.logger.warn(`공포/탐욕 지수 수집 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  getData(): FearGreedEntry[] {
    return this.data;
  }
}
