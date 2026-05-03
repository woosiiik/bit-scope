/**
 * 거래소 실시간 시세 클라이언트 배럴 export
 *
 * 업비트(WebSocket), 빗썸(WebSocket), 코인원(REST 폴링) 클라이언트와
 * 공통 기본 클래스/인터페이스를 re-export한다.
 */

export { BaseExchangeClient } from './base-exchange.client';
export type {
  IExchangeClient,
  ExchangeClientEvents,
} from './base-exchange.client';

export { UpbitWsClient } from './upbit-ws.client';
export type { UpbitWsTickerResponse } from './upbit-ws.client';

export { BithumbWsClient } from './bithumb-ws.client';
export type { BithumbWsTickerResponse } from './bithumb-ws.client';

export { CoinonePollingClient } from './coinone-polling.client';
export type {
  CoinoneTickerItem,
  CoinoneTickerResponse,
} from './coinone-polling.client';

export { BinancePollingClient } from './binance-polling.client';
export type {
  BinanceTickerPriceItem,
  BinancePriceEntry,
} from './binance-polling.client';
