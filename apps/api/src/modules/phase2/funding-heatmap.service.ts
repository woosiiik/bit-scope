import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { FundingOISnapshotEntity } from './entities/funding-oi-snapshot.entity';

export interface HeatmapCell {
  symbol: string;
  timestamp: number;
  weightedFunding: number;
  details: Array<{ exchange: string; fundingRate: number; openInterest: number }>;
}

const PERIOD_HOURS: Record<string, number> = { '1d': 24, '1w': 168, '1m': 720 };
const BUCKET_MS: Record<string, number> = { '1d': 3_600_000, '1w': 14_400_000, '1m': 43_200_000 };

@Injectable()
export class FundingHeatmapService {
  constructor(
    @InjectRepository(FundingOISnapshotEntity)
    private readonly repo: Repository<FundingOISnapshotEntity>,
  ) {}

  async getHeatmapData(period: string): Promise<{ cells: HeatmapCell[]; symbols: string[]; dataRange: { from: number; to: number } }> {
    const hours = PERIOD_HOURS[period] ?? 24;
    const bucket = BUCKET_MS[period] ?? 3_600_000;
    const since = Date.now() - hours * 3_600_000;

    const rows = await this.repo.find({
      where: { timestamp: MoreThan(since) },
      order: { timestamp: 'ASC' },
    });

    // 심볼별 전체 OI 합산 → 상위 30개
    const oiBySymbol = new Map<string, number>();
    for (const r of rows) {
      oiBySymbol.set(r.symbol, (oiBySymbol.get(r.symbol) ?? 0) + Number(r.openInterest));
    }
    const topSymbols = Array.from(oiBySymbol.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([s]) => s);
    const topSet = new Set(topSymbols);

    // 시간 버킷별 OI 가중 평균 펀딩 계산
    const cellMap = new Map<string, { totalWeighted: number; totalOI: number; details: Map<string, { rate: number; oi: number }> }>();

    for (const r of rows) {
      if (!topSet.has(r.symbol)) continue;
      const bucketTs = Math.floor(Number(r.timestamp) / bucket) * bucket;
      const key = `${r.symbol}:${bucketTs}`;

      const cell = cellMap.get(key) ?? { totalWeighted: 0, totalOI: 0, details: new Map() };
      const oi = Number(r.openInterest);
      const rate = Number(r.fundingRate);
      cell.totalWeighted += rate * oi;
      cell.totalOI += oi;
      cell.details.set(r.exchange, { rate, oi });
      cellMap.set(key, cell);
    }

    const cells: HeatmapCell[] = [];
    for (const [key, cell] of cellMap) {
      const [symbol, tsStr] = key.split(':');
      cells.push({
        symbol: symbol!,
        timestamp: Number(tsStr),
        weightedFunding: cell.totalOI > 0 ? cell.totalWeighted / cell.totalOI : 0,
        details: Array.from(cell.details.entries()).map(([ex, d]) => ({ exchange: ex, fundingRate: d.rate, openInterest: d.oi })),
      });
    }

    return { cells, symbols: topSymbols, dataRange: { from: since, to: Date.now() } };
  }
}
