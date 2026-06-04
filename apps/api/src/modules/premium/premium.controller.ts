/**
 * 김치 프리미엄 컨트롤러
 *
 * 국내 거래소 vs 바이낸스 시세 차이(김치 프리미엄) 조회를 위한 REST API 엔드포인트를 제공한다.
 * 사용자가 비교 기준 국내 거래소를 선택할 수 있다.
 *
 * @see 요구사항 3.2, 3.5, 3.6
 */

import {
  Controller,
  Get,
  Param,
  Query,
  Logger,
} from '@nestjs/common';

import type { ExchangeType, KimchiPremiumData } from '@bitscope/shared';
import { DOMESTIC_EXCHANGES } from '@bitscope/shared';

import { PremiumService, PremiumHistoryPeriod } from './premium.service';
import { QueryPremiumDto } from './dto/query-premium.dto';
import { KimchiPremiumHistoryEntity } from './entities/kimchi-premium-history.entity';

/**
 * exchange 쿼리 파라미터를 유효한 ExchangeType으로 파싱한다.
 * 유효하지 않은 값이면 기본값 'upbit'을 반환한다.
 */
function parseDomesticExchange(exchange?: string): ExchangeType {
  if (
    exchange &&
    DOMESTIC_EXCHANGES.includes(exchange as ExchangeType)
  ) {
    return exchange as ExchangeType;
  }
  return 'upbit';
}

@Controller('premium')
export class PremiumController {
  private readonly logger = new Logger(PremiumController.name);

  constructor(private readonly premiumService: PremiumService) {}

  /**
   * GET /premium?exchange=upbit&limit=20
   *
   * 현재 시점의 주요 코인 프리미엄 목록을 반환한다.
   * 김프 비율(실제값) 기준 내림차순으로 정렬되어 있다.
   *
   * @param exchange 비교 기준 국내 거래소 (upbit | bithumb | coinone, 기본: upbit)
   * @param limit 반환할 최대 코인 수 (기본: 10)
   */
  @Get()
  getTopPremiums(
    @Query('exchange') exchange?: string,
    @Query('limit') limit?: string,
  ): KimchiPremiumData[] {
    const domesticExchange = parseDomesticExchange(exchange);
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    const effectiveLimit = isNaN(parsedLimit) || parsedLimit <= 0 ? 10 : parsedLimit;

    this.logger.log(
      `프리미엄 상위 목록 조회 - exchange: ${domesticExchange}, limit: ${effectiveLimit}`,
    );
    return this.premiumService.getTopPremiumCoins(effectiveLimit, domesticExchange);
  }

  /**
   * GET /premium/:symbol?exchange=upbit
   *
   * 특정 코인의 현재 김치 프리미엄을 반환한다.
   * 가격 데이터가 부족하면 null을 반환한다.
   *
   * @param symbol 코인 심볼 (예: "BTC")
   * @param exchange 비교 기준 국내 거래소 (기본: upbit)
   */
  @Get(':symbol')
  getPremium(
    @Param('symbol') symbol: string,
    @Query('exchange') exchange?: string,
  ): KimchiPremiumData | null {
    const domesticExchange = parseDomesticExchange(exchange);

    this.logger.log(
      `프리미엄 조회 - symbol: ${symbol}, exchange: ${domesticExchange}`,
    );
    return this.premiumService.calculatePremium(
      symbol.toUpperCase(),
      domesticExchange,
    );
  }

  /**
   * GET /premium/:symbol/history?period=24h&exchange=upbit
   *
   * 특정 코인의 프리미엄 이력을 조회한다.
   * period 쿼리 파라미터로 조회 기간을 지정할 수 있다 (24h, 7d, 30d).
   * exchange 쿼리 파라미터로 비교 기준 국내 거래소를 지정할 수 있다.
   *
   * @param symbol 코인 심볼 (예: "BTC")
   * @param query 조회 기간 쿼리 파라미터
   * @param exchange 비교 기준 국내 거래소 (기본: upbit)
   */
  @Get(':symbol/history')
  async getPremiumHistory(
    @Param('symbol') symbol: string,
    @Query() query: QueryPremiumDto,
    @Query('exchange') exchange?: string,
  ): Promise<KimchiPremiumHistoryEntity[]> {
    const period = (query.period as PremiumHistoryPeriod) || '24h';
    const domesticExchange = parseDomesticExchange(exchange);

    this.logger.log(
      `프리미엄 이력 조회 - symbol: ${symbol}, period: ${period}, exchange: ${domesticExchange}`,
    );

    return this.premiumService.getPremiumHistory(
      symbol.toUpperCase(),
      period,
      domesticExchange,
    );
  }
}
