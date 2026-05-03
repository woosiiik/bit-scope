/**
 * 텔레그램 모듈
 *
 * 텔레그램 봇을 통한 알림 기능을 캡슐화한다.
 * Bot API를 사용한 메시지 전송, 웹훅 수신, 인증 코드 기반 연결 관리를 담당한다.
 *
 * TELEGRAM_BOT_TOKEN 환경 변수가 설정되지 않으면
 * 서비스는 초기화되지만 모든 전송 기능이 비활성화된다.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TelegramConnectionEntity } from './entities/telegram-connection.entity';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TelegramConnectionEntity])],
  controllers: [TelegramController],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
