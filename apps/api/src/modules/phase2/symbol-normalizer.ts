import { Injectable } from '@nestjs/common';

/** 1000x 접두사 코인 매핑 */
const THOUSAND_PREFIX: Record<string, string> = {
  '1000PEPE': 'PEPE', '1000SHIB': 'SHIB', '1000FLOKI': 'FLOKI', '1000BONK': 'BONK',
  '1000SATS': 'SATS', '1000LUNC': 'LUNC', '1000XEC': 'XEC', '1000RATS': 'RATS',
  '1000CAT': 'CAT', '1000CHEEMS': 'CHEEMS', '1000TURBO': 'TURBO',
};

@Injectable()
export class SymbolNormalizer {
  normalize(exchange: string, rawSymbol: string): string | null {
    if (!rawSymbol) return null;

    let base: string | null = null;

    switch (exchange) {
      case 'binance':
      case 'bybit':
      case 'bitget':
        if (!rawSymbol.endsWith('USDT')) return null;
        base = rawSymbol.replace(/USDT$/, '');
        break;
      case 'okx':
        if (!rawSymbol.includes('-USDT-SWAP')) return null;
        base = rawSymbol.split('-')[0] ?? null;
        break;
      case 'gate':
        if (!rawSymbol.includes('_USDT')) return null;
        base = rawSymbol.split('_')[0] ?? null;
        break;
      case 'hyperliquid':
        if (rawSymbol.startsWith('@') || rawSymbol.startsWith('#')) return null;
        base = rawSymbol;
        break;
      default:
        return null;
    }

    if (!base) return null;
    return THOUSAND_PREFIX[base] ?? base;
  }
}
