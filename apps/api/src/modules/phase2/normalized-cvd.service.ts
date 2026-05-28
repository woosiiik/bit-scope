import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { TakerVolumeSnapshotEntity } from './entities/taker-volume-snapshot.entity';
import { FundingOISnapshotEntity } from './entities/funding-oi-snapshot.entity';

export interface NormalizedCVDEntry {
  symbol: string;
  rawCVD: number;
  totalOI: number;
  normalizedCVD: number;
}

const PERIOD_HOURS: Record<string, number> = { '1d': 24, '1w': 168, '1m': 720 };

@Injectable()
export class NormalizedCVDService {
  constructor(
    @InjectRepository(TakerVolumeSnapshotEntity)
    private readonly takerRepo: Repository<TakerVolumeSnapshotEntity>,
    @InjectRepository(FundingOISnapshotEntity)
    private readonly oiRepo: Repository<FundingOISnapshotEntity>,
  ) {}

  async getNormalizedCVD(period: string): Promise<{ data: NormalizedCVDEntry[]; dataRange: { from: number; to: number } }> {
    const hours = PERIOD_HOURS[period] ?? 24;
    const since = Date.now() - hours * 3_600_000;

    // CVD = SUM(buyVolume - sellVolume) per symbol
    const cvdRows = await this.takerRepo
      .createQueryBuilder('t')
      .select('t.symbol', 'symbol')
      .addSelect('SUM(t.buy_volume - t.sell_volume)', 'rawCVD')
      .where('t.timestamp > :since', { since })
      .groupBy('t.symbol')
      .getRawMany<{ symbol: string; rawCVD: string }>();

    // 현재 전 거래소 OI 합산
    const oiRows = await this.oiRepo
      .createQueryBuilder('s')
      .select('s.symbol', 'symbol')
      .addSelect('SUM(s.open_interest)', 'totalOI')
      .where('s.timestamp = (SELECT MAX(s2.timestamp) FROM funding_oi_snapshot s2)')
      .groupBy('s.symbol')
      .getRawMany<{ symbol: string; totalOI: string }>();

    const oiMap = new Map(oiRows.map((r) => [r.symbol, parseFloat(r.totalOI) || 0]));

    const data: NormalizedCVDEntry[] = cvdRows
      .map((r) => {
        const rawCVD = parseFloat(r.rawCVD) || 0;
        const totalOI = oiMap.get(r.symbol) ?? 0;
        if (totalOI === 0) return null;
        return {
          symbol: r.symbol,
          rawCVD,
          totalOI,
          normalizedCVD: rawCVD / totalOI,
        };
      })
      .filter((d): d is NormalizedCVDEntry => d !== null)
      .sort((a, b) => Math.abs(b.normalizedCVD) - Math.abs(a.normalizedCVD));

    return { data, dataRange: { from: since, to: Date.now() } };
  }
}
