/**
 * 거래소별 심볼 정규화
 * 다양한 심볼 포맷을 baseAsset(예: 'BTC')으로 통일한다.
 * USDT-마진 선물만 통과, COIN-마진/기타는 null 반환.
 */

import type { FuturesExchangeType } from '@bitscope/shared';

export function normalizeSymbol(exchange: FuturesExchangeType, rawSymbol: string): string | null {
  if (!rawSymbol) return null;

  switch (exchange) {
    case 'binance':
    case 'bybit': {
      // BTCUSDT -> BTC, 1000PEPEUSDT -> 1000PEPE
      if (!rawSymbol.endsWith('USDT')) return null;
      return rawSymbol.replace(/USDT$/, '');
    }
    case 'okx': {
      // BTC-USDT-SWAP -> BTC
      if (!rawSymbol.includes('-USDT-SWAP')) return null;
      return rawSymbol.split('-')[0] ?? null;
    }
    case 'gate': {
      // BTC_USDT -> BTC
      if (!rawSymbol.includes('_USDT')) return null;
      return rawSymbol.split('_')[0] ?? null;
    }
    case 'bitget': {
      // BTCUSDT -> BTC
      if (!rawSymbol.endsWith('USDT')) return null;
      return rawSymbol.replace(/USDT$/, '');
    }
    case 'hyperliquid': {
      // BTC -> BTC (이미 baseAsset)
      // 내부 인덱스(@, #) 제외
      if (rawSymbol.startsWith('@') || rawSymbol.startsWith('#')) return null;
      return rawSymbol;
    }
    default:
      return null;
  }
}
