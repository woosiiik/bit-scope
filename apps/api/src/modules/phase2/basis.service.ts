import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { BasisSnapshotEntity } from './entities/basis-snapshot.entity';

export interface BasisTimeSeriesEntry {
  timestamp: number;
  basisPercent: number;
  futuresPrice: number;
  spotPrice: number;
  daysToExpiry: number;
}

const PERIOD_HOURS: Record<string, number> = { '1d': 24, '1w': 168, '1m': 720 };

@Injectable()
export class BasisService {
  constructor(
    @InjectRepository(BasisSnapshotEntity)
    private readonly repo: Repository<BasisSnapshotEntity>,
  ) {}

  async getBasisTimeSeries(symbol: string, period: string): Promise<{ data: BasisTimeSeriesEntry[]; dataRange: { from: number; to: number } }> {
    const hours = PERIOD_HOURS[period] ?? 24;
    const since = Date.now() - hours * 3_600_000;

    const rows = await this.repo.find({
      where: { symbol: symbol.toUpperCase(), timestamp: MoreThan(since) },
      order: { timestamp: 'ASC' },
    });

    const data: BasisTimeSeriesEntry[] = rows
      .map((r) => {
        const futuresPrice = Number(r.futuresPrice);
        const spotPrice = Number(r.spotPrice);
        const deliveryDate = Number(r.deliveryDate);
        const timestamp = Number(r.timestamp);
        const daysToExpiry = (deliveryDate - timestamp) / 86_400_000;

        if (spotPrice === 0 || daysToExpiry <= 0) return null;

        return {
          timestamp,
          basisPercent: ((futuresPrice - spotPrice) / spotPrice) * (365 / daysToExpiry) * 100,
          futuresPrice,
          spotPrice,
          daysToExpiry: Math.round(daysToExpiry),
        };
      })
      .filter((d): d is BasisTimeSeriesEntry => d !== null);

    return { data, dataRange: { from: since, to: Date.now() } };
  }
}
