/**
 * 빗썸 API v2 응답 정규화 단위 테스트
 *
 * 빗썸 잔고(v2), 시세(v1 Public API), 호가(v1 Public API), 주문 내역(v2) 응답의
 * 정규화를 검증한다. 실제 응답 fixture 기반으로 정확한 변환, 빈 잔고, 특수 케이스를 포함한다.
 *
 * 빗썸 v2 변경사항:
 * - 잔고 조회: 배열 형식 (업비트와 동일)
 * - 시세/호가: Public API는 기존 v1 형식 유지 가능
 * - 주문 내역: v2 형식 (uuid, market 코드 기반)
 *
 * @see 요구사항 12.4 (응답 데이터 통일된 내부 데이터 모델 정규화)
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeBithumbBalance,
  normalizeBithumbTicker,
  normalizeBithumbOrderbook,
  normalizeBithumbOrderHistory,
} from '../../normalizer/bithumb';
import type {
  BithumbV2BalanceItem,
  BithumbPublicApiResponse,
  BithumbAllTickerData,
  BithumbV1TickerData,
  BithumbV1OrderbookData,
  BithumbV2OrderItem,
} from '../../normalizer/bithumb';

// ===== Fixture 데이터: 빗썸 v2 실제 응답 구조 기반 =====

/** 빗썸 v2 잔고 조회 응답 (배열 형식, 업비트와 동일) */
const bithumbV2BalanceFixture: BithumbV2BalanceItem[] = [
  {
    currency: 'KRW',
    balance: '4500000',
    locked: '500000',
    unit_currency: 'KRW',
  },
  {
    currency: 'BTC',
    balance: '0.2',
    locked: '0.1',
    avg_buy_price: '50000000',
    avg_buy_price_modified: false,
    unit_currency: 'KRW',
  },
  {
    currency: 'ETH',
    balance: '5',
    locked: '0',
    avg_buy_price: '3000000',
    avg_buy_price_modified: false,
    unit_currency: 'KRW',
  },
  {
    currency: 'XRP',
    balance: '0',
    locked: '0',
    avg_buy_price: '0',
    avg_buy_price_modified: false,
    unit_currency: 'KRW',
  },
];

/** 빗썸 v1 Public API 단일 코인 시세 응답 */
const bithumbSingleTickerFixture: BithumbPublicApiResponse<BithumbV1TickerData> = {
  status: '0000',
  data: {
    opening_price: '49000000',
    closing_price: '50500000',
    min_price: '48500000',
    max_price: '51000000',
    units_traded: '3000',
    acc_trade_value: '150000000000',
    prev_closing_price: '49500000',
    units_traded_24H: '5500',
    acc_trade_value_24H: '275000000000',
    fluctate_24H: '1000000',
    fluctate_rate_24H: '2.02',
    date: '1746100800000',
  },
};

/** 빗썸 v1 Public API 전체 코인 시세 응답 */
const bithumbAllTickerFixture: BithumbPublicApiResponse<BithumbAllTickerData> = {
  status: '0000',
  data: {
    BTC: {
      opening_price: '49000000',
      closing_price: '50500000',
      min_price: '48500000',
      max_price: '51000000',
      units_traded: '3000',
      acc_trade_value: '150000000000',
      prev_closing_price: '49500000',
      units_traded_24H: '5500',
      acc_trade_value_24H: '275000000000',
      fluctate_24H: '1000000',
      fluctate_rate_24H: '2.02',
      date: '1746100800000',
    },
    ETH: {
      opening_price: '3100000',
      closing_price: '3150000',
      min_price: '3000000',
      max_price: '3200000',
      units_traded: '4000',
      acc_trade_value: '12600000000',
      prev_closing_price: '3050000',
      units_traded_24H: '8000',
      acc_trade_value_24H: '25200000000',
      fluctate_24H: '100000',
      fluctate_rate_24H: '3.28',
      date: '1746100800000',
    },
    date: '1746100800000',
  },
};

/** 빗썸 v1 Public API 호가 응답 */
const bithumbOrderbookFixture: BithumbPublicApiResponse<BithumbV1OrderbookData> = {
  status: '0000',
  data: {
    timestamp: '1746100800000',
    order_currency: 'BTC',
    payment_currency: 'KRW',
    bids: [
      { quantity: '1.5', price: '50000000' },
      { quantity: '2.0', price: '49900000' },
      { quantity: '1.0', price: '49800000' },
    ],
    asks: [
      { quantity: '1.0', price: '50100000' },
      { quantity: '0.8', price: '50200000' },
      { quantity: '1.2', price: '50300000' },
    ],
  },
};

/** 빗썸 v2 주문 내역 응답 (배열 형식, 업비트와 유사) */
const bithumbV2OrdersFixture: BithumbV2OrderItem[] = [
  {
    uuid: 'bithumb-order-001',
    side: 'bid',
    ord_type: 'limit',
    price: '50000000',
    state: 'done',
    market: 'KRW-BTC',
    volume: '0.1',
    remaining_volume: '0',
    executed_volume: '0.1',
    created_at: '2025-01-01T00:00:00+09:00',
  },
  {
    uuid: 'bithumb-order-002',
    side: 'ask',
    ord_type: 'limit',
    price: '3200000',
    state: 'wait',
    market: 'KRW-ETH',
    volume: '5',
    remaining_volume: '5',
    executed_volume: '0',
    created_at: '2025-01-02T00:00:00+09:00',
  },
  {
    uuid: 'bithumb-order-003',
    side: 'bid',
    ord_type: 'limit',
    price: '49000000',
    state: 'wait',
    market: 'KRW-BTC',
    volume: '0.05',
    remaining_volume: '0.03',
    executed_volume: '0.02',
    created_at: '2025-01-03T00:00:00+09:00',
  },
  {
    uuid: 'bithumb-order-004',
    side: 'ask',
    ord_type: 'limit',
    price: '500',
    state: 'cancel',
    market: 'KRW-XRP',
    volume: '1000',
    remaining_volume: '1000',
    executed_volume: '0',
    created_at: '2025-01-04T00:00:00+09:00',
  },
];

// ===== 잔고 정규화 테스트 =====

describe('normalizeBithumbBalance', () => {
  it('v2 잔고 배열 응답을 정규화된 형태로 변환한다', () => {
    const result = normalizeBithumbBalance(bithumbV2BalanceFixture);

    expect(result.exchange).toBe('bithumb');
    expect(result.timestamp).toBeTypeOf('number');
  });

  it('KRW 잔고를 krwBalance로 분리한다', () => {
    const result = normalizeBithumbBalance(bithumbV2BalanceFixture);

    // balance + locked = 4500000 + 500000 = 5000000
    expect(result.krwBalance).toBe(5000000);
    expect(result.holdings.find((h) => h.symbol === 'KRW')).toBeUndefined();
  });

  it('보유 코인의 잔고를 올바르게 변환한다', () => {
    const result = normalizeBithumbBalance(bithumbV2BalanceFixture);

    const btc = result.holdings.find((h) => h.symbol === 'BTC');
    expect(btc).toBeDefined();
    expect(btc!.exchange).toBe('bithumb');
    expect(btc!.balance).toBe(0.2);
    expect(btc!.lockedBalance).toBeCloseTo(0.1, 10);
    expect(btc!.currency).toBe('KRW');
  });

  it('v2 형식에서 avg_buy_price를 올바르게 매핑한다', () => {
    const result = normalizeBithumbBalance(bithumbV2BalanceFixture);

    const btc = result.holdings.find((h) => h.symbol === 'BTC');
    expect(btc!.avgBuyPrice).toBe(50000000);

    const eth = result.holdings.find((h) => h.symbol === 'ETH');
    expect(eth!.avgBuyPrice).toBe(3000000);
  });

  it('보유 수량이 0인 코인을 필터링한다', () => {
    const result = normalizeBithumbBalance(bithumbV2BalanceFixture);

    const xrp = result.holdings.find((h) => h.symbol === 'XRP');
    expect(xrp).toBeUndefined();
  });

  it('잠김 수량이 0인 경우 0으로 처리한다', () => {
    const result = normalizeBithumbBalance(bithumbV2BalanceFixture);

    const eth = result.holdings.find((h) => h.symbol === 'ETH');
    expect(eth!.balance).toBe(5);
    expect(eth!.lockedBalance).toBe(0);
  });

  it('null/undefined 입력 시 빈 결과를 반환한다', () => {
    expect(normalizeBithumbBalance(null).holdings).toHaveLength(0);
    expect(normalizeBithumbBalance(undefined).holdings).toHaveLength(0);
  });

  it('빈 배열 입력 시 빈 결과를 반환한다', () => {
    const result = normalizeBithumbBalance([]);
    expect(result.holdings).toHaveLength(0);
    expect(result.krwBalance).toBe(0);
  });

  it('배열이 아닌 입력 시 빈 결과를 반환한다', () => {
    const result = normalizeBithumbBalance({ some: 'data' });
    expect(result.holdings).toHaveLength(0);
  });
});

// ===== 시세 정규화 테스트 =====

describe('normalizeBithumbTicker', () => {
  it('v1 Public API 단일 코인 시세를 정규화한다 (symbol 지정)', () => {
    const result = normalizeBithumbTicker(bithumbSingleTickerFixture, 'BTC');

    expect(result.exchange).toBe('bithumb');
    expect(result.tickers).toHaveLength(1);
    expect(result.tickers[0]!.symbol).toBe('BTC');
  });

  it('단일 코인 가격 정보를 올바르게 매핑한다', () => {
    const result = normalizeBithumbTicker(bithumbSingleTickerFixture, 'BTC');
    const btc = result.tickers[0]!;

    expect(btc.currentPrice).toBe(50500000);
    expect(btc.openPrice).toBe(49000000);
    expect(btc.highPrice).toBe(51000000);
    expect(btc.lowPrice).toBe(48500000);
    expect(btc.prevClosePrice).toBe(49500000);
    expect(btc.changeRate).toBe(2.02);
    expect(btc.changePrice).toBe(1000000);
  });

  it('전체 코인 시세(ALL_KRW)를 정규화한다', () => {
    const result = normalizeBithumbTicker(bithumbAllTickerFixture);

    expect(result.tickers).toHaveLength(2);
    expect(result.tickers.find((t) => t.symbol === 'BTC')).toBeDefined();
    expect(result.tickers.find((t) => t.symbol === 'ETH')).toBeDefined();
  });

  it('전체 시세에서 date 키를 건너뛴다', () => {
    const result = normalizeBithumbTicker(bithumbAllTickerFixture);

    // date 문자열 항목은 포함되지 않아야 한다
    expect(result.tickers).toHaveLength(2);
  });

  it('거래량 정보를 올바르게 매핑한다', () => {
    const result = normalizeBithumbTicker(bithumbSingleTickerFixture, 'BTC');
    const btc = result.tickers[0]!;

    expect(btc.volume24h).toBe(5500);
    expect(btc.volumeAmount24h).toBe(275000000000);
  });

  it('status가 "0000"이 아닌 경우 빈 결과를 반환한다', () => {
    const errorResponse = { status: '5000', data: {} };
    const result = normalizeBithumbTicker(errorResponse, 'BTC');
    expect(result.tickers).toHaveLength(0);
  });

  it('null 입력 시 빈 결과를 반환한다', () => {
    const result = normalizeBithumbTicker(null);
    expect(result.tickers).toHaveLength(0);
  });
});

// ===== 호가 정규화 테스트 =====

describe('normalizeBithumbOrderbook', () => {
  it('v1 Public API 호가 응답을 정규화된 형태로 변환한다', () => {
    const result = normalizeBithumbOrderbook(bithumbOrderbookFixture);

    expect(result.exchange).toBe('bithumb');
    expect(result.orderbook.symbol).toBe('BTC');
    expect(result.orderbook.exchange).toBe('bithumb');
  });

  it('매도 호가(asks)를 낮은 가격순으로 정렬한다', () => {
    const result = normalizeBithumbOrderbook(bithumbOrderbookFixture);
    const asks = result.orderbook.asks;

    expect(asks).toHaveLength(3);
    expect(asks[0]!.price).toBe(50100000);
    expect(asks[1]!.price).toBe(50200000);
    expect(asks[2]!.price).toBe(50300000);
  });

  it('매수 호가(bids)를 높은 가격순으로 정렬한다', () => {
    const result = normalizeBithumbOrderbook(bithumbOrderbookFixture);
    const bids = result.orderbook.bids;

    expect(bids).toHaveLength(3);
    expect(bids[0]!.price).toBe(50000000);
    expect(bids[1]!.price).toBe(49900000);
    expect(bids[2]!.price).toBe(49800000);
  });

  it('문자열 가격/수량을 숫자로 변환한다', () => {
    const result = normalizeBithumbOrderbook(bithumbOrderbookFixture);

    expect(result.orderbook.asks[0]!.price).toBeTypeOf('number');
    expect(result.orderbook.asks[0]!.quantity).toBeTypeOf('number');
    expect(result.orderbook.bids[0]!.price).toBeTypeOf('number');
    expect(result.orderbook.bids[0]!.quantity).toBeTypeOf('number');
  });

  it('타임스탬프를 올바르게 변환한다', () => {
    const result = normalizeBithumbOrderbook(bithumbOrderbookFixture);

    expect(result.orderbook.timestamp).toBe(1746100800000);
  });

  it('status가 "0000"이 아닌 경우 빈 호가를 반환한다', () => {
    const result = normalizeBithumbOrderbook({ status: '5100', data: {} });
    expect(result.orderbook.asks).toHaveLength(0);
    expect(result.orderbook.bids).toHaveLength(0);
  });

  it('asks/bids가 없는 경우 빈 배열을 반환한다', () => {
    const result = normalizeBithumbOrderbook({
      status: '0000',
      data: {
        timestamp: '1746100800000',
        order_currency: 'BTC',
        payment_currency: 'KRW',
      },
    });
    expect(result.orderbook.asks).toHaveLength(0);
    expect(result.orderbook.bids).toHaveLength(0);
  });
});

// ===== 주문 내역 정규화 테스트 =====

describe('normalizeBithumbOrderHistory', () => {
  it('v2 주문 내역 배열 응답을 정규화된 형태로 변환한다', () => {
    const result = normalizeBithumbOrderHistory(bithumbV2OrdersFixture);

    expect(result.exchange).toBe('bithumb');
    expect(result.orders).toHaveLength(4);
    expect(result.timestamp).toBeTypeOf('number');
  });

  it('주문 유형(bid/ask)을 buy/sell로 매핑한다', () => {
    const result = normalizeBithumbOrderHistory(bithumbV2OrdersFixture);

    expect(result.orders[0]!.side).toBe('buy');  // bid -> buy
    expect(result.orders[1]!.side).toBe('sell'); // ask -> sell
  });

  it('완료된 주문을 filled로 매핑한다', () => {
    const result = normalizeBithumbOrderHistory(bithumbV2OrdersFixture);

    // order-001: state='done'
    expect(result.orders[0]!.status).toBe('filled');
    expect(result.orders[0]!.orderId).toBe('bithumb-order-001');
  });

  it('대기 중인 주문을 open으로 매핑한다', () => {
    const result = normalizeBithumbOrderHistory(bithumbV2OrdersFixture);

    // order-002: state='wait', executed_volume='0'
    expect(result.orders[1]!.status).toBe('open');
  });

  it('일부 체결된 주문을 partially_filled로 매핑한다', () => {
    const result = normalizeBithumbOrderHistory(bithumbV2OrdersFixture);

    // order-003: state='wait', volume='0.05', executed_volume='0.02'
    expect(result.orders[2]!.status).toBe('partially_filled');
    expect(result.orders[2]!.executedQuantity).toBeCloseTo(0.02, 5);
    expect(result.orders[2]!.quantity).toBe(0.05);
  });

  it('취소된 주문을 cancelled로 매핑한다', () => {
    const result = normalizeBithumbOrderHistory(bithumbV2OrdersFixture);

    // order-004: state='cancel'
    expect(result.orders[3]!.status).toBe('cancelled');
  });

  it('마켓 코드에서 코인 심볼을 올바르게 추출한다', () => {
    const result = normalizeBithumbOrderHistory(bithumbV2OrdersFixture);

    expect(result.orders[0]!.symbol).toBe('BTC');
    expect(result.orders[0]!.currency).toBe('KRW');
    expect(result.orders[1]!.symbol).toBe('ETH');
  });

  it('주문 시각을 Date 객체로 변환한다', () => {
    const result = normalizeBithumbOrderHistory(bithumbV2OrdersFixture);

    expect(result.orders[0]!.orderedAt).toBeInstanceOf(Date);
  });

  it('null 입력 시 빈 결과를 반환한다', () => {
    const result = normalizeBithumbOrderHistory(null);
    expect(result.orders).toHaveLength(0);
  });

  it('빈 배열 입력 시 빈 결과를 반환한다', () => {
    const result = normalizeBithumbOrderHistory([]);
    expect(result.orders).toHaveLength(0);
  });

  it('배열이 아닌 입력 시 빈 결과를 반환한다', () => {
    const result = normalizeBithumbOrderHistory({ some: 'data' });
    expect(result.orders).toHaveLength(0);
  });
});
