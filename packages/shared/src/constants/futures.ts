/**
 * 선물 거래 관련 상수 정의
 *
 * 선물 거래 지원 거래소 목록, 코인 목록,
 * 거래소별 API 심볼 및 TradingView 심볼 매핑 유틸리티를 포함한다.
 */

import type { FuturesExchangeType, FuturesCoin, FuturesSymbolConfig } from '../types/futures';

/** 선물 거래 지원 거래소 목록 */
export const FUTURES_EXCHANGES: FuturesExchangeType[] = [
  'binance',
  'bybit',
  'okx',
  'gate',
  'bitget',
  'hyperliquid',
];

/** 기본 선물 거래소 */
export const FUTURES_DEFAULT_EXCHANGE: FuturesExchangeType = 'binance';

/** 주요 선물 코인 목록 (20개) */
export const FUTURES_COINS: FuturesCoin[] = [
  { symbol: 'BTCUSDT', baseAsset: 'BTC', label: 'BTC/USDT' },
  { symbol: 'ETHUSDT', baseAsset: 'ETH', label: 'ETH/USDT' },
  { symbol: 'SOLUSDT', baseAsset: 'SOL', label: 'SOL/USDT' },
  { symbol: 'XRPUSDT', baseAsset: 'XRP', label: 'XRP/USDT' },
  { symbol: 'DOGEUSDT', baseAsset: 'DOGE', label: 'DOGE/USDT' },
  { symbol: 'ADAUSDT', baseAsset: 'ADA', label: 'ADA/USDT' },
  { symbol: 'AVAXUSDT', baseAsset: 'AVAX', label: 'AVAX/USDT' },
  { symbol: 'LINKUSDT', baseAsset: 'LINK', label: 'LINK/USDT' },
  { symbol: 'DOTUSDT', baseAsset: 'DOT', label: 'DOT/USDT' },
  { symbol: 'MATICUSDT', baseAsset: 'MATIC', label: 'MATIC/USDT' },
  { symbol: 'UNIUSDT', baseAsset: 'UNI', label: 'UNI/USDT' },
  { symbol: 'LTCUSDT', baseAsset: 'LTC', label: 'LTC/USDT' },
  { symbol: 'BCHUSDT', baseAsset: 'BCH', label: 'BCH/USDT' },
  { symbol: 'ATOMUSDT', baseAsset: 'ATOM', label: 'ATOM/USDT' },
  { symbol: 'APTUSDT', baseAsset: 'APT', label: 'APT/USDT' },
  { symbol: 'ARBUSDT', baseAsset: 'ARB', label: 'ARB/USDT' },
  { symbol: 'OPUSDT', baseAsset: 'OP', label: 'OP/USDT' },
  { symbol: 'NEARUSDT', baseAsset: 'NEAR', label: 'NEAR/USDT' },
  { symbol: 'FILUSDT', baseAsset: 'FIL', label: 'FIL/USDT' },
  { symbol: 'SUIUSDT', baseAsset: 'SUI', label: 'SUI/USDT' },
];

/** 기본 선물 코인 심볼 */
export const FUTURES_DEFAULT_COIN = 'BTCUSDT';

/** 거래소별 선물 심볼 매핑 설정 */
export const FUTURES_SYMBOL_CONFIGS: Record<FuturesExchangeType, FuturesSymbolConfig> = {
  binance: {
    formatApiSymbol: (baseAsset: string) => `${baseAsset}USDT`,
    formatTradingViewSymbol: (baseAsset: string) => `BINANCE:${baseAsset}USDTPERP`,
  },
  bybit: {
    formatApiSymbol: (baseAsset: string) => `${baseAsset}USDT`,
    formatTradingViewSymbol: (baseAsset: string) => `BYBIT:${baseAsset}USDT.P`,
  },
  okx: {
    formatApiSymbol: (baseAsset: string) => `${baseAsset}-USDT-SWAP`,
    formatTradingViewSymbol: (baseAsset: string) => `OKX:${baseAsset}USDT.P`,
  },
  gate: {
    formatApiSymbol: (baseAsset: string) => `${baseAsset}_USDT`,
    formatTradingViewSymbol: (baseAsset: string) => `GATEIO:${baseAsset}USDTPERP`,
  },
  bitget: {
    formatApiSymbol: (baseAsset: string) => `${baseAsset}USDT`,
    formatTradingViewSymbol: (baseAsset: string) => `BITGET:${baseAsset}USDT.P`,
  },
  hyperliquid: {
    formatApiSymbol: (baseAsset: string) => baseAsset,
    formatTradingViewSymbol: (baseAsset: string) => `HYPERLIQUID:${baseAsset}USDC`,
  },
};

/**
 * 거래소별 API 심볼 변환 함수
 *
 * baseAsset을 해당 거래소의 선물 API 심볼로 변환한다.
 * 예: getFuturesApiSymbol('okx', 'BTC') → 'BTC-USDT-SWAP'
 */
export function getFuturesApiSymbol(exchange: FuturesExchangeType, baseAsset: string): string {
  return FUTURES_SYMBOL_CONFIGS[exchange].formatApiSymbol(baseAsset);
}

/**
 * 거래소별 TradingView 선물 심볼 변환 함수
 *
 * baseAsset을 해당 거래소의 TradingView 차트 심볼로 변환한다.
 * 예: getTradingViewFuturesSymbol('binance', 'BTC') → 'BINANCE:BTCUSDTPERP'
 */
export function getTradingViewFuturesSymbol(exchange: FuturesExchangeType, baseAsset: string): string {
  return FUTURES_SYMBOL_CONFIGS[exchange].formatTradingViewSymbol(baseAsset);
}
