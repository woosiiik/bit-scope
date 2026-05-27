/**
 * 청산 데이터 수집 모듈
 *
 * WebSocket(Binance/Bybit) + REST(OKX/Gate) 기반으로
 * 실시간 강제 청산 이벤트를 수집하고 집계 API를 제공한다.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LiquidationEntity } from './entities/liquidation.entity';
import { LiquidationCollectorService } from './liquidation-collector.service';
import { LiquidationService } from './liquidation.service';
import { LiquidationController } from './liquidation.controller';

@Module({
  imports: [TypeOrmModule.forFeature([LiquidationEntity])],
  controllers: [LiquidationController],
  providers: [LiquidationCollectorService, LiquidationService],
  exports: [LiquidationService],
})
export class LiquidationModule {}
