/**
 * KimchiPremiumService - 김치 프리미엄 서비스
 *
 * 거래소 간 시세 차이(김치 프리미엄)를 계산하고, 이력을 DB에 저장한다.
 * PriceMonitorService로부터 실시간 시세를 수신하여 거래소 간 가격 비교를 수행한다.
 * 1분 간격으로 프리미엄 스냅샷을 DB에 기록하여 이력 분석을 지원한다.
 *
 * @see 설계 문서 3.3.6 KimchiPremiumService
 * @see 요구사항 3.2, 3.6
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';

import type { ExchangeType, KimchiPremiumData } from '@bitscope/shared';
import {
  SUPPORTED_EXCHANGES,
  DEFAULT_PREMIUM_COINS,
  MAJOR_COIN_SYMBOLS,
} from '@bitscope/shared';

import { KimchiPremiumHistoryEntity } from './entities/kimchi-premium-history.entity';
import { PriceMonitorService, PriceEntry } from '../price/price-monitor.service';

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
   * 특정 코인의 거래소 간 김치 프리미엄을 계산한다.
   *
   * PriceMonitorService의 최신 가격 데이터를 기반으로
   * 각 거래소의 시세를 비교하여 프리미엄(가격 차이, 비율)을 산출한다.
   *
   * @param symbol 코인 심볼 (예: "BTC", "ETH")
   * @returns 김치 프리미엄 데이터 또는 null (가격 데이터가 2개 미만인 경우)
   */
  calculatePremium(symbol: string): KimchiPremiumData | null {
    const prices: Partial<Record<ExchangeType, number>> = {};
    let maxPrice: { exchange: ExchangeType; price: number } | null = null;
    let minPrice: { exchange: ExchangeType; price: number } | null = null;

    // 각 거래소의 현재 가격을 수집
    for (const exchange of SUPPORTED_EXCHANGES) {
      const priceEntry = this.priceMonitorService.getCurrentPrice(exchange, symbol);
      if (priceEntry && priceEntry.price > 0) {
        prices[exchange] = priceEntry.price;

        if (!maxPrice || priceEntry.price > maxPrice.price) {
          maxPrice = { exchange, price: priceEntry.price };
        }
        if (!minPrice || priceEntry.price < minPrice.price) {
          minPrice = { exchange, price: priceEntry.price };
        }
      }
    }

    // 최소 2개 거래소의 가격 데이터가 있어야 비교가 가능
    const availableCount = Object.keys(prices).length;
    if (availableCount < 2 || !maxPrice || !minPrice) {
      return null;
    }

    const premiumAmount = maxPrice.price - minPrice.price;
    // 프리미엄 비율: (최고가 - 최저가) / 최저가 * 100
    const premiumRate = (premiumAmount / minPrice.price) * 100;

    return {
      symbol,
      prices,
      maxPrice,
      minPrice,
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
   * @returns 프리미엄 이력 엔티티 배열
   */
  async getPremiumHistory(
    symbol: string,
    period: PremiumHistoryPeriod,
  ): Promise<KimchiPremiumHistoryEntity[]> {
    const durationMs = PERIOD_DURATION_MS[period];
    const now = new Date();
    const start = new Date(now.getTime() - durationMs);

    return this.premiumHistoryRepository.find({
      where: {
        symbol: symbol.toUpperCase(),
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
   * @returns 프리미엄 비율 내림차순 정렬된 김치 프리미엄 데이터 배열
   */
  getTopPremiumCoins(limit: number = 10): KimchiPremiumData[] {
    const premiumDataList: KimchiPremiumData[] = [];

    for (const symbol of MAJOR_COIN_SYMBOLS) {
      const premium = this.calculatePremium(symbol);
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
   * 프리미엄을 계산하고 DB에 기록한다.
   * NestJS 스케줄러에 의해 1분 간격으로 자동 호출된다.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async savePremiumSnapshot(): Promise<void> {
    if (!this.priceMonitorService.isActive()) {
      return;
    }

    const entitiesToSave: KimchiPremiumHistoryEntity[] = [];

    for (const symbol of DEFAULT_PREMIUM_COINS) {
      const premium = this.calculatePremium(symbol);
      if (!premium) {
        continue;
      }

      const entity = new KimchiPremiumHistoryEntity();
      entity.symbol = symbol;
      entity.upbitPrice = Number(premium.prices.upbit ?? 0);
      entity.bithumbPrice = Number(premium.prices.bithumb ?? 0);
      entity.coinonePrice = Number(premium.prices.coinone ?? 0);
      entity.premiumRate = Number(premium.premiumRate.toFixed(4));

      entitiesToSave.push(entity);
    }

    if (entitiesToSave.length === 0) {
      return;
    }

    try {
      await this.premiumHistoryRepository.save(entitiesToSave);
      this.logger.debug(
        `프리미엄 스냅샷 저장 완료: ${entitiesToSave.length}개 코인`,
      );
    } catch (error) {
      this.logger.error(
        `프리미엄 스냅샷 저장 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
