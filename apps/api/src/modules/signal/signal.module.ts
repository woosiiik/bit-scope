/**
 * 시그널 모듈
 *
 * 롱/숏 시그널 수집, 저장, 인증, API를 제공한다.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';

import { SignalEntity } from './entities/signal.entity';
import { SystemConfigEntity } from './entities/system-config.entity';
import { SignalController } from './signal.controller';
import { SystemConfigService } from './services/system-config.service';
import { SignalService } from './services/signal.service';
import { SignalAuthService } from './services/signal-auth.service';
import { SignalParserService } from './services/signal-parser.service';
import { TelegramUserService } from './services/telegram-user.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SignalEntity, SystemConfigEntity]),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
  ],
  controllers: [SignalController],
  providers: [
    SystemConfigService,
    SignalService,
    SignalAuthService,
    SignalParserService,
    TelegramUserService,
  ],
  exports: [SignalService],
})
export class SignalModule {}
