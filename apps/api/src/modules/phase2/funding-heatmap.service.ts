import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

    // 1단계: 상위 30개 심볼을 DB에서 추출 (P0-3 수정: 전체 행 로드 방지)
    const topSymbolRows = await this.repo
      .createQueryBuilder('s')
      .select('s.symbol', 'symbol')
      .addSelect('SUM(s.open_interest)', 'totalOI')
      .where('s.timestamp > :since', { since })
      .groupBy('s.symbol')
      .orderBy('SUM(s.open_interest)', 'DESC')
      .limit(30)
      .getRawMany<{ symbol: string; totalOI: string }>();

    const topSymbols = topSymbolRows.map((r) => r.symbol);
    if (topSymbols.length === 0) {
      return { cells: [], symbols: [], dataRange: { from: since, to: Date.now() } };
    }

    // 2단계: 상위 심볼만 조회 (메모리 사용량 대폭 감소)
    const rows = await this.repo
      .createQueryBuilder('s')
      .where('s.timestamp > :since', { since })
      .andWhere('s.symbol IN (:...symbols)', { symbols: topSymbols })
      .orderBy('s.timestamp', 'ASC')
      .getMany();

    // 시간 버킷별 OI 가중 평균 펀딩 계산
    const cellMap = new Map<string, { totalWeighted: number; totalOI: number; details: Map<string, { rate: number; oi: number; count: number }> }>();

    for (const r of rows) {
      const bucketTs = Math.floor(Number(r.timestamp) / bucket) * bucket;
      const key = `${r.symbol}:${bucketTs}`;

      const cell = cellMap.get(key) ?? { totalWeighted: 0, totalOI: 0, details: new Map() };
      const oi = Number(r.openInterest);
      const rate = Number(r.fundingRate);
      cell.totalWeighted += rate * oi;
      cell.totalOI += oi;

      // P1-4 수정: 동일 버킷 내 같은 거래소는 평균 (덮어쓰기 대신)
      const existing = cell.details.get(r.exchange);
      if (existing) {
        existing.rate = (existing.rate * existing.count + rate) / (existing.count + 1);
        existing.oi += oi;
        existing.count++;
      } else {
        cell.details.set(r.exchange, { rate, oi, count: 1 });
      }

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
