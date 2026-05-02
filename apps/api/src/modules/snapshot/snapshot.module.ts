/**
 * 포트폴리오 스냅샷 모듈
 *
 * 스냅샷 저장 및 조회 기능을 캡슐화한다.
 * TypeORM 리포지토리를 통해 DB 접근을 관리한다.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PortfolioSnapshotEntity } from './entities/portfolio-snapshot.entity';
import { SnapshotHoldingEntity } from './entities/snapshot-holding.entity';
import { SnapshotService } from './snapshot.service';
import { SnapshotController } from './snapshot.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PortfolioSnapshotEntity, SnapshotHoldingEntity]),
  ],
  controllers: [SnapshotController],
  providers: [SnapshotService],
  exports: [SnapshotService],
})
export class SnapshotModule {}
