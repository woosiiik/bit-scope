/**
 * 멀티 거래소 데이터 수집 핵심 로직
 *
 * 6개 거래소에 병렬로 공개 API 요청을 보내고,
 * 성공/실패를 분리하여 MultiExchangeResponse를 반환한다.
 */

import type { FuturesExchangeType, ExchangeType } from '@bitscope/shared';
import type {
  FuturesDashboardIndicator,
  Period,
  MultiExchangeResponse,
  ExchangeDataPoint,
  FundingRateSnapshot,
  ExchangeTimeSeriesPoint,
} from '@bitscope/shared';
import { INDICATOR_EXCHANGE_SUPPORT, EXCHANGE_CONFIGS } from '@bitscope/shared';
import { buildIndicatorUrl, buildHyperliquidBody } from './url-builder';
import { normalizeIndicator } from './normalizer';
import {
  parseBinanceKlines,
  calculateCVD,
  calculateAvgReturnByHour,
  calculateAvgReturnByDay,
  calculateCumReturnBySession,
} from './kline-aggregator';

/** 거래소 API 타임아웃 (ms) */
const FETCH_TIMEOUT = 10_000;

/**
 * 멀티 거래소 지표 데이터를 수집한다.
 */
export async function fetchMultiExchangeIndicator(
  indicator: FuturesDashboardIndicator,
  coin: string,
  options?: { period?: Period },
): Promise<MultiExchangeResponse> {
  const exchanges = INDICATOR_EXCHANGE_SUPPORT[indicator] ?? [];

  const results = await Promise.allSettled(
    exchanges.map(async (exchange) => {
      const url = buildIndicatorUrl(exchange, indicator, coin, options);
      const config = EXCHANGE_CONFIGS[exchange as ExchangeType];
      const timeoutMs = config?.timeoutMs ?? FETCH_TIMEOUT;

      const fetchOptions: RequestInit = {
        method: exchange === 'hyperliquid' ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(timeoutMs),
      };

      if (exchange === 'hyperliquid') {
        fetchOptions.body = buildHyperliquidBody(indicator, coin);
      }

      const response = await fetch(url, fetchOptions);
      if (!response.ok) {
        throw new Error(`${exchange} API error: ${response.status} ${response.statusText}`);
      }

      const rawData = await response.json();
      // coin을 직접 전달하여 전역 변수 의존성 제거
      const normalized = normalizeIndicator(exchange, indicator, rawData, coin);
      return { exchange, data: normalized };
    }),
  );

  // 성공/실패 분리
  const errors: Partial<Record<FuturesExchangeType, string>> = {};
  const successEntries: Array<{ exchange: FuturesExchangeType; data: unknown }> = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const exchange = exchanges[i]!;

    if (result.status === 'fulfilled') {
      successEntries.push(result.value);
    } else {
      errors[exchange] = result.reason?.message ?? 'Unknown error';
    }
  }

  // 지표별 데이터 병합
  const data = mergeExchangeData(indicator, successEntries);

  return {
    indicator,
    coin,
    data,
    errors,
    timestamp: Date.now(),
  };
}

/**
 * 지표별로 거래소 데이터를 병합한다.
 */
function mergeExchangeData(
  indicator: FuturesDashboardIndicator,
  entries: Array<{ exchange: FuturesExchangeType; data: unknown }>,
): unknown {
  switch (indicator) {
    case 'volume24h':
    case 'oiSnapshot':
      return entries.map((e) => e.data as ExchangeDataPoint);

    case 'fundingRate':
      return entries.map((e) => e.data as FundingRateSnapshot);

    case 'price':
    case 'volumeHistory':
    case 'oiHistory':
      return mergeTimeSeries(entries);

    // Kline 기반 파생 지표: normalizer가 raw 데이터를 그대로 넘겨줌
    // parseBinanceKlines()로 원본 Kline을 파싱 후 계산
    case 'cvd': {
      const binanceEntry = entries.find((e) => e.exchange === 'binance');
      if (!binanceEntry) return [];
      const klines = parseBinanceKlines(binanceEntry.data);
      return calculateCVD(klines);
    }

    case 'avgReturnByHour': {
      const binanceEntry = entries.find((e) => e.exchange === 'binance');
      if (!binanceEntry) return [];
      const klines = parseBinanceKlines(binanceEntry.data);
      return calculateAvgReturnByHour(klines);
    }

    case 'avgReturnByDay': {
      const binanceEntry = entries.find((e) => e.exchange === 'binance');
      if (!binanceEntry) return [];
      const klines = parseBinanceKlines(binanceEntry.data);
      return calculateAvgReturnByDay(klines);
    }

    case 'cumReturnBySession': {
      const binanceEntry = entries.find((e) => e.exchange === 'binance');
      if (!binanceEntry) return [];
      const klines = parseBinanceKlines(binanceEntry.data);
      return calculateCumReturnBySession(klines);
    }

    case 'liquidations':
    case 'basis3m':
      return entries.map((e) => e.data);

    default:
      return entries.map((e) => e.data);
  }
}

/**
 * 거래소별 시계열 데이터를 타임스탬프 기준으로 병합한다.
 */
function mergeTimeSeries(
  entries: Array<{ exchange: FuturesExchangeType; data: unknown }>,
): ExchangeTimeSeriesPoint[] {
  const timeMap = new Map<number, Partial<Record<FuturesExchangeType, number>>>();

  for (const entry of entries) {
    const points = entry.data as ExchangeTimeSeriesPoint[];
    if (!Array.isArray(points)) continue;

    for (const point of points) {
      const existing = timeMap.get(point.timestamp) ?? {};
      const value = point.values[entry.exchange];
      if (value !== undefined) {
        existing[entry.exchange] = value;
      }
      timeMap.set(point.timestamp, existing);
    }
  }

  return Array.from(timeMap.entries())
    .map(([timestamp, values]) => ({ timestamp, values }))
    .sort((a, b) => a.timestamp - b.timestamp);
}
