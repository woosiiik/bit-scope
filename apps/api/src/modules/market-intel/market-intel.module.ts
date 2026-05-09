import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { FearGreedService } from './fear-greed.service';
import { EconomicCalendarService } from './economic-calendar.service';
import { WhaleAlertService } from './whale-alert.service';
import { MarketIntelController } from './market-intel.controller';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [MarketIntelController],
  providers: [FearGreedService, EconomicCalendarService, WhaleAlertService],
})
export class MarketIntelModule {}
