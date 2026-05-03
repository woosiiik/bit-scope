/**
 * KimchiPremiumService - 김치 프리미엄 서비스
 *
 * 국내 거래소 가격과 바이낸스 USDT 가격을 비교하여 진짜 김치 프리미엄을 계산한다.
 *
 * 김프 계산 공식:
 * 김프(%) = (국내가격 - 바이낸스USDT가격 x USDT/KRW환율) / (바이낸스USDT가격 x USDT/KRW환율) x 100
 *
 * - USDT/KRW 환율: 업비트 KRW-USDT 마켓 시세 사용
 * - 바이낸스 시세: GET https://api.binance.com/api/v3/ticker/price (공개 API, 키 불필요)
 * - 사용자가 비교할 국내 거래소를 선택할 수 있다 (업비트/빗썸/코인원)
 *
 * @see 요구사항 3.2, 3.5, 3.6
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';

import type { ExchangeType, KimchiPremiumData } from '@bitscope/shared';
import {
  DOMESTIC_EXCHANGES,
  DEFAULT_PREMIUM_COINS,
  MAJOR_COIN_SYMBOLS,
} from '@bitscope/shared';

import { KimchiPremiumHistoryEntity } from './entities/kimchi-premium-history.entity';
import { PriceMonitorService } from '../price/price-monitor.service';

/** 프리미엄 이력 조회 기간 타입 */
export type PremiumHistoryPeriod = '24h' | '7d' | '30d';

/** 프리미엄 이력 조회 기간별 밀리초 매핑 */
const PERIOD_DURATION_MS: Record<PremiumHistoryPeriod, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

@Injectable()
export class PremiumService {
  private readonly logger = new Logger(PremiumService.name);

  constructor(
    @InjectRepository(KimchiPremiumHistoryEntity)
    private readonly premiumHistoryRepository: Repository<KimchiPremiumHistoryEntity>,
    private readonly priceMonitorService: PriceMonitorService,
  ) {}

  /**
   * 특정 코인의 김치 프리미엄을 계산한다.
   *
   * 국내 거래소 가격과 바이낸스 USDT 가격 x USDT/KRW 환율을 비교하여
   * 진짜 김치 프리미엄(국내 vs 해외)을 산출한다.
   *
   * @param symbol 코인 심볼 (예: "BTC", "ETH")
   * @param domesticExchange 비교 기준 국내 거래소 (기본: upbit)
   * @returns 김치 프리미엄 데이터 또는 null (데이터 부족 시)
   */
  calculatePremium(
    symbol: string,
    domesticExchange: ExchangeType = 'upbit',
  ): KimchiPremiumData | null {
    // 국내 거래소 가격 조회
    const domesticPriceEntry = this.priceMonitorService.getCurrentPrice(
      domesticExchange,
      symbol,
    );
    if (!domesticPriceEntry || domesticPriceEntry.price <= 0) {
      return null;
    }

    // 바이낸스 USDT 가격 조회
    const binanceEntry = this.priceMonitorService.getBinancePrice(symbol);
    if (!binanceEntry || binanceEntry.usdtPrice <= 0) {
      return null;
    }

    // USDT/KRW 환율 조회
    const usdtKrwRate = this.priceMonitorService.getUsdtKrwRate();
    if (usdtKrwRate <= 0) {
      return null;
    }

    const domesticPrice = domesticPriceEntry.price;
    const binanceUsdtPrice = binanceEntry.usdtPrice;
    const binanceKrwPrice = binanceUsdtPrice * usdtKrwRate;

    // 김프(%) = (국내가격 - 바이낸스KRW환산가) / 바이낸스KRW환산가 * 100
    const premiumAmount = domesticPrice - binanceKrwPrice;
    const premiumRate = (premiumAmount / binanceKrwPrice) * 100;

    return {
      symbol,
      domesticExchange,
      domesticPrice,
      binanceUsdtPrice,
      usdtKrwRate,
      binanceKrwPrice,
      premiumAmount,
      premiumRate,
      timestamp: Date.now(),
    };
  }

  /**
   * 특정 코인의 프리미엄 이력을 조회한다.
   *
   * 지정된 기간(24시간/7일/30일)의 김치 프리미엄 이력을 DB에서 조회한다.
   *
   * @param symbol 코인 심볼 (예: "BTC")
   * @param period 조회 기간 ('24h', '7d', '30d')
   * @param domesticExchange 국내 거래소 (기본: upbit)
   * @returns 프리미엄 이력 엔티티 배열
   */
  async getPremiumHistory(
    symbol: string,
    period: PremiumHistoryPeriod,
    domesticExchange: ExchangeType = 'upbit',
  ): Promise<KimchiPremiumHistoryEntity[]> {
    const durationMs = PERIOD_DURATION_MS[period];
    const now = new Date();
    const start = new Date(now.getTime() - durationMs);

    return this.premiumHistoryRepository.find({
      where: {
        symbol: symbol.toUpperCase(),
        domesticExchange,
        recordedAt: Between(start, now),
      },
      order: {
        recordedAt: 'ASC',
      },
    });
  }

  /**
   * 프리미엄이 높은 상위 코인 목록을 반환한다.
   *
   * 주요 코인 심볼에 대해 프리미엄을 계산하고,
   * 프리미엄 비율이 높은 순서로 정렬하여 반환한다.
   *
   * @param limit 반환할 최대 코인 수 (기본 10)
   * @param domesticExchange 비교 기준 국내 거래소 (기본: upbit)
   * @returns 프리미엄 비율 내림차순 정렬된 김치 프리미엄 데이터 배열
   */
  getTopPremiumCoins(
    limit: number = 10,
    domesticExchange: ExchangeType = 'upbit',
  ): KimchiPremiumData[] {
    const premiumDataList: KimchiPremiumData[] = [];

    for (const symbol of MAJOR_COIN_SYMBOLS) {
      const premium = this.calculatePremium(symbol, domesticExchange);
      if (premium) {
        premiumDataList.push(premium);
      }
    }

    // 프리미엄 비율의 절대값 기준 내림차순 정렬
    premiumDataList.sort(
      (a, b) => Math.abs(b.premiumRate) - Math.abs(a.premiumRate),
    );

    return premiumDataList.slice(0, limit);
  }

  /**
   * 현재 시점의 프리미엄 스냅샷을 DB에 저장한다.
   *
   * 기본 프리미엄 모니터링 대상 코인(DEFAULT_PREMIUM_COINS)에 대해
   * 모든 국내 거래소 기준으로 프리미엄을 계산하고 DB에 기록한다.
   * NestJS 스케줄러에 의해 1분 간격으로 자동 호출된다.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async savePremiumSnapshot(): Promise<void> {
    if (!this.priceMonitorService.isActive()) {
      return;
    }

    const entitiesToSave: KimchiPremiumHistoryEntity[] = [];

    for (const symbol of DEFAULT_PREMIUM_COINS) {
      // 각 국내 거래소 기준으로 김프 스냅샷 저장 (바이낸스 vs 바이낸스 비교는 무의미하므로 국내 거래소만)
      for (const exchange of DOMESTIC_EXCHANGES) {
        const premium = this.calculatePremium(symbol, exchange);
        if (!premium) {
          continue;
        }

        const entity = new KimchiPremiumHistoryEntity();
        entity.symbol = symbol;
        entity.domesticExchange = exchange;
        entity.domesticPrice = Number(premium.domesticPrice);
        entity.binanceUsdtPrice = Number(premium.binanceUsdtPrice);
        entity.usdtKrwRate = Number(premium.usdtKrwRate);
        entity.premiumRate = Number(premium.premiumRate.toFixed(4));

        entitiesToSave.push(entity);
      }
    }

    if (entitiesToSave.length === 0) {
      return;
    }

    try {
      await this.premiumHistoryRepository.save(entitiesToSave);
      this.logger.debug(
        `프리미엄 스냅샷 저장 완료: ${entitiesToSave.length}개 항목`,
      );
    } catch (error) {
      this.logger.error(
        `프리미엄 스냅샷 저장 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
