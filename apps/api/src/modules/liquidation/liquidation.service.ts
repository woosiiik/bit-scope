/**
 * 청산 데이터 서비스
 *
 * DB에 저장된 청산 이벤트를 시간별/거래소별로 집계한다.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';

import { LiquidationEntity } from './entities/liquidation.entity';

/** 시간별 집계 결과 */
export interface AggregatedLiquidation {
  timestamp: number;
  exchange: string;
  longUsd: number;
  shortUsd: number;
}

/** 요약 데이터 */
export interface LiquidationSummary {
  symbol: string;
  totalLongUsd: number;
  totalShortUsd: number;
  count: number;
}

@Injectable()
export class LiquidationService {
  private readonly logger = new Logger(LiquidationService.name);

  constructor(
    @InjectRepository(LiquidationEntity)
    private readonly liquidationRepo: Repository<LiquidationEntity>,
  ) {}

  /**
   * 특정 코인의 시간별 청산 집계
   */
  async getAggregated(symbol: string, hours: number): Promise<AggregatedLiquidation[]> {
    const since = Date.now() - hours * 3600 * 1000;

    // 시간 단위로 집계 (interval에 따라 조정)
    const bucketMs = hours <= 24 ? 3600 * 1000 : 4 * 3600 * 1000; // 1h or 4h buckets

    const raw = await this.liquidationRepo.find({
      where: {
        symbol,
        timestamp: MoreThan(since),
      },
      order: { timestamp: 'ASC' },
    });

    // 시간 버킷별 집계
    const buckets = new Map<string, AggregatedLiquidation>();

    for (const item of raw) {
      const bucketTs = Math.floor(Number(item.timestamp) / bucketMs) * bucketMs;
      const key = `${bucketTs}:${item.exchange}`;

      const existing = buckets.get(key) ?? {
        timestamp: bucketTs,
        exchange: item.exchange,
        longUsd: 0,
        shortUsd: 0,
      };

      const usd = Number(item.usdValue) || 0;
      if (item.side === 'LONG') {
        existing.longUsd += usd;
      } else {
        existing.shortUsd += usd;
      }

      buckets.set(key, existing);
    }

    return Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * 최근 24시간 전체 코인 청산 요약
   */
  async getRecentSummary(): Promise<LiquidationSummary[]> {
    const since = Date.now() - 24 * 3600 * 1000;

    const results = await this.liquidationRepo
      .createQueryBuilder('liq')
      .select('liq.symbol', 'symbol')
      .addSelect('SUM(CASE WHEN liq.side = \'LONG\' THEN liq.usd_value ELSE 0 END)', 'totalLongUsd')
      .addSelect('SUM(CASE WHEN liq.side = \'SHORT\' THEN liq.usd_value ELSE 0 END)', 'totalShortUsd')
      .addSelect('COUNT(*)', 'count')
      .where('liq.timestamp > :since', { since })
      .groupBy('liq.symbol')
      .orderBy('SUM(liq.usd_value)', 'DESC')
      .limit(50)
      .getRawMany();

    return results.map((r) => ({
      symbol: r.symbol,
      totalLongUsd: parseFloat(r.totalLongUsd) || 0,
      totalShortUsd: parseFloat(r.totalShortUsd) || 0,
      count: parseInt(r.count) || 0,
    }));
  }
}
