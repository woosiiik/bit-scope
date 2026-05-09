/**
 * 시장 인텔리전스 API 컨트롤러
 *
 * 공포/탐욕 지수, 경제 캘린더, 고래 알림 데이터를 제공한다.
 */

import { Controller, Get, Query } from '@nestjs/common';

import { FearGreedService } from './fear-greed.service';
import { EconomicCalendarService } from './economic-calendar.service';
import { WhaleAlertService } from './whale-alert.service';

@Controller('market-intel')
export class MarketIntelController {
  constructor(
    private readonly fearGreed: FearGreedService,
    private readonly calendar: EconomicCalendarService,
    private readonly whale: WhaleAlertService,
  ) {}

  @Get('fear-greed')
  getFearGreed() {
    return { success: true, data: this.fearGreed.getData() };
  }

  @Get('calendar')
  getCalendar(@Query('type') type?: string) {
    if (type === 'upcoming') {
      return { success: true, data: this.calendar.getUpcomingEvents() };
    }
    return { success: true, data: this.calendar.getRecentAndUpcoming() };
  }

  @Get('whale')
  getWhaleAlerts() {
    return { success: true, data: this.whale.getData() };
  }
}
