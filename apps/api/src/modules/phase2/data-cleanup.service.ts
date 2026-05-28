import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';

import { FundingOISnapshotEntity } from './entities/funding-oi-snapshot.entity';
import { TakerVolumeSnapshotEntity } from './entities/taker-volume-snapshot.entity';
import { BasisSnapshotEntity } from './entities/basis-snapshot.entity';

const RETENTION_DAYS = 90;

@Injectable()
export class DataCleanupService {
  private readonly logger = new Logger(DataCleanupService.name);

  constructor(
    @InjectRepository(FundingOISnapshotEntity)
    private readonly fundingRepo: Repository<FundingOISnapshotEntity>,
    @InjectRepository(TakerVolumeSnapshotEntity)
    private readonly takerRepo: Repository<TakerVolumeSnapshotEntity>,
    @InjectRepository(BasisSnapshotEntity)
    private readonly basisRepo: Repository<BasisSnapshotEntity>,
  ) {}

  @Cron('0 3 * * *') // 매일 03:00
  async cleanup(): Promise<void> {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 3600 * 1000;

    const [f, t, b] = await Promise.all([
      this.fundingRepo.delete({ timestamp: LessThan(cutoff) }),
      this.takerRepo.delete({ timestamp: LessThan(cutoff) }),
      this.basisRepo.delete({ timestamp: LessThan(cutoff) }),
    ]);

    this.logger.log(`데이터 정리 완료 (${RETENTION_DAYS}일 경과): funding=${f.affected ?? 0}, taker=${t.affected ?? 0}, basis=${b.affected ?? 0}`);
  }
}
