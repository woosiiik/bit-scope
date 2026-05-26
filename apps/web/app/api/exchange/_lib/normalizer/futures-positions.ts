/**
 * 선물 포지션 및 오픈오더 정규화 모듈
 *
 * Binance, Gate.io, Bitget의 선물 포지션/오픈오더 API 응답을
 * 통일된 FuturesPosition[] / FuturesOpenOrder[] 타입으로 변환한다.
 *
 * 거래소별 선물 포지션 응답 구조:
 * - Binance: [{ symbol, positionAmt, entryPrice, markPrice, unRealizedProfit, leverage, liquidationPrice, marginType, updateTime }]
 * - Gate.io: [{ contract, size, entry_price, mark_price, unrealised_pnl, leverage, liq_price, mode, update_time }]
 * - Bitget: { code, data: [{ symbol, holdSide, openPriceAvg, markPrice, total, unrealizedPL, leverage, liquidationPrice, marginMode, uTime }] }
 *
 * 거래소별 선물 오픈오더 응답 구조:
 * - Binance: [{ orderId, symbol, side, positionSide, type, price, origQty, status, time }]
 * - Gate.io: [{ id, contract, size, price, left, status, create_time }]
 * - Bitget: { code, data: { entrustedList: [{ orderId, symbol, side, tradeSide, orderType, price, size, status, cTime }] } }
 */

import type {
  FuturesExchangeType,
  FuturesPosition,
  FuturesOpenOrder,
  FuturesOrderType,
} from '@bitscope/shared';

// ===== 유틸리티 함수 =====

/**
 * 문자열을 안전하게 숫자로 변환한다.
 * NaN이면 0을 반환한다.
 */
function safeParseFloat(value: unknown): number {
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Gate.io contract 심볼을 통합 심볼로 변환한다.
 * 예: 'BTC_USDT' -> 'BTCUSDT'
 */
function normalizeGateSymbol(contract: string): string {
  return contract.replace(/_/g, '');
}

// ===== Binance 포지션 정규화 =====

interface BinancePositionItem {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  leverage: string;
  liquidationPrice: string;
  marginType: string;
  updateTime: number;
}

function normalizeBinanceFuturesPositions(rawResponse: unknown): FuturesPosition[] {
  const items = rawResponse as BinancePositionItem[];
  if (!Array.isArray(items)) return [];

  const positions: FuturesPosition[] = [];

  for (const item of items) {
    const quantity = Math.abs(safeParseFloat(item.positionAmt));
    if (quantity === 0) continue;

    const positionAmt = safeParseFloat(item.positionAmt);

    positions.push({
      exchange: 'binance',
      symbol: item.symbol ?? '',
      side: positionAmt >= 0 ? 'LONG' : 'SHORT',
      entryPrice: safeParseFloat(item.entryPrice),
      markPrice: safeParseFloat(item.markPrice),
      quantity,
      unrealizedPnl: safeParseFloat(item.unRealizedProfit),
      leverage: safeParseFloat(item.leverage),
      liquidationPrice: safeParseFloat(item.liquidationPrice),
      marginType: item.marginType?.toLowerCase() === 'isolated' ? 'isolated' : 'cross',
      timestamp: typeof item.updateTime === 'number' ? item.updateTime : Date.now(),
    });
  }

  return positions;
}

// ===== Gate.io 포지션 정규화 =====

interface GatePositionItem {
  contract: string;
  size: number;
  entry_price: string;
  mark_price: string;
  unrealised_pnl: string;
  realised_pnl: string;
  leverage: string;
  liq_price: string;
  mode: string;
  update_time: number;
}

function normalizeGateFuturesPositions(rawResponse: unknown): FuturesPosition[] {
  const items = rawResponse as GatePositionItem[];
  if (!Array.isArray(items)) return [];

  const positions: FuturesPosition[] = [];

  for (const item of items) {
    const size = typeof item.size === 'number' ? item.size : safeParseFloat(item.size);
    const quantity = Math.abs(size);
    if (quantity === 0) continue;

    positions.push({
      exchange: 'gate',
      symbol: normalizeGateSymbol(item.contract ?? ''),
      side: size >= 0 ? 'LONG' : 'SHORT',
      entryPrice: safeParseFloat(item.entry_price),
      markPrice: safeParseFloat(item.mark_price),
      quantity,
      unrealizedPnl: safeParseFloat(item.unrealised_pnl),
      realizedPnl: safeParseFloat(item.realised_pnl) || undefined,
      leverage: safeParseFloat(item.leverage),
      liquidationPrice: safeParseFloat(item.liq_price),
      marginType: item.mode === 'single' ? 'isolated' : 'cross',
      timestamp: typeof item.update_time === 'number' ? item.update_time * 1000 : Date.now(),
    });
  }

  return positions;
}

// ===== Bitget 포지션 정규화 =====

interface BitgetPositionItem {
  symbol: string;
  holdSide: string;
  openPriceAvg: string;
  markPrice: string;
  total: string;
  unrealizedPL: string;
  achievedProfits: string;
  leverage: string;
  liquidationPrice: string;
  marginMode: string;
  uTime: string;
}

interface BitgetPositionResponse {
  code?: string;
  data?: BitgetPositionItem[];
}

function normalizeBitgetFuturesPositions(rawResponse: unknown): FuturesPosition[] {
  const response = rawResponse as BitgetPositionResponse;

  // Bitget API v2 응답 구조: { code: "00000", data: [...] }
  const items = response?.data;
  if (!Array.isArray(items)) return [];

  const positions: FuturesPosition[] = [];

  for (const item of items) {
    const quantity = Math.abs(safeParseFloat(item.total));
    if (quantity === 0) continue;

    positions.push({
      exchange: 'bitget',
      symbol: item.symbol ?? '',
      side: item.holdSide?.toLowerCase() === 'short' ? 'SHORT' : 'LONG',
      entryPrice: safeParseFloat(item.openPriceAvg),
      markPrice: safeParseFloat(item.markPrice),
      quantity,
      unrealizedPnl: safeParseFloat(item.unrealizedPL),
      realizedPnl: safeParseFloat(item.achievedProfits) || undefined,
      leverage: safeParseFloat(item.leverage),
      liquidationPrice: safeParseFloat(item.liquidationPrice),
      marginType: item.marginMode?.toLowerCase() === 'isolated' ? 'isolated' : 'cross',
      timestamp: safeParseFloat(item.uTime) || Date.now(),
    });
  }

  return positions;
}

// ===== Binance 오픈오더 정규화 =====

interface BinanceOpenOrderItem {
  orderId: number;
  symbol: string;
  side: string;
  positionSide: string;
  type: string;
  price: string;
  origQty: string;
  status: string;
  time: number;
}

function normalizeBinanceFuturesOpenOrders(rawResponse: unknown): FuturesOpenOrder[] {
  const items = rawResponse as BinanceOpenOrderItem[];
  if (!Array.isArray(items)) return [];

  return items.map((item) => ({
    exchange: 'binance' as FuturesExchangeType,
    orderId: String(item.orderId ?? ''),
    symbol: item.symbol ?? '',
    side: (item.side?.toUpperCase() === 'SELL' ? 'SELL' : 'BUY') as FuturesOpenOrder['side'],
    positionSide: (item.positionSide?.toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG') as FuturesOpenOrder['positionSide'],
    orderType: (item.type?.toUpperCase() || 'LIMIT') as FuturesOrderType,
    price: safeParseFloat(item.price),
    quantity: safeParseFloat(item.origQty),
    status: item.status ?? '',
    createdAt: typeof item.time === 'number' ? item.time : Date.now(),
  }));
}

// ===== Gate.io 오픈오더 정규화 =====

interface GateOpenOrderItem {
  id: number;
  contract: string;
  size: number;
  price: string;
  left: number;
  status: string;
  create_time: number;
}

function normalizeGateFuturesOpenOrders(rawResponse: unknown): FuturesOpenOrder[] {
  const items = rawResponse as GateOpenOrderItem[];
  if (!Array.isArray(items)) return [];

  return items.map((item) => {
    const size = typeof item.size === 'number' ? item.size : safeParseFloat(item.size);
    const isBuy = size >= 0;

    return {
      exchange: 'gate' as FuturesExchangeType,
      orderId: String(item.id ?? ''),
      symbol: normalizeGateSymbol(item.contract ?? ''),
      side: (isBuy ? 'BUY' : 'SELL') as FuturesOpenOrder['side'],
      positionSide: (isBuy ? 'LONG' : 'SHORT') as FuturesOpenOrder['positionSide'],
      orderType: (safeParseFloat(item.price) > 0 ? 'LIMIT' : 'MARKET') as FuturesOrderType,
      price: safeParseFloat(item.price),
      quantity: Math.abs(typeof item.left === 'number' ? item.left : safeParseFloat(item.left)),
      status: item.status ?? '',
      createdAt: typeof item.create_time === 'number' ? item.create_time * 1000 : Date.now(),
    };
  });
}

// ===== Bitget 오픈오더 정규화 =====

interface BitgetOpenOrderItem {
  orderId: string;
  symbol: string;
  side: string;
  tradeSide: string;
  orderType: string;
  price: string;
  size: string;
  status: string;
  cTime: string;
}

interface BitgetOpenOrderResponse {
  code?: string;
  data?: {
    entrustedList?: BitgetOpenOrderItem[];
  };
}

/**
 * Bitget tradeSide + side 조합으로 positionSide를 추론한다.
 *
 * - open + buy -> LONG (롱 진입)
 * - open + sell -> SHORT (숏 진입)
 * - close + sell -> LONG (롱 청산)
 * - close + buy -> SHORT (숏 청산)
 */
function inferBitgetPositionSide(tradeSide: string, side: string): FuturesOpenOrder['positionSide'] {
  const ts = tradeSide?.toLowerCase();
  const s = side?.toLowerCase();

  if (ts === 'open') {
    return s === 'sell' ? 'SHORT' : 'LONG';
  }
  // close
  return s === 'buy' ? 'SHORT' : 'LONG';
}

function normalizeBitgetFuturesOpenOrders(rawResponse: unknown): FuturesOpenOrder[] {
  const response = rawResponse as BitgetOpenOrderResponse;

  // Bitget API v2 응답 구조: { code: "00000", data: { entrustedList: [...] } }
  const items = response?.data?.entrustedList;
  if (!Array.isArray(items)) return [];

  return items.map((item) => ({
    exchange: 'bitget' as FuturesExchangeType,
    orderId: item.orderId ?? '',
    symbol: item.symbol ?? '',
    side: (item.side?.toUpperCase() === 'SELL' ? 'SELL' : 'BUY') as FuturesOpenOrder['side'],
    positionSide: inferBitgetPositionSide(item.tradeSide, item.side),
    orderType: (item.orderType?.toUpperCase() || 'LIMIT') as FuturesOrderType,
    price: safeParseFloat(item.price),
    quantity: safeParseFloat(item.size),
    status: item.status ?? '',
    createdAt: safeParseFloat(item.cTime) || Date.now(),
  }));
}

// ===== OKX 포지션 정규화 =====

interface OkxPositionItem {
  instId: string;
  posSide: string;
  avgPx: string;
  markPx: string;
  pos: string;
  upl: string;
  realizedPnl: string;
  lever: string;
  liqPx: string;
  mgnMode: string;
  uTime: string;
}

interface OkxPositionResponse {
  code?: string;
  data?: OkxPositionItem[];
}

function normalizeOkxFuturesPositions(rawResponse: unknown): FuturesPosition[] {
  const response = rawResponse as OkxPositionResponse;

  // OKX API v5 응답: { code: "0", data: [...] }
  const items = response?.data;
  if (!Array.isArray(items)) return [];

  const positions: FuturesPosition[] = [];

  for (const item of items) {
    const pos = safeParseFloat(item.pos);
    const quantity = Math.abs(pos);
    if (quantity === 0) continue;

    // OKX instId: 'BTC-USDT-SWAP' -> 'BTCUSDT'
    const symbol = (item.instId ?? '').replace(/-SWAP$/, '').replace(/-/g, '');

    // posSide: 'long', 'short', 'net'
    let side: FuturesPosition['side'];
    if (item.posSide === 'long') {
      side = 'LONG';
    } else if (item.posSide === 'short') {
      side = 'SHORT';
    } else {
      // net mode: pos 부호로 판별
      side = pos >= 0 ? 'LONG' : 'SHORT';
    }

    positions.push({
      exchange: 'okx',
      symbol,
      side,
      entryPrice: safeParseFloat(item.avgPx),
      markPrice: safeParseFloat(item.markPx),
      quantity,
      unrealizedPnl: safeParseFloat(item.upl),
      realizedPnl: safeParseFloat(item.realizedPnl) || undefined,
      leverage: safeParseFloat(item.lever),
      liquidationPrice: safeParseFloat(item.liqPx),
      marginType: item.mgnMode === 'isolated' ? 'isolated' : 'cross',
      timestamp: safeParseFloat(item.uTime) || Date.now(),
    });
  }

  return positions;
}

// ===== OKX 오픈오더 정규화 =====

interface OkxOpenOrderItem {
  ordId: string;
  instId: string;
  side: string;
  posSide: string;
  ordType: string;
  px: string;
  sz: string;
  state: string;
  cTime: string;
}

interface OkxOpenOrderResponse {
  code?: string;
  data?: OkxOpenOrderItem[];
}

function normalizeOkxFuturesOpenOrders(rawResponse: unknown): FuturesOpenOrder[] {
  const response = rawResponse as OkxOpenOrderResponse;

  const items = response?.data;
  if (!Array.isArray(items)) return [];

  return items.map((item) => {
    const symbol = (item.instId ?? '').replace(/-SWAP$/, '').replace(/-/g, '');

    // posSide: 'long', 'short', 'net'
    let positionSide: FuturesOpenOrder['positionSide'];
    if (item.posSide === 'short') {
      positionSide = 'SHORT';
    } else {
      positionSide = 'LONG';
    }

    // ordType: 'limit', 'market', 'post_only', 'fok', 'ioc', 'optimal_limit_ioc'
    let orderType: FuturesOrderType = 'LIMIT';
    const ot = item.ordType?.toLowerCase();
    if (ot === 'market' || ot === 'optimal_limit_ioc') {
      orderType = 'MARKET';
    }

    return {
      exchange: 'okx' as FuturesExchangeType,
      orderId: item.ordId ?? '',
      symbol,
      side: (item.side?.toLowerCase() === 'sell' ? 'SELL' : 'BUY') as FuturesOpenOrder['side'],
      positionSide,
      orderType,
      price: safeParseFloat(item.px),
      quantity: safeParseFloat(item.sz),
      status: item.state ?? '',
      createdAt: safeParseFloat(item.cTime) || Date.now(),
    };
  });
}

// ===== Bybit 포지션 정규화 =====

interface BybitPositionItem {
  symbol: string;
  side: string;
  avgPrice: string;
  markPrice: string;
  size: string;
  unrealisedPnl: string;
  cumRealisedPnl: string;
  leverage: string;
  liqPrice: string;
  tradeMode: number;
  updatedTime: string;
}

interface BybitPositionResponse {
  retCode?: number;
  result?: {
    list?: BybitPositionItem[];
  };
}

function normalizeBybitFuturesPositions(rawResponse: unknown): FuturesPosition[] {
  const response = rawResponse as BybitPositionResponse;

  if (response?.retCode !== undefined && response.retCode !== 0) return [];

  const items = response?.result?.list;
  if (!Array.isArray(items)) return [];

  const positions: FuturesPosition[] = [];

  for (const item of items) {
    const quantity = Math.abs(safeParseFloat(item.size));
    if (quantity === 0) continue;

    positions.push({
      exchange: 'bybit',
      symbol: item.symbol ?? '',
      side: item.side?.toLowerCase() === 'sell' ? 'SHORT' : 'LONG',
      entryPrice: safeParseFloat(item.avgPrice),
      markPrice: safeParseFloat(item.markPrice),
      quantity,
      unrealizedPnl: safeParseFloat(item.unrealisedPnl),
      realizedPnl: safeParseFloat(item.cumRealisedPnl) || undefined,
      leverage: safeParseFloat(item.leverage),
      liquidationPrice: safeParseFloat(item.liqPrice),
      marginType: item.tradeMode === 1 ? 'isolated' : 'cross',
      timestamp: safeParseFloat(item.updatedTime) || Date.now(),
    });
  }

  return positions;
}

// ===== Bybit 오픈오더 정규화 =====

interface BybitOpenOrderItem {
  orderId: string;
  symbol: string;
  side: string;
  positionIdx: number;
  orderType: string;
  price: string;
  qty: string;
  orderStatus: string;
  createdTime: string;
}

interface BybitOpenOrderResponse {
  retCode?: number;
  result?: {
    list?: BybitOpenOrderItem[];
  };
}

function normalizeBybitFuturesOpenOrders(rawResponse: unknown): FuturesOpenOrder[] {
  const response = rawResponse as BybitOpenOrderResponse;

  if (response?.retCode !== undefined && response.retCode !== 0) return [];

  const items = response?.result?.list;
  if (!Array.isArray(items)) return [];

  return items.map((item) => {
    // positionIdx: 0=one-way, 1=Buy(LONG), 2=Sell(SHORT)
    let positionSide: FuturesOpenOrder['positionSide'] = 'LONG';
    if (item.positionIdx === 2) {
      positionSide = 'SHORT';
    } else if (item.positionIdx === 0) {
      positionSide = item.side?.toLowerCase() === 'sell' ? 'SHORT' : 'LONG';
    }

    return {
      exchange: 'bybit' as FuturesExchangeType,
      orderId: item.orderId ?? '',
      symbol: item.symbol ?? '',
      side: (item.side?.toLowerCase() === 'sell' ? 'SELL' : 'BUY') as FuturesOpenOrder['side'],
      positionSide,
      orderType: (item.orderType?.toUpperCase() || 'LIMIT') as FuturesOrderType,
      price: safeParseFloat(item.price),
      quantity: safeParseFloat(item.qty),
      status: item.orderStatus ?? '',
      createdAt: safeParseFloat(item.createdTime) || Date.now(),
    };
  });
}

// ===== Hyperliquid 포지션 정규화 =====

interface HyperliquidAssetPositionItem {
  position: {
    coin: string;
    szi: string;
    entryPx: string;
    positionValue: string;
    unrealizedPnl: string;
    leverage: {
      type: string;
      value: number;
    };
  };
  type: string;
}

interface HyperliquidClearinghouseResponse {
  marginSummary?: unknown;
  assetPositions?: HyperliquidAssetPositionItem[];
  time?: number;
}

function normalizeHyperliquidFuturesPositions(rawResponse: unknown): FuturesPosition[] {
  const response = rawResponse as HyperliquidClearinghouseResponse;

  const items = response?.assetPositions;
  if (!Array.isArray(items)) return [];

  const positions: FuturesPosition[] = [];

  for (const item of items) {
    const pos = item.position;
    if (!pos) continue;

    const szi = safeParseFloat(pos.szi);
    const quantity = Math.abs(szi);
    if (quantity === 0) continue;

    // Hyperliquid coin: 'BTC' -> symbol: 'BTC'
    const symbol = pos.coin ?? '';

    positions.push({
      exchange: 'hyperliquid',
      symbol,
      side: szi >= 0 ? 'LONG' : 'SHORT',
      entryPrice: safeParseFloat(pos.entryPx),
      markPrice: 0, // clearinghouseState에서는 markPrice를 제공하지 않음
      quantity,
      unrealizedPnl: safeParseFloat(pos.unrealizedPnl),
      leverage: pos.leverage?.value ?? 0,
      liquidationPrice: 0, // clearinghouseState에서는 liquidationPrice를 제공하지 않음
      marginType: pos.leverage?.type === 'isolated' ? 'isolated' : 'cross',
      timestamp: response?.time ?? Date.now(),
    });
  }

  return positions;
}

// ===== Hyperliquid 오픈오더 정규화 =====

interface HyperliquidOpenOrderItem {
  coin: string;
  oid: number;
  side: string;
  limitPx: string;
  sz: string;
  timestamp: number;
  orderType?: string;
  reduceOnly?: boolean;
}

function normalizeHyperliquidFuturesOpenOrders(rawResponse: unknown): FuturesOpenOrder[] {
  const items = rawResponse as HyperliquidOpenOrderItem[];
  if (!Array.isArray(items)) return [];

  return items.map((item) => {
    const isBuy = item.side === 'B' || item.side?.toLowerCase() === 'buy';

    return {
      exchange: 'hyperliquid' as FuturesExchangeType,
      orderId: String(item.oid ?? ''),
      symbol: item.coin ?? '',
      side: (isBuy ? 'BUY' : 'SELL') as FuturesOpenOrder['side'],
      positionSide: (isBuy ? 'LONG' : 'SHORT') as FuturesOpenOrder['positionSide'],
      orderType: 'LIMIT' as FuturesOrderType,
      price: safeParseFloat(item.limitPx),
      quantity: safeParseFloat(item.sz),
      status: 'open',
      createdAt: typeof item.timestamp === 'number' ? item.timestamp : Date.now(),
    };
  });
}

// ===== 디스패처 함수 =====

/**
 * 거래소별 선물 포지션 응답을 정규화한다.
 *
 * @param exchange 거래소 식별자 (binance, gate, bitget)
 * @param rawResponse 거래소 선물 포지션 API 원본 응답
 * @returns 정규화된 선물 포지션 배열
 * @throws {Error} 지원하지 않는 거래소인 경우
 */
export function normalizeFuturesPositions(
  exchange: FuturesExchangeType,
  rawResponse: unknown,
): FuturesPosition[] {
  switch (exchange) {
    case 'binance':
      return normalizeBinanceFuturesPositions(rawResponse);
    case 'bybit':
      return normalizeBybitFuturesPositions(rawResponse);
    case 'okx':
      return normalizeOkxFuturesPositions(rawResponse);
    case 'gate':
      return normalizeGateFuturesPositions(rawResponse);
    case 'bitget':
      return normalizeBitgetFuturesPositions(rawResponse);
    case 'hyperliquid':
      return normalizeHyperliquidFuturesPositions(rawResponse);
    default:
      throw new Error(`선물 포지션을 지원하지 않는 거래소입니다: ${exchange}`);
  }
}

/**
 * 거래소별 선물 오픈오더 응답을 정규화한다.
 *
 * @param exchange 거래소 식별자 (binance, gate, bitget)
 * @param rawResponse 거래소 선물 오픈오더 API 원본 응답
 * @returns 정규화된 선물 오픈오더 배열
 * @throws {Error} 지원하지 않는 거래소인 경우
 */
export function normalizeFuturesOpenOrders(
  exchange: FuturesExchangeType,
  rawResponse: unknown,
): FuturesOpenOrder[] {
  switch (exchange) {
    case 'binance':
      return normalizeBinanceFuturesOpenOrders(rawResponse);
    case 'bybit':
      return normalizeBybitFuturesOpenOrders(rawResponse);
    case 'okx':
      return normalizeOkxFuturesOpenOrders(rawResponse);
    case 'gate':
      return normalizeGateFuturesOpenOrders(rawResponse);
    case 'bitget':
      return normalizeBitgetFuturesOpenOrders(rawResponse);
    case 'hyperliquid':
      return normalizeHyperliquidFuturesOpenOrders(rawResponse);
    default:
      throw new Error(`선물 오픈오더를 지원하지 않는 거래소입니다: ${exchange}`);
  }
}
