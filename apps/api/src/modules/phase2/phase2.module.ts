import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FundingOISnapshotEntity } from './entities/funding-oi-snapshot.entity';
import { TakerVolumeSnapshotEntity } from './entities/taker-volume-snapshot.entity';
import { BasisSnapshotEntity } from './entities/basis-snapshot.entity';

import { SymbolNormalizer } from './symbol-normalizer';
import { ExchangeBackoffManager } from './exchange-backoff-manager';

import { FundingOICollectorService } from './funding-oi-collector.service';
import { TakerVolumeCollectorService } from './taker-volume-collector.service';
import { BasisCollectorService } from './basis-collector.service';
import { DataCleanupService } from './data-cleanup.service';

import { FundingHeatmapService } from './funding-heatmap.service';
import { OIChangesService } from './oi-changes.service';
import { NormalizedCVDService } from './normalized-cvd.service';
import { BasisService } from './basis.service';

import { Phase2Controller } from './phase2.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FundingOISnapshotEntity,
      TakerVolumeSnapshotEntity,
      BasisSnapshotEntity,
    ]),
  ],
  controllers: [Phase2Controller],
  providers: [
    SymbolNormalizer,
    ExchangeBackoffManager,
    FundingOICollectorService,
    TakerVolumeCollectorService,
    BasisCollectorService,
    DataCleanupService,
    FundingHeatmapService,
    OIChangesService,
    NormalizedCVDService,
    BasisService,
  ],
  exports: [FundingOICollectorService],
})
export class Phase2Module {}
