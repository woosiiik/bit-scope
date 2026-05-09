/**
 * BitScope API 루트 모듈
 *
 * TypeORM(MySQL), Schedule(cron) 등 글로벌 모듈을 설정하고,
 * 각 기능 모듈을 통합한다.
 */

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { getDatabaseConfig } from './config/database.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SnapshotModule } from './modules/snapshot/snapshot.module';
import { PriceModule } from './modules/price/price.module';
import { PremiumModule } from './modules/premium/premium.module';
import { AlertModule } from './modules/alert/alert.module';
import { ReportModule } from './modules/report/report.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { NewsModule } from './modules/news/news.module';

@Module({
  imports: [
    // 환경 변수 로드 (.env 파일)
    ConfigModule.forRoot({ isGlobal: true }),
    // TypeORM MySQL 연결
    // forRootAsync를 사용하여 ConfigModule이 .env 파일을 로드한 후에
    // 데이터베이스 설정을 읽도록 한다. 동기식 forRoot(getDatabaseConfig())는
    // 모듈 데코레이터 평가 시점에 process.env를 읽으므로
    // .env 파일의 값이 아직 로드되지 않은 상태일 수 있다.
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: () => getDatabaseConfig(),
    }),
    // NestJS 스케줄러 (cron 기반 정기 작업)
    ScheduleModule.forRoot(),
    // 포트폴리오 스냅샷 모듈
    SnapshotModule,
    // 실시간 시세 모니터링 모듈
    PriceModule,
    // 김치 프리미엄(거래소 간 시세 차이) 분석 모듈
    PremiumModule,
    // 가격/김프 알림 모듈
    AlertModule,
    // 리포트 생성 및 데이터 내보내기 모듈
    ReportModule,
    // 텔레그램 봇 알림 모듈
    TelegramModule,
    // 크립토 뉴스 피드 모듈
    NewsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
