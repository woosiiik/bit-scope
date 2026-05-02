/**
 * 김치 프리미엄 모듈
 *
 * 거래소 간 시세 차이(김치 프리미엄) 계산, 이력 저장/조회 기능을 캡슐화한다.
 * PriceModule에서 제공하는 PriceMonitorService를 의존하여 실시간 시세를 참조하고,
 * TypeORM 리포지토리를 통해 프리미엄 이력을 DB에 관리한다.
 *
 * @see 요구사항 3.2, 3.6
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { KimchiPremiumHistoryEntity } from './entities/kimchi-premium-history.entity';
import { PremiumService } from './premium.service';
import { PremiumController } from './premium.controller';
import { PriceModule } from '../price/price.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([KimchiPremiumHistoryEntity]),
    // PriceMonitorService를 사용하기 위해 PriceModule을 import
    PriceModule,
  ],
  controllers: [PremiumController],
  providers: [PremiumService],
  exports: [PremiumService],
})
export class PremiumModule {}
