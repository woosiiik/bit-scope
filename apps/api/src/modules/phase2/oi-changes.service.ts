import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FundingOISnapshotEntity } from './entities/funding-oi-snapshot.entity';

/** 시계열 포인트: { timestamp, [symbol]: OI 변화율(%) } */
export type OIChangesPoint = Record<string, number>;

export interface OIChangesResult {
  coins: string[];
  series: OIChangesPoint[];
  dataRange: { from: number; to: number };
}

const PERIOD_HOURS: Record<string, number> = { '1d': 24, '1w': 168, '1m': 720 };
const TOP_N = 8;

@Injectable()
export class OIChangesService {
  constructor(
    @InjectRepository(FundingOISnapshotEntity)
    private readonly repo: Repository<FundingOISnapshotEntity>,
  ) {}

  /**
   * 상위 코인의 OI 누적 변화율을 시계열로 반환한다.
   * 기간 시작 시점을 0%로 리베이스하여 코인 간 상대 비교가 가능하다.
   */
  async getOIChanges(period: string): Promise<OIChangesResult> {
    const hours = PERIOD_HOURS[period] ?? 24;
    const now = Date.now();
    const since = now - hours * 3_600_000;

    // 1) 최신 스냅샷 기준 상위 코인 선정 (전 거래소 OI 합산)
    const maxRow = await this.repo
      .createQueryBuilder('s')
      .select('MAX(s.timestamp)', 'maxTs')
      .getRawOne<{ maxTs: string }>();
    const maxTs = parseInt(maxRow?.maxTs ?? '0', 10);
    if (!maxTs) return { coins: [], series: [], dataRange: { from: since, to: now } };

    const topRows = await this.repo
      .createQueryBuilder('s')
      .select('s.symbol', 'symbol')
      .addSelect('SUM(s.open_interest)', 'totalOI')
      .where('s.timestamp = :maxTs', { maxTs })
      .groupBy('s.symbol')
      .orderBy('SUM(s.open_interest)', 'DESC')
      .limit(TOP_N)
      .getRawMany<{ symbol: string; totalOI: string }>();
    const coins = topRows.map((r) => r.symbol);
    if (coins.length === 0) return { coins: [], series: [], dataRange: { from: since, to: now } };

    // 2) 상위 코인의 기간 내 시간별 OI 합산 (거래소별 단일 MAX 대신 기간 전체 집계 → P1-3 해소)
    const rows = await this.repo
      .createQueryBuilder('s')
      .select('s.symbol', 'symbol')
      .addSelect('s.timestamp', 'timestamp')
      .addSelect('SUM(s.open_interest)', 'oi')
      .where('s.timestamp >= :since', { since })
      .andWhere('s.symbol IN (:...coins)', { coins })
      .groupBy('s.symbol')
      .addGroupBy('s.timestamp')
      .orderBy('s.timestamp', 'ASC')
      .getRawMany<{ symbol: string; timestamp: string; oi: string }>();

    // 3) 코인별 baseline(첫 포인트) 대비 변화율 계산 + 타임스탬프별 pivot
    const baseline = new Map<string, number>();
    const pivot = new Map<number, OIChangesPoint>();
    for (const r of rows) {
      const sym = r.symbol;
      const ts = parseInt(r.timestamp, 10);
      const oi = parseFloat(r.oi) || 0;
      if (!baseline.has(sym)) baseline.set(sym, oi);
      const base = baseline.get(sym)!;
      const changePercent = base > 0 ? ((oi - base) / base) * 100 : 0;
      let point = pivot.get(ts);
      if (!point) {
        point = { timestamp: ts };
        pivot.set(ts, point);
      }
      point[sym] = changePercent;
    }

    const series = Array.from(pivot.values()).sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
    return { coins, series, dataRange: { from: since, to: now } };
  }
}
