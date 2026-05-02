/**
 * BitScope API 루트 모듈
 *
 * TypeORM(MySQL), Schedule(cron) 등 글로벌 모듈을 설정하고,
 * 각 기능 모듈을 통합한다.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { getDatabaseConfig } from './config/database.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SnapshotModule } from './modules/snapshot/snapshot.module';
import { PriceModule } from './modules/price/price.module';
import { PremiumModule } from './modules/premium/premium.module';

@Module({
  imports: [
    // TypeORM MySQL 연결
    TypeOrmModule.forRoot(getDatabaseConfig()),
    // NestJS 스케줄러 (cron 기반 정기 작업)
    ScheduleModule.forRoot(),
    // 포트폴리오 스냅샷 모듈
    SnapshotModule,
    // 실시간 시세 모니터링 모듈
    PriceModule,
    // 김치 프리미엄(거래소 간 시세 차이) 분석 모듈
    PremiumModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
