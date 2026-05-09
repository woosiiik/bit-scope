/**
 * 선물 마켓 데이터 모듈
 *
 * 바이낸스 Futures 공개 API에서 선물 지표를 수집하고 REST API로 제공한다.
 */

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { FuturesCollectorService } from './futures-collector.service';
import { FuturesController } from './futures.controller';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [FuturesController],
  providers: [FuturesCollectorService],
  exports: [FuturesCollectorService],
})
export class FuturesModule {}
