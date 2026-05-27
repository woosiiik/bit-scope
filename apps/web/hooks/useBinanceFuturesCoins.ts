/**
 * Binance 선물 코인 리스트 훅
 *
 * Binance 선물 exchangeInfo에서 TRADING 상태인 USDT 영구 계약 코인을 조회한다.
 * 실패 시 FUTURES_COINS 상수를 폴백으로 사용한다.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import type { FuturesCoin } from '@bitscope/shared';
import { FUTURES_COINS, BINANCE_CONFIG } from '@bitscope/shared';

interface BinanceSymbolInfo {
  symbol: string;
  pair: string;
  contractType: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
}

interface BinanceExchangeInfoResponse {
  symbols: BinanceSymbolInfo[];
}

export function useBinanceFuturesCoins() {
  return useQuery<FuturesCoin[]>({
    queryKey: ['binance-futures-coins'],
    queryFn: async () => {
      const baseUrl = BINANCE_CONFIG.futuresBaseUrl ?? BINANCE_CONFIG.restBaseUrl;
      const res = await fetch(`${baseUrl}/fapi/v1/exchangeInfo`, {
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        throw new Error(`Binance exchangeInfo failed: ${res.status}`);
      }

      const data: BinanceExchangeInfoResponse = await res.json();
      const coins: FuturesCoin[] = [];
      const seen = new Set<string>();

      for (const sym of data.symbols) {
        if (
          sym.status === 'TRADING' &&
          sym.quoteAsset === 'USDT' &&
          sym.contractType === 'PERPETUAL' &&
          !seen.has(sym.baseAsset)
        ) {
          seen.add(sym.baseAsset);
          coins.push({
            symbol: `${sym.baseAsset}USDT`,
            baseAsset: sym.baseAsset,
            label: `${sym.baseAsset}/USDT`,
          });
        }
      }

      // 알파벳 정렬하되 BTC, ETH를 최상단에
      coins.sort((a, b) => {
        if (a.baseAsset === 'BTC') return -1;
        if (b.baseAsset === 'BTC') return 1;
        if (a.baseAsset === 'ETH') return -1;
        if (b.baseAsset === 'ETH') return 1;
        return a.baseAsset.localeCompare(b.baseAsset);
      });

      return coins;
    },
    staleTime: 3600_000, // 1시간
    placeholderData: FUTURES_COINS,
    retry: 1,
  });
}
