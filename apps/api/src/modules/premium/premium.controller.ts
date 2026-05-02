/**
 * 김치 프리미엄 컨트롤러
 *
 * 거래소 간 시세 차이(김치 프리미엄) 조회를 위한 REST API 엔드포인트를 제공한다.
 * 실시간 프리미엄 계산 결과 및 이력 데이터를 클라이언트에 반환한다.
 *
 * @see 요구사항 3.2, 3.6
 */

import {
  Controller,
  Get,
  Param,
  Query,
  Logger,
} from '@nestjs/common';

import type { KimchiPremiumData } from '@bitscope/shared';

import { PremiumService, PremiumHistoryPeriod } from './premium.service';
import { QueryPremiumDto } from './dto/query-premium.dto';
import { KimchiPremiumHistoryEntity } from './entities/kimchi-premium-history.entity';

@Controller('premium')
export class PremiumController {
  private readonly logger = new Logger(PremiumController.name);

  constructor(private readonly premiumService: PremiumService) {}

  /**
   * GET /premium
   *
   * 현재 시점의 주요 코인 프리미엄 목록을 반환한다.
   * 프리미엄 비율(절대값) 기준 내림차순으로 정렬되어 있다.
   */
  @Get()
  getTopPremiums(
    @Query('limit') limit?: string,
  ): KimchiPremiumData[] {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    const effectiveLimit = isNaN(parsedLimit) || parsedLimit <= 0 ? 10 : parsedLimit;

    this.logger.log(`프리미엄 상위 목록 조회 - limit: ${effectiveLimit}`);
    return this.premiumService.getTopPremiumCoins(effectiveLimit);
  }

  /**
   * GET /premium/:symbol
   *
   * 특정 코인의 현재 김치 프리미엄을 반환한다.
   * 가격 데이터가 부족하면 null을 반환한다.
   */
  @Get(':symbol')
  getPremium(
    @Param('symbol') symbol: string,
  ): KimchiPremiumData | null {
    this.logger.log(`프리미엄 조회 - symbol: ${symbol}`);
    return this.premiumService.calculatePremium(symbol.toUpperCase());
  }

  /**
   * GET /premium/:symbol/history
   *
   * 특정 코인의 프리미엄 이력을 조회한다.
   * period 쿼리 파라미터로 조회 기간을 지정할 수 있다 (24h, 7d, 30d).
   *
   * @param symbol 코인 심볼 (예: "BTC")
   * @param query 조회 기간 쿼리 파라미터
   */
  @Get(':symbol/history')
  async getPremiumHistory(
    @Param('symbol') symbol: string,
    @Query() query: QueryPremiumDto,
  ): Promise<KimchiPremiumHistoryEntity[]> {
    const period = (query.period as PremiumHistoryPeriod) || '24h';

    this.logger.log(
      `프리미엄 이력 조회 - symbol: ${symbol}, period: ${period}`,
    );

    return this.premiumService.getPremiumHistory(
      symbol.toUpperCase(),
      period,
    );
  }
}
