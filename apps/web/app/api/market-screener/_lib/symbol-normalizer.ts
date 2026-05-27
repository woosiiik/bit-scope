/**
 * 거래소별 심볼 정규화
 * 다양한 심볼 포맷을 baseAsset(예: 'BTC')으로 통일한다.
 * USDT-마진 선물만 통과, COIN-마진/기타는 null 반환.
 */

import type { FuturesExchangeType } from '@bitscope/shared';

/** 1000x 접두사가 붙는 코인 매핑 (Binance/Bybit) */
const THOUSAND_PREFIX_COINS: Record<string, string> = {
  '1000PEPE': 'PEPE',
  '1000SHIB': 'SHIB',
  '1000FLOKI': 'FLOKI',
  '1000BONK': 'BONK',
  '1000SATS': 'SATS',
  '1000LUNC': 'LUNC',
  '1000XEC': 'XEC',
  '1000RATS': 'RATS',
  '1000CAT': 'CAT',
  '1000CHEEMS': 'CHEEMS',
  '1000TURBO': 'TURBO',
};

export interface NormalizeResult {
  symbol: string;
  priceMultiplier: number; // 1000x 코인은 가격 * 1000, 거래량 / 1000
}

export function normalizeSymbol(exchange: FuturesExchangeType, rawSymbol: string): NormalizeResult | null {
  if (!rawSymbol) return null;

  let baseAsset: string | null = null;

  switch (exchange) {
    case 'binance':
    case 'bybit': {
      if (!rawSymbol.endsWith('USDT')) return null;
      baseAsset = rawSymbol.replace(/USDT$/, '');
      break;
    }
    case 'okx': {
      if (!rawSymbol.includes('-USDT-SWAP')) return null;
      baseAsset = rawSymbol.split('-')[0] ?? null;
      break;
    }
    case 'gate': {
      if (!rawSymbol.includes('_USDT')) return null;
      baseAsset = rawSymbol.split('_')[0] ?? null;
      break;
    }
    case 'bitget': {
      if (!rawSymbol.endsWith('USDT')) return null;
      baseAsset = rawSymbol.replace(/USDT$/, '');
      break;
    }
    case 'hyperliquid': {
      if (rawSymbol.startsWith('@') || rawSymbol.startsWith('#')) return null;
      baseAsset = rawSymbol;
      break;
    }
    default:
      return null;
  }

  if (!baseAsset) return null;

  // 1000x 접두사 처리 (Binance/Bybit: 1000PEPEUSDT → PEPE, 가격 *1000)
  const mapped = THOUSAND_PREFIX_COINS[baseAsset];
  if (mapped) {
    return { symbol: mapped, priceMultiplier: 1000 };
  }

  return { symbol: baseAsset, priceMultiplier: 1 };
}
