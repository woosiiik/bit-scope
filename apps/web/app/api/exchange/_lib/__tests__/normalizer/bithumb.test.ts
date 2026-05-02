/**
 * 빗썸 API 응답 정규화 단위 테스트
 *
 * 빗썸 잔고, 시세, 호가, 주문 내역 응답의 정규화를 검증한다.
 * 실제 응답 fixture 기반으로 정확한 변환, 빈 잔고, 특수 케이스를 포함한다.
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
  BithumbApiResponse,
  BithumbBalanceData,
  BithumbAllTickerData,
  BithumbTickerData,
  BithumbOrderbookData,
  BithumbOrderItem,
} from '../../normalizer/bithumb';

// ===== Fixture 데이터: 빗썸 실제 응답 구조 기반 =====

const bithumbBalanceFixture: BithumbApiResponse<BithumbBalanceData> = {
  status: '0000',
  data: {
    total_krw: '5000000',
    available_krw: '4500000',
    total_btc: '0.3',
    available_btc: '0.2',
    total_eth: '5',
    available_eth: '5',
    // 잔고 0인 코인
    total_xrp: '0',
    available_xrp: '0',
  },
};

const bithumbSingleTickerFixture: BithumbApiResponse<BithumbTickerData> = {
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

const bithumbAllTickerFixture: BithumbApiResponse<BithumbAllTickerData> = {
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

const bithumbOrderbookFixture: BithumbApiResponse<BithumbOrderbookData> = {
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

const bithumbOrdersFixture: BithumbApiResponse<BithumbOrderItem[]> = {
  status: '0000',
  data: [
    {
      order_id: 'bithumb-order-001',
      order_currency: 'BTC',
      payment_currency: 'KRW',
      type: 'bid',
      status: 'completed',
      price: '50000000',
      quantity: '0',
      order_qty: '0.1',
      date: '1746100800000',
    },
    {
      order_id: 'bithumb-order-002',
      order_currency: 'ETH',
      payment_currency: 'KRW',
      type: 'ask',
      status: 'pending',
      price: '3200000',
      quantity: '5',
      order_qty: '5',
      date: '1746104400000',
    },
    {
      order_id: 'bithumb-order-003',
      order_currency: 'BTC',
      payment_currency: 'KRW',
      type: 'bid',
      status: 'pending',
      price: '49000000',
      quantity: '0.03',
      order_qty: '0.05',
      date: '1746108000000',
    },
    {
      order_id: 'bithumb-order-004',
      order_currency: 'XRP',
      payment_currency: 'KRW',
      type: 'ask',
      status: 'cancel',
      price: '500',
      quantity: '1000',
      order_qty: '1000',
      date: '1746000000000',
    },
  ],
};

// ===== 잔고 정규화 테스트 =====

describe('normalizeBithumbBalance', () => {
  it('잔고 응답을 정규화된 형태로 변환한다', () => {
    const result = normalizeBithumbBalance(bithumbBalanceFixture);

    expect(result.exchange).toBe('bithumb');
    expect(result.timestamp).toBeTypeOf('number');
  });

  it('KRW 잔고를 krwBalance로 분리한다', () => {
    const result = normalizeBithumbBalance(bithumbBalanceFixture);

    // total_krw = 5000000
    expect(result.krwBalance).toBe(5000000);
    expect(result.holdings.find((h) => h.symbol === 'KRW')).toBeUndefined();
  });

  it('보유 코인의 잔고를 올바르게 변환한다', () => {
    const result = normalizeBithumbBalance(bithumbBalanceFixture);

    const btc = result.holdings.find((h) => h.symbol === 'BTC');
    expect(btc).toBeDefined();
    expect(btc!.exchange).toBe('bithumb');
    expect(btc!.balance).toBe(0.2);       // available_btc
    expect(btc!.lockedBalance).toBeCloseTo(0.1, 10); // total - available = 0.3 - 0.2
    expect(btc!.currency).toBe('KRW');
  });

  it('빗썸은 매수 평균가가 없으므로 avgBuyPrice=0으로 설정한다', () => {
    const result = normalizeBithumbBalance(bithumbBalanceFixture);

    const btc = result.holdings.find((h) => h.symbol === 'BTC');
    expect(btc!.avgBuyPrice).toBe(0);
    expect(btc!.currentPrice).toBe(0);
    expect(btc!.evaluationAmount).toBe(0);
  });

  it('보유 수량이 0인 코인을 필터링한다', () => {
    const result = normalizeBithumbBalance(bithumbBalanceFixture);

    const xrp = result.holdings.find((h) => h.symbol === 'XRP');
    expect(xrp).toBeUndefined();
  });

  it('잠김 수량이 0 이하인 경우 0으로 처리한다', () => {
    const result = normalizeBithumbBalance(bithumbBalanceFixture);

    const eth = result.holdings.find((h) => h.symbol === 'ETH');
    expect(eth!.balance).toBe(5);
    expect(eth!.lockedBalance).toBe(0); // total=5, available=5, locked=0
  });

  it('status가 "0000"이 아닌 경우 빈 결과를 반환한다', () => {
    const errorResponse: BithumbApiResponse<BithumbBalanceData> = {
      status: '5100',
      data: { total_btc: '1', available_btc: '1' },
      message: 'Bad Request',
    };
    const result = normalizeBithumbBalance(errorResponse);

    expect(result.holdings).toHaveLength(0);
    expect(result.krwBalance).toBe(0);
  });

  it('null/undefined 입력 시 빈 결과를 반환한다', () => {
    expect(normalizeBithumbBalance(null).holdings).toHaveLength(0);
    expect(normalizeBithumbBalance(undefined).holdings).toHaveLength(0);
  });

  it('data가 없는 경우 빈 결과를 반환한다', () => {
    const result = normalizeBithumbBalance({ status: '0000' });
    expect(result.holdings).toHaveLength(0);
  });
});

// ===== 시세 정규화 테스트 =====

describe('normalizeBithumbTicker', () => {
  it('단일 코인 시세를 정규화한다 (symbol 지정)', () => {
    const result = normalizeBithumbTicker(bithumbSingleTickerFixture, 'BTC');

    expect(result.exchange).toBe('bithumb');
    expect(result.tickers).toHaveLength(1);
    expect(result.tickers[0].symbol).toBe('BTC');
  });

  it('단일 코인 가격 정보를 올바르게 매핑한다', () => {
    const result = normalizeBithumbTicker(bithumbSingleTickerFixture, 'BTC');
    const btc = result.tickers[0];

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
    const btc = result.tickers[0];

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
  it('호가 응답을 정규화된 형태로 변환한다', () => {
    const result = normalizeBithumbOrderbook(bithumbOrderbookFixture);

    expect(result.exchange).toBe('bithumb');
    expect(result.orderbook.symbol).toBe('BTC');
    expect(result.orderbook.exchange).toBe('bithumb');
  });

  it('매도 호가(asks)를 낮은 가격순으로 정렬한다', () => {
    const result = normalizeBithumbOrderbook(bithumbOrderbookFixture);
    const asks = result.orderbook.asks;

    expect(asks).toHaveLength(3);
    expect(asks[0].price).toBe(50100000);
    expect(asks[1].price).toBe(50200000);
    expect(asks[2].price).toBe(50300000);
  });

  it('매수 호가(bids)를 높은 가격순으로 정렬한다', () => {
    const result = normalizeBithumbOrderbook(bithumbOrderbookFixture);
    const bids = result.orderbook.bids;

    expect(bids).toHaveLength(3);
    expect(bids[0].price).toBe(50000000);
    expect(bids[1].price).toBe(49900000);
    expect(bids[2].price).toBe(49800000);
  });

  it('문자열 가격/수량을 숫자로 변환한다', () => {
    const result = normalizeBithumbOrderbook(bithumbOrderbookFixture);

    expect(result.orderbook.asks[0].price).toBeTypeOf('number');
    expect(result.orderbook.asks[0].quantity).toBeTypeOf('number');
    expect(result.orderbook.bids[0].price).toBeTypeOf('number');
    expect(result.orderbook.bids[0].quantity).toBeTypeOf('number');
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
  it('주문 내역 응답을 정규화된 형태로 변환한다', () => {
    const result = normalizeBithumbOrderHistory(bithumbOrdersFixture);

    expect(result.exchange).toBe('bithumb');
    expect(result.orders).toHaveLength(4);
    expect(result.timestamp).toBeTypeOf('number');
  });

  it('주문 유형(bid/ask)을 buy/sell로 매핑한다', () => {
    const result = normalizeBithumbOrderHistory(bithumbOrdersFixture);

    expect(result.orders[0].side).toBe('buy');  // bid -> buy
    expect(result.orders[1].side).toBe('sell'); // ask -> sell
  });

  it('완료된 주문을 filled로 매핑한다', () => {
    const result = normalizeBithumbOrderHistory(bithumbOrdersFixture);

    // order-001: status='completed'
    expect(result.orders[0].status).toBe('filled');
    expect(result.orders[0].orderId).toBe('bithumb-order-001');
  });

  it('대기 중인 주문을 open으로 매핑한다', () => {
    const result = normalizeBithumbOrderHistory(bithumbOrdersFixture);

    // order-002: status='pending', no executed qty
    expect(result.orders[1].status).toBe('open');
  });

  it('일부 체결된 주문을 partially_filled로 매핑한다', () => {
    const result = normalizeBithumbOrderHistory(bithumbOrdersFixture);

    // order-003: status='pending', order_qty=0.05, quantity(remaining)=0.03
    // executed = 0.05 - 0.03 = 0.02
    expect(result.orders[2].status).toBe('partially_filled');
    expect(result.orders[2].executedQuantity).toBeCloseTo(0.02, 5);
    expect(result.orders[2].quantity).toBe(0.05);
  });

  it('취소된 주문을 cancelled로 매핑한다', () => {
    const result = normalizeBithumbOrderHistory(bithumbOrdersFixture);

    // order-004: status='cancel'
    expect(result.orders[3].status).toBe('cancelled');
  });

  it('코인 심볼을 대문자로 변환한다', () => {
    const result = normalizeBithumbOrderHistory(bithumbOrdersFixture);

    expect(result.orders[0].symbol).toBe('BTC');
    expect(result.orders[0].currency).toBe('KRW');
  });

  it('주문 시각을 Date 객체로 변환한다', () => {
    const result = normalizeBithumbOrderHistory(bithumbOrdersFixture);

    expect(result.orders[0].orderedAt).toBeInstanceOf(Date);
  });

  it('status가 "0000"이 아닌 경우 빈 결과를 반환한다', () => {
    const result = normalizeBithumbOrderHistory({ status: '5100', data: [] });
    expect(result.orders).toHaveLength(0);
  });

  it('data가 배열이 아닌 경우 빈 결과를 반환한다', () => {
    const result = normalizeBithumbOrderHistory({ status: '0000', data: 'not-array' });
    expect(result.orders).toHaveLength(0);
  });

  it('null 입력 시 빈 결과를 반환한다', () => {
    const result = normalizeBithumbOrderHistory(null);
    expect(result.orders).toHaveLength(0);
  });
});
