import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { FundingOISnapshotEntity } from './entities/funding-oi-snapshot.entity';

export interface OIChangeEntry {
  symbol: string;
  currentOI: number;
  baselineOI: number;
  changePercent: number;
}

const PERIOD_HOURS: Record<string, number> = { '1d': 24, '1w': 168, '1m': 720 };

@Injectable()
export class OIChangesService {
  constructor(
    @InjectRepository(FundingOISnapshotEntity)
    private readonly repo: Repository<FundingOISnapshotEntity>,
  ) {}

  async getOIChanges(period: string): Promise<{ data: OIChangeEntry[]; dataRange: { from: number; to: number } }> {
    const hours = PERIOD_HOURS[period] ?? 24;
    const since = Date.now() - hours * 3_600_000;

    // 최신 스냅샷 (각 코인의 가장 최근 전 거래소 OI 합산)
    const latest = await this.repo
      .createQueryBuilder('s')
      .select('s.symbol', 'symbol')
      .addSelect('SUM(s.open_interest)', 'totalOI')
      .where('s.timestamp = (SELECT MAX(s2.timestamp) FROM funding_oi_snapshot s2)')
      .groupBy('s.symbol')
      .getRawMany<{ symbol: string; totalOI: string }>();

    // 기준 시점 스냅샷 (period 시작 시점에 가장 가까운)
    const baseline = await this.repo
      .createQueryBuilder('s')
      .select('s.symbol', 'symbol')
      .addSelect('SUM(s.open_interest)', 'totalOI')
      .where('s.timestamp >= :since', { since })
      .andWhere('s.timestamp <= :sinceEnd', { sinceEnd: since + 3_600_000 })
      .groupBy('s.symbol')
      .getRawMany<{ symbol: string; totalOI: string }>();

    const baselineMap = new Map(baseline.map((b) => [b.symbol, parseFloat(b.totalOI) || 0]));

    const data: OIChangeEntry[] = latest
      .map((l) => {
        const currentOI = parseFloat(l.totalOI) || 0;
        const baselineOI = baselineMap.get(l.symbol);
        if (baselineOI === undefined || baselineOI === 0) return null;
        return {
          symbol: l.symbol,
          currentOI,
          baselineOI,
          changePercent: ((currentOI - baselineOI) / baselineOI) * 100,
        };
      })
      .filter((d): d is OIChangeEntry => d !== null)
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

    return { data, dataRange: { from: since, to: Date.now() } };
  }
}
