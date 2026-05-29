/**
 * 코인 집계 로직
 * 6개 거래소의 NormalizedTicker를 심볼별로 그룹화하고 가중 평균/합산으로 집계한다.
 */

import type { FuturesExchangeType } from '@bitscope/shared';
import type { NormalizedTicker, AggregatedCoin, ExchangeTotal } from '@bitscope/shared';
import { COIN_MARKET_CAP_MAP, COIN_SECTOR_MAP, EXCHANGE_COLORS } from '@bitscope/shared';

export interface AggregationResult {
  coins: AggregatedCoin[];
  exchangeVolumes: ExchangeTotal[];
  exchangeOI: ExchangeTotal[];
}

export function aggregateCoins(allTickers: NormalizedTicker[]): AggregationResult {
  // 1. 심볼별 그룹화
  const groups = new Map<string, NormalizedTicker[]>();
  for (const ticker of allTickers) {
    const existing = groups.get(ticker.symbol) ?? [];
    existing.push(ticker);
    groups.set(ticker.symbol, existing);
  }

  // 2. 심볼별 집계
  const coins: AggregatedCoin[] = [];
  for (const [symbol, tickers] of groups) {
    const totalVolume = tickers.reduce((s, t) => s + t.volume24h, 0);
    const totalOI = tickers.reduce((s, t) => s + t.openInterest, 0);

    // 가격: 거래량 가중 평균
    let price = 0;
    if (totalVolume > 0) {
      price = tickers.reduce((s, t) => s + t.price * t.volume24h, 0) / totalVolume;
    } else {
      price = tickers[0]?.price ?? 0;
    }

    // 변화율: 거래량 가중 평균
    let change24h = 0;
    if (totalVolume > 0) {
      change24h = tickers.reduce((s, t) => s + t.change24h * t.volume24h, 0) / totalVolume;
    } else {
      change24h = tickers[0]?.change24h ?? 0;
    }

    // 펀딩비율: OI 가중 평균
    let fundingRate = 0;
    if (totalOI > 0) {
      fundingRate = tickers.reduce((s, t) => s + t.fundingRate * t.openInterest, 0) / totalOI;
    } else {
      const tickersWithFunding = tickers.filter((t) => t.fundingRate !== 0);
      if (tickersWithFunding.length > 0) {
        fundingRate = tickersWithFunding.reduce((s, t) => s + t.fundingRate, 0) / tickersWithFunding.length;
      }
    }

    coins.push({
      symbol,
      price,
      change24h,
      volume24h: totalVolume,
      openInterest: totalOI,
      fundingRate,
      exchangeCount: tickers.length,
      // 매핑에 없는 코인은 undefined로 두어 시가총액 필터(Large/Mid/Small)에서 제외
      marketCap: COIN_MARKET_CAP_MAP[symbol],
      sectors: COIN_SECTOR_MAP[symbol] ?? [],
    });
  }

  // 거래량 내림차순 정렬
  coins.sort((a, b) => b.volume24h - a.volume24h);

  // 3. 거래소별 총 거래량/OI
  const exchangeVolumeMap = new Map<FuturesExchangeType, number>();
  const exchangeOIMap = new Map<FuturesExchangeType, number>();

  for (const ticker of allTickers) {
    exchangeVolumeMap.set(ticker.exchange, (exchangeVolumeMap.get(ticker.exchange) ?? 0) + ticker.volume24h);
    exchangeOIMap.set(ticker.exchange, (exchangeOIMap.get(ticker.exchange) ?? 0) + ticker.openInterest);
  }

  const exchanges: FuturesExchangeType[] = ['binance', 'bybit', 'okx', 'gate', 'bitget', 'hyperliquid'];

  const exchangeVolumes: ExchangeTotal[] = exchanges
    .map((ex) => ({
      exchange: ex,
      totalVolume: exchangeVolumeMap.get(ex) ?? 0,
      totalOI: exchangeOIMap.get(ex) ?? 0,
      color: EXCHANGE_COLORS[ex],
    }))
    .sort((a, b) => b.totalVolume - a.totalVolume);

  const exchangeOI: ExchangeTotal[] = exchanges
    .map((ex) => ({
      exchange: ex,
      totalVolume: exchangeVolumeMap.get(ex) ?? 0,
      totalOI: exchangeOIMap.get(ex) ?? 0,
      color: EXCHANGE_COLORS[ex],
    }))
    .sort((a, b) => b.totalOI - a.totalOI);

  return { coins, exchangeVolumes, exchangeOI };
}
