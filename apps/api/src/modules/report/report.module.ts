/**
 * 리포트 모듈
 *
 * 수동/자동 리포트 생성, 정기 스케줄 관리,
 * 데이터 내보내기(CSV, JSON, PDF) 기능을 캡슐화한다.
 *
 * SnapshotModule에서 제공하는 SnapshotService를 사용하여
 * 포트폴리오 스냅샷 데이터를 기반으로 리포트를 생성한다.
 * NestJS ScheduleModule을 통해 정기 리포트 cron 스케줄링을 수행한다.
 *
 * @see 요구사항 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 12.13
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ReportEntity } from './entities/report.entity';
import { ReportScheduleEntity } from './entities/report-schedule.entity';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { SnapshotModule } from '../snapshot/snapshot.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReportEntity, ReportScheduleEntity]),
    // SnapshotService를 사용하여 포트폴리오 스냅샷 데이터를 조회하기 위해 import
    SnapshotModule,
  ],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
