/**
 * 거래소별 선물 대시보드 API URL 빌더
 *
 * 12개 지표 x 6개 거래소의 공개 API URL을 생성한다.
 */

import type { FuturesExchangeType } from '@bitscope/shared';
import type { FuturesDashboardIndicator, Period } from '@bitscope/shared';
import { EXCHANGE_CONFIGS, getFuturesApiSymbol } from '@bitscope/shared';
import type { ExchangeType } from '@bitscope/shared';

/** 기간별 Binance Kline interval 매핑 */
const PERIOD_TO_BINANCE_INTERVAL: Record<Period, { interval: string; limit: number }> = {
  '1d': { interval: '15m', limit: 96 },
  '1w': { interval: '1h', limit: 168 },
  '1m': { interval: '4h', limit: 180 },
  '3m': { interval: '12h', limit: 180 },
  '6m': { interval: '1d', limit: 180 },
  '1y': { interval: '1d', limit: 365 },
};

/** 기간별 Bybit Kline interval 매핑 */
const PERIOD_TO_BYBIT_INTERVAL: Record<Period, { interval: string; limit: number }> = {
  '1d': { interval: '15', limit: 96 },
  '1w': { interval: '60', limit: 168 },
  '1m': { interval: '240', limit: 180 },
  '3m': { interval: '720', limit: 180 },
  '6m': { interval: 'D', limit: 180 },
  '1y': { interval: 'D', limit: 365 },
};

/** 기간별 OKX Kline bar 매핑 */
const PERIOD_TO_OKX_BAR: Record<Period, { bar: string; limit: number }> = {
  '1d': { bar: '15m', limit: 96 },
  '1w': { bar: '1H', limit: 168 },
  '1m': { bar: '4H', limit: 180 },
  '3m': { bar: '12H', limit: 180 },
  '6m': { bar: '1D', limit: 180 },
  '1y': { bar: '1D', limit: 365 },
};

/**
 * 거래소별 선물 API URL을 생성한다.
 */
export function buildIndicatorUrl(
  exchange: FuturesExchangeType,
  indicator: FuturesDashboardIndicator,
  coin: string,
  options?: { period?: Period },
): string {
  const config = EXCHANGE_CONFIGS[exchange as ExchangeType];
  const baseUrl = (exchange === 'binance' && config.futuresBaseUrl)
    ? config.futuresBaseUrl
    : config.restBaseUrl;
  const symbol = getFuturesApiSymbol(exchange, coin);
  const period = options?.period ?? '1m';

  switch (exchange) {
    case 'binance':
      return buildBinanceUrl(baseUrl, indicator, symbol, period);
    case 'bybit':
      return buildBybitUrl(config.restBaseUrl, indicator, symbol, period);
    case 'okx':
      return buildOkxUrl(config.restBaseUrl, indicator, symbol, period);
    case 'gate':
      return buildGateUrl(config.restBaseUrl, indicator, symbol, period);
    case 'bitget':
      return buildBitgetUrl(config.restBaseUrl, indicator, symbol, period);
    case 'hyperliquid':
      return `${config.restBaseUrl}/info`;
    default:
      return '';
  }
}

/**
 * Hyperliquid POST body를 생성한다.
 */
export function buildHyperliquidBody(
  indicator: FuturesDashboardIndicator,
  coin: string,
): string {
  switch (indicator) {
    case 'volume24h':
    case 'oiSnapshot':
    case 'fundingRate':
    case 'price':
      return JSON.stringify({ type: 'metaAndAssetCtxs' });
    case 'oiHistory':
    case 'volumeHistory':
    case 'cvd':
    case 'avgReturnByHour':
    case 'avgReturnByDay':
    case 'cumReturnBySession':
      return JSON.stringify({ type: 'candleSnapshot', req: { coin, interval: '1h', startTime: Date.now() - 30 * 24 * 3600 * 1000 } });
    default:
      return JSON.stringify({ type: 'metaAndAssetCtxs' });
  }
}

// ===== Binance =====

function buildBinanceUrl(baseUrl: string, indicator: FuturesDashboardIndicator, symbol: string, period: Period): string {
  switch (indicator) {
    case 'volume24h':
      return `${baseUrl}/fapi/v1/ticker/24hr?symbol=${symbol}`;
    case 'oiSnapshot':
      return `${baseUrl}/fapi/v1/openInterest?symbol=${symbol}`;
    case 'fundingRate':
      return `${baseUrl}/fapi/v1/premiumIndex?symbol=${symbol}`;
    case 'oiHistory': {
      const p = PERIOD_TO_BINANCE_INTERVAL[period];
      return `${baseUrl}/futures/data/openInterestHist?symbol=${symbol}&period=${p.interval}&limit=${p.limit}`;
    }
    case 'price':
    case 'volumeHistory':
    case 'cvd': {
      const p = PERIOD_TO_BINANCE_INTERVAL[period];
      return `${baseUrl}/fapi/v1/klines?symbol=${symbol}&interval=${p.interval}&limit=${p.limit}`;
    }
    case 'liquidations':
      return `${baseUrl}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=1h&limit=100`;
    case 'basis3m':
      // 분기 선물 심볼은 별도 로직 필요 (BTCUSDT_YYMMDD)
      return `${baseUrl}/fapi/v1/premiumIndex?symbol=${symbol}`;
    case 'avgReturnByHour':
    case 'avgReturnByDay':
    case 'cumReturnBySession':
      return `${baseUrl}/fapi/v1/klines?symbol=${symbol}&interval=1m&limit=1500`;
    default:
      return `${baseUrl}/fapi/v1/ticker/24hr?symbol=${symbol}`;
  }
}

// ===== Bybit =====

function buildBybitUrl(baseUrl: string, indicator: FuturesDashboardIndicator, symbol: string, period: Period): string {
  switch (indicator) {
    case 'volume24h':
    case 'fundingRate':
      return `${baseUrl}/v5/market/tickers?category=linear&symbol=${symbol}`;
    case 'oiSnapshot':
    case 'oiHistory':
      return `${baseUrl}/v5/market/open-interest?category=linear&symbol=${symbol}&intervalTime=5min&limit=200`;
    case 'price':
    case 'volumeHistory':
    case 'cvd': {
      const p = PERIOD_TO_BYBIT_INTERVAL[period];
      return `${baseUrl}/v5/market/kline?category=linear&symbol=${symbol}&interval=${p.interval}&limit=${p.limit}`;
    }
    case 'liquidations':
      return `${baseUrl}/v5/market/tickers?category=linear&symbol=${symbol}`;
    default:
      return `${baseUrl}/v5/market/tickers?category=linear&symbol=${symbol}`;
  }
}

// ===== OKX =====

function buildOkxUrl(baseUrl: string, indicator: FuturesDashboardIndicator, symbol: string, period: Period): string {
  switch (indicator) {
    case 'volume24h':
    case 'fundingRate':
      return `${baseUrl}/api/v5/market/ticker?instId=${symbol}`;
    case 'oiSnapshot':
      return `${baseUrl}/api/v5/public/open-interest?instType=SWAP&instId=${symbol}`;
    case 'oiHistory':
      return `${baseUrl}/api/v5/rubik/stat/contracts/open-interest-volume?ccy=${symbol.split('-')[0]}`;
    case 'price':
    case 'volumeHistory':
    case 'cvd': {
      const p = PERIOD_TO_OKX_BAR[period];
      return `${baseUrl}/api/v5/market/candles?instId=${symbol}&bar=${p.bar}&limit=${p.limit}`;
    }
    case 'liquidations':
      return `${baseUrl}/api/v5/public/liquidation-orders?instType=SWAP&instId=${symbol}&limit=100`;
    case 'basis3m':
      return `${baseUrl}/api/v5/market/ticker?instId=${symbol}`;
    default:
      return `${baseUrl}/api/v5/market/ticker?instId=${symbol}`;
  }
}

// ===== Gate.io =====

function buildGateUrl(baseUrl: string, indicator: FuturesDashboardIndicator, symbol: string, _period: Period): string {
  switch (indicator) {
    case 'volume24h':
    case 'oiSnapshot':
    case 'fundingRate':
      return `${baseUrl}/api/v4/futures/usdt/contracts/${symbol}`;
    case 'oiHistory':
      return `${baseUrl}/api/v4/futures/usdt/contract_stats?contract=${symbol}&limit=100`;
    case 'price':
    case 'volumeHistory':
    case 'cvd':
      return `${baseUrl}/api/v4/futures/usdt/candlesticks?contract=${symbol}&interval=1h&limit=200`;
    case 'liquidations':
      return `${baseUrl}/api/v4/futures/usdt/liq_orders?contract=${symbol}&limit=100`;
    default:
      return `${baseUrl}/api/v4/futures/usdt/contracts/${symbol}`;
  }
}

// ===== Bitget =====

function buildBitgetUrl(baseUrl: string, indicator: FuturesDashboardIndicator, symbol: string, _period: Period): string {
  switch (indicator) {
    case 'volume24h':
    case 'fundingRate':
      return `${baseUrl}/api/v2/mix/market/ticker?productType=USDT-FUTURES&symbol=${symbol}`;
    case 'oiSnapshot':
      return `${baseUrl}/api/v2/mix/market/open-interest?productType=USDT-FUTURES&symbol=${symbol}`;
    case 'oiHistory':
      return `${baseUrl}/api/v2/mix/market/open-interest?productType=USDT-FUTURES&symbol=${symbol}`;
    case 'price':
    case 'volumeHistory':
    case 'cvd':
      return `${baseUrl}/api/v2/mix/market/candles?productType=USDT-FUTURES&symbol=${symbol}&granularity=1H&limit=200`;
    default:
      return `${baseUrl}/api/v2/mix/market/ticker?productType=USDT-FUTURES&symbol=${symbol}`;
  }
}
