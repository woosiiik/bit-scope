/**
 * 청산 데이터 REST API 컨트롤러
 *
 * GET /liquidations?symbol=BTC&period=1d
 * 지정 기간의 청산 데이터를 시간별로 집계하여 반환한다.
 */

import { Controller, Get, Query, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { LiquidationService } from './liquidation.service';

@Controller('liquidations')
export class LiquidationController {
  private readonly logger = new Logger(LiquidationController.name);

  constructor(private readonly liquidationService: LiquidationService) {}

  /**
   * 집계된 청산 데이터 조회
   *
   * @param symbol 코인 심볼 (예: BTC)
   * @param period 기간 (1d, 1w, 1m)
   */
  @Get()
  async getAggregatedLiquidations(
    @Query('symbol') symbol?: string,
    @Query('period') period?: string,
  ) {
    const coin = symbol?.toUpperCase() ?? 'BTC';
    const p = period ?? '1d';

    const hoursMap: Record<string, number> = {
      '1d': 24,
      '1w': 168,
      '1m': 720,
    };
    const hours = hoursMap[p] ?? 24;

    try {
      const data = await this.liquidationService.getAggregated(coin, hours);
      return { success: true, data, symbol: coin, period: p, timestamp: Date.now() };
    } catch (err) {
      this.logger.error(`Liquidation 조회 실패: ${err instanceof Error ? err.message : String(err)}`);
      throw new HttpException({ success: false, error: { message: '청산 데이터 조회 실패' } }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 최근 청산 이벤트 요약 (전 코인)
   */
  @Get('summary')
  async getLiquidationSummary() {
    try {
      const data = await this.liquidationService.getRecentSummary();
      return { success: true, data, timestamp: Date.now() };
    } catch (err) {
      this.logger.error(`Liquidation summary 실패: ${err instanceof Error ? err.message : String(err)}`);
      throw new HttpException({ success: false, error: { message: '청산 요약 조회 실패' } }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
