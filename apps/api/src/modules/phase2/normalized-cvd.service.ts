import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TakerVolumeSnapshotEntity } from './entities/taker-volume-snapshot.entity';
import { FundingOISnapshotEntity } from './entities/funding-oi-snapshot.entity';

/** 시계열 포인트: { timestamp, [symbol]: 누적 CVD / OI } */
export type NormalizedCVDPoint = Record<string, number>;

export interface NormalizedCVDResult {
  coins: string[];
  series: NormalizedCVDPoint[];
  dataRange: { from: number; to: number };
}

const PERIOD_HOURS: Record<string, number> = { '1d': 24, '1w': 168, '1m': 720 };
const TOP_N = 8;

@Injectable()
export class NormalizedCVDService {
  constructor(
    @InjectRepository(TakerVolumeSnapshotEntity)
    private readonly takerRepo: Repository<TakerVolumeSnapshotEntity>,
    @InjectRepository(FundingOISnapshotEntity)
    private readonly oiRepo: Repository<FundingOISnapshotEntity>,
  ) {}

  /**
   * 상위 코인의 OI 정규화 누적 CVD를 시계열로 반환한다.
   * CVD = Σ(taker buy - taker sell) 누적, normalized = 누적 CVD / 시점별 OI.
   */
  async getNormalizedCVD(period: string): Promise<NormalizedCVDResult> {
    const hours = PERIOD_HOURS[period] ?? 24;
    const now = Date.now();
    const since = now - hours * 3_600_000;

    // 1) 기간 내 taker 거래량 상위 코인 선정 (CVD 데이터 보유 코인)
    const topRows = await this.takerRepo
      .createQueryBuilder('t')
      .select('t.symbol', 'symbol')
      .addSelect('SUM(t.buy_volume + t.sell_volume)', 'vol')
      .where('t.timestamp >= :since', { since })
      .groupBy('t.symbol')
      .orderBy('SUM(t.buy_volume + t.sell_volume)', 'DESC')
      .limit(TOP_N)
      .getRawMany<{ symbol: string; vol: string }>();
    const coins = topRows.map((r) => r.symbol);
    if (coins.length === 0) return { coins: [], series: [], dataRange: { from: since, to: now } };

    // 2) 코인별 시간별 delta (buy - sell)
    const cvdRows = await this.takerRepo
      .createQueryBuilder('t')
      .select('t.symbol', 'symbol')
      .addSelect('t.timestamp', 'timestamp')
      .addSelect('SUM(t.buy_volume - t.sell_volume)', 'delta')
      .where('t.timestamp >= :since', { since })
      .andWhere('t.symbol IN (:...coins)', { coins })
      .groupBy('t.symbol')
      .addGroupBy('t.timestamp')
      .orderBy('t.timestamp', 'ASC')
      .getRawMany<{ symbol: string; timestamp: string; delta: string }>();

    // 3) 코인별 시간별 OI (정규화 분모)
    const oiRows = await this.oiRepo
      .createQueryBuilder('s')
      .select('s.symbol', 'symbol')
      .addSelect('s.timestamp', 'timestamp')
      .addSelect('SUM(s.open_interest)', 'oi')
      .where('s.timestamp >= :since', { since })
      .andWhere('s.symbol IN (:...coins)', { coins })
      .groupBy('s.symbol')
      .addGroupBy('s.timestamp')
      .getRawMany<{ symbol: string; timestamp: string; oi: string }>();
    const oiMap = new Map<string, number>();
    for (const r of oiRows) {
      oiMap.set(`${r.symbol}:${parseInt(r.timestamp, 10)}`, parseFloat(r.oi) || 0);
    }

    // 4) 누적 CVD + OI 정규화 + pivot (OI 없는 시점은 직전 OI를 carry-forward)
    const cum = new Map<string, number>();
    const lastOI = new Map<string, number>();
    const pivot = new Map<number, NormalizedCVDPoint>();
    for (const r of cvdRows) {
      const sym = r.symbol;
      const ts = parseInt(r.timestamp, 10);
      const delta = parseFloat(r.delta) || 0;
      const cumCvd = (cum.get(sym) ?? 0) + delta;
      cum.set(sym, cumCvd);
      const oi = oiMap.get(`${sym}:${ts}`) ?? lastOI.get(sym) ?? 0;
      if (oi > 0) lastOI.set(sym, oi);
      const norm = oi > 0 ? cumCvd / oi : 0;
      let point = pivot.get(ts);
      if (!point) {
        point = { timestamp: ts };
        pivot.set(ts, point);
      }
      point[sym] = norm;
    }

    const series = Array.from(pivot.values()).sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
    return { coins, series, dataRange: { from: since, to: now } };
  }
}
