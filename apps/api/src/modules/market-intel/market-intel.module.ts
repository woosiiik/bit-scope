import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FearGreedService } from './fear-greed.service';
import { EconomicCalendarService } from './economic-calendar.service';
import { WhaleAlertService } from './whale-alert.service';
import { MarketIntelController } from './market-intel.controller';
import { CustomCalendarEventEntity } from './entities/custom-calendar-event.entity';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([CustomCalendarEventEntity]),
  ],
  controllers: [MarketIntelController],
  providers: [FearGreedService, EconomicCalendarService, WhaleAlertService],
})
export class MarketIntelModule {}
