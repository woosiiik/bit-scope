/**
 * 선물 마켓 데이터 API 컨트롤러
 *
 * GET /futures/symbols - 지원 심볼 목록
 * GET /futures/indicators?symbol=BTCUSDT - 전체 지표 조회
 */

import { Controller, Get, Query } from '@nestjs/common';

import { FuturesCollectorService } from './futures-collector.service';

@Controller('futures')
export class FuturesController {
  constructor(private readonly collector: FuturesCollectorService) {}

  /**
   * 지원하는 선물 심볼 목록을 반환한다.
   */
  @Get('symbols')
  getSymbols() {
    return {
      success: true,
      data: this.collector.getSymbols(),
    };
  }

  /**
   * 특정 심볼의 전체 선물 지표를 반환한다.
   */
  @Get('indicators')
  getIndicators(@Query('symbol') symbol?: string) {
    const targetSymbol = (symbol ?? 'BTCUSDT').toUpperCase();
    const data = this.collector.getData(targetSymbol);

    if (!data) {
      return {
        success: true,
        data: null,
        message: '아직 수집된 데이터가 없습니다. 잠시 후 다시 시도해주세요.',
      };
    }

    return {
      success: true,
      data,
    };
  }
}
