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
const PERIOD_TO_BINANCE_KLINE: Record<Period, { interval: string; limit: number }> = {
  '1d': { interval: '15m', limit: 96 },
  '1w': { interval: '1h', limit: 168 },
  '1m': { interval: '4h', limit: 180 },
  '3m': { interval: '12h', limit: 180 },
  '6m': { interval: '1d', limit: 180 },
  '1y': { interval: '1d', limit: 365 },
};

/** 기간별 Binance OI History period 매핑 (허용값: 5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 1d) */
const PERIOD_TO_BINANCE_OI: Record<Period, { period: string; limit: number }> = {
  '1d': { period: '15m', limit: 96 },
  '1w': { period: '1h', limit: 168 },
  '1m': { period: '4h', limit: 180 },
  '3m': { period: '1d', limit: 90 },
  '6m': { period: '1d', limit: 180 },
  '1y': { period: '1d', limit: 365 },
};

/** 기간별 Bybit Kline interval 매핑 */
const PERIOD_TO_BYBIT_KLINE: Record<Period, { interval: string; limit: number }> = {
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

/** 기간별 Gate.io Kline interval 매핑 (허용값: 10s, 30s, 1m, 5m, 15m, 30m, 1h, 4h, 8h, 1d, 7d, 30d) */
const PERIOD_TO_GATE_INTERVAL: Record<Period, { interval: string; limit: number }> = {
  '1d': { interval: '15m', limit: 96 },
  '1w': { interval: '1h', limit: 168 },
  '1m': { interval: '4h', limit: 180 },
  '3m': { interval: '8h', limit: 270 },
  '6m': { interval: '1d', limit: 180 },
  '1y': { interval: '1d', limit: 365 },
};

/** 기간별 Bitget Kline granularity 매핑 */
const PERIOD_TO_BITGET_GRANULARITY: Record<Period, { granularity: string; limit: number }> = {
  '1d': { granularity: '15m', limit: 96 },
  '1w': { granularity: '1H', limit: 168 },
  '1m': { granularity: '4H', limit: 180 },
  '3m': { granularity: '12H', limit: 180 },
  '6m': { granularity: '1D', limit: 180 },
  '1y': { granularity: '1D', limit: 365 },
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
  _coin: string,
): string {
  switch (indicator) {
    case 'volume24h':
    case 'oiSnapshot':
    case 'fundingRate':
      return JSON.stringify({ type: 'metaAndAssetCtxs' });
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
      const p = PERIOD_TO_BINANCE_OI[period];
      return `${baseUrl}/futures/data/openInterestHist?symbol=${symbol}&period=${p.period}&limit=${p.limit}`;
    }
    case 'price':
    case 'volumeHistory': {
      const p = PERIOD_TO_BINANCE_KLINE[period];
      return `${baseUrl}/fapi/v1/klines?symbol=${symbol}&interval=${p.interval}&limit=${p.limit}`;
    }
    case 'cvd': {
      const p = PERIOD_TO_BINANCE_KLINE[period];
      return `${baseUrl}/fapi/v1/klines?symbol=${symbol}&interval=${p.interval}&limit=${p.limit}`;
    }
    case 'liquidations':
      return `${baseUrl}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=1h&limit=100`;
    case 'basis3m':
      return `${baseUrl}/fapi/v1/premiumIndex?symbol=${symbol}`;
    case 'avgReturnByHour':
    case 'avgReturnByDay':
    case 'cumReturnBySession':
      return `${baseUrl}/fapi/v1/klines?symbol=${symbol}&interval=1h&limit=720`;
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
      return `${baseUrl}/v5/market/open-interest?category=linear&symbol=${symbol}&intervalTime=5min&limit=1`;
    case 'oiHistory':
      return `${baseUrl}/v5/market/open-interest?category=linear&symbol=${symbol}&intervalTime=5min&limit=200`;
    case 'price':
    case 'volumeHistory': {
      const p = PERIOD_TO_BYBIT_KLINE[period];
      return `${baseUrl}/v5/market/kline?category=linear&symbol=${symbol}&interval=${p.interval}&limit=${p.limit}`;
    }
    default:
      return `${baseUrl}/v5/market/tickers?category=linear&symbol=${symbol}`;
  }
}

// ===== OKX =====

function buildOkxUrl(baseUrl: string, indicator: FuturesDashboardIndicator, symbol: string, period: Period): string {
  switch (indicator) {
    case 'volume24h':
      return `${baseUrl}/api/v5/market/ticker?instId=${symbol}`;
    case 'fundingRate':
      return `${baseUrl}/api/v5/public/funding-rate?instId=${symbol}`;
    case 'oiSnapshot':
      return `${baseUrl}/api/v5/public/open-interest?instType=SWAP&instId=${symbol}`;
    case 'oiHistory':
      return `${baseUrl}/api/v5/rubik/stat/contracts/open-interest-volume?ccy=${symbol.split('-')[0]}`;
    case 'price':
    case 'volumeHistory': {
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

function buildGateUrl(baseUrl: string, indicator: FuturesDashboardIndicator, symbol: string, period: Period): string {
  switch (indicator) {
    case 'volume24h':
    case 'oiSnapshot':
    case 'fundingRate':
      return `${baseUrl}/api/v4/futures/usdt/contracts/${symbol}`;
    case 'oiHistory':
      return `${baseUrl}/api/v4/futures/usdt/contract_stats?contract=${symbol}&limit=100`;
    case 'price':
    case 'volumeHistory': {
      const p = PERIOD_TO_GATE_INTERVAL[period];
      return `${baseUrl}/api/v4/futures/usdt/candlesticks?contract=${symbol}&interval=${p.interval}&limit=${p.limit}`;
    }
    case 'liquidations':
      return `${baseUrl}/api/v4/futures/usdt/liq_orders?contract=${symbol}&limit=100`;
    default:
      return `${baseUrl}/api/v4/futures/usdt/contracts/${symbol}`;
  }
}

// ===== Bitget =====

function buildBitgetUrl(baseUrl: string, indicator: FuturesDashboardIndicator, symbol: string, period: Period): string {
  switch (indicator) {
    case 'volume24h':
    case 'fundingRate':
      return `${baseUrl}/api/v2/mix/market/ticker?productType=USDT-FUTURES&symbol=${symbol}`;
    case 'oiSnapshot':
    case 'oiHistory':
      return `${baseUrl}/api/v2/mix/market/open-interest?productType=USDT-FUTURES&symbol=${symbol}`;
    case 'price':
    case 'volumeHistory': {
      const p = PERIOD_TO_BITGET_GRANULARITY[period];
      return `${baseUrl}/api/v2/mix/market/candles?productType=USDT-FUTURES&symbol=${symbol}&granularity=${p.granularity}&limit=${p.limit}`;
    }
    default:
      return `${baseUrl}/api/v2/mix/market/ticker?productType=USDT-FUTURES&symbol=${symbol}`;
  }
}
