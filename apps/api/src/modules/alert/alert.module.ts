/**
 * 알림 모듈
 *
 * 가격 알림 및 김치 프리미엄 알림 기능을 캡슐화한다.
 * PriceModule에서 제공하는 PriceGateway를 사용하여 사용자에게 알림을 전송하고,
 * PremiumModule에서 제공하는 PremiumService로 김프 조건을 평가한다.
 * TypeORM 리포지토리를 통해 알림 설정 및 이력을 DB에 관리한다.
 *
 * @see 요구사항 6.1, 6.2, 6.5, 6.6, 6.7, 12.11
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AlertEntity } from './entities/alert.entity';
import { AlertHistoryEntity } from './entities/alert-history.entity';
import { AlertService } from './alert.service';
import { AlertController } from './alert.controller';
import { PriceModule } from '../price/price.module';
import { PremiumModule } from '../premium/premium.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AlertEntity, AlertHistoryEntity]),
    // PriceGateway를 사용하여 WebSocket 알림을 전송하기 위해 PriceModule import
    PriceModule,
    // PremiumService를 사용하여 김치 프리미엄 조건을 평가하기 위해 PremiumModule import
    PremiumModule,
    // TelegramService를 사용하여 텔레그램 알림을 전송하기 위해 TelegramModule import
    TelegramModule,
  ],
  controllers: [AlertController],
  providers: [AlertService],
  exports: [AlertService],
})
export class AlertModule {}
