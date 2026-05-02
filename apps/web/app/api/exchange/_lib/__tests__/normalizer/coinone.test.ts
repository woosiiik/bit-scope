/**
 * 코인원 API 응답 정규화 단위 테스트
 *
 * 코인원 잔고, 시세, 호가, 주문 내역 응답의 정규화를 검증한다.
 * 실제 응답 fixture 기반으로 정확한 변환, 빈 잔고, 특수 케이스를 포함한다.
 *
 * @see 요구사항 12.4 (응답 데이터 통일된 내부 데이터 모델 정규화)
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeCoinoneBalance,
  normalizeCoinoneTicker,
  normalizeCoinoneOrderbook,
  normalizeCoinoneOrderHistory,
} from '../../normalizer/coinone';
import type {
  CoinoneBalanceResponse,
  CoinoneTickerResponse,
  CoinoneOrderbookResponse,
  CoinoneOrderHistoryResponse,
} from '../../normalizer/coinone';

// ===== Fixture 데이터: 코인원 실제 응답 구조 기반 =====

const coinoneBalanceFixture: CoinoneBalanceResponse = {
  result: 'success',
  balances: [
    {
      currency: 'KRW',
      available: '3000000',
      limit: '200000',
      average_price: '0',
    },
    {
      currency: 'BTC',
      available: '0.2',
      limit: '0.05',
      average_price: '51000000',
    },
    {
      currency: 'ETH',
      available: '8',
      limit: '0',
      average_price: '3100000',
    },
    // 잔고 0인 코인
    {
      currency: 'XRP',
      available: '0',
      limit: '0',
      average_price: '500',
    },
  ],
};

const coinoneTickerFixture: CoinoneTickerResponse = {
  result: 'success',
  tickers: [
    {
      target_currency: 'BTC',
      quote_currency: 'KRW',
      last: '50500000',
      first: '49000000',
      high: '51000000',
      low: '48500000',
      target_volume: '5000',
      quote_volume: '250000000000',
      yesterday_last: '49500000',
      timestamp: 1746100800000,
    },
    {
      target_currency: 'ETH',
      quote_currency: 'KRW',
      last: '3150000',
      first: '3100000',
      high: '3200000',
      low: '3000000',
      target_volume: '4000',
      quote_volume: '12600000000',
      yesterday_last: '3050000',
      timestamp: 1746100800000,
    },
  ],
};

const coinoneOrderbookFixture: CoinoneOrderbookResponse = {
  result: 'success',
  target_currency: 'BTC',
  quote_currency: 'KRW',
  timestamp: 1746100800000,
  asks: [
    { price: '50100000', qty: '1.0' },
    { price: '50300000', qty: '1.2' },
    { price: '50200000', qty: '0.8' },
  ],
  bids: [
    { price: '49900000', qty: '2.0' },
    { price: '50000000', qty: '1.5' },
    { price: '49800000', qty: '1.0' },
  ],
};

const coinoneOrdersFixture: CoinoneOrderHistoryResponse = {
  result: 'success',
  orders: [
    {
      order_id: 'coinone-order-001',
      target_currency: 'BTC',
      quote_currency: 'KRW',
      type: 'buy',
      price: '50000000',
      qty: '0.1',
      executed_qty: '0.1',
      status: 'filled',
      timestamp: '1746100800000',
    },
    {
      order_id: 'coinone-order-002',
      target_currency: 'ETH',
      quote_currency: 'KRW',
      type: 'sell',
      price: '3200000',
      qty: '5',
      executed_qty: '0',
      status: 'live',
      timestamp: '1746104400000',
    },
    {
      order_id: 'coinone-order-003',
      target_currency: 'BTC',
      quote_currency: 'KRW',
      type: 'buy',
      price: '49000000',
      qty: '0.05',
      executed_qty: '0.02',
      status: 'live',
      timestamp: '1746108000000',
    },
    {
      order_id: 'coinone-order-004',
      target_currency: 'XRP',
      quote_currency: 'KRW',
      type: 'sell',
      price: '500',
      qty: '1000',
      executed_qty: '0',
      status: 'cancelled',
      timestamp: '1746000000000',
    },
  ],
};

// ===== 잔고 정규화 테스트 =====

describe('normalizeCoinoneBalance', () => {
  it('잔고 응답을 정규화된 형태로 변환한다', () => {
    const result = normalizeCoinoneBalance(coinoneBalanceFixture);

    expect(result.exchange).toBe('coinone');
    expect(result.timestamp).toBeTypeOf('number');
  });

  it('KRW 잔고를 krwBalance로 분리한다', () => {
    const result = normalizeCoinoneBalance(coinoneBalanceFixture);

    // available + limit = 3000000 + 200000
    expect(result.krwBalance).toBe(3200000);
    expect(result.holdings.find((h) => h.symbol === 'KRW')).toBeUndefined();
  });

  it('보유 코인의 잔고를 올바르게 변환한다', () => {
    const result = normalizeCoinoneBalance(coinoneBalanceFixture);

    const btc = result.holdings.find((h) => h.symbol === 'BTC');
    expect(btc).toBeDefined();
    expect(btc!.exchange).toBe('coinone');
    expect(btc!.balance).toBe(0.2);        // available
    expect(btc!.lockedBalance).toBe(0.05); // limit
    expect(btc!.currency).toBe('KRW');
  });

  it('매수 평균가 기반 기본 평가금액을 계산한다', () => {
    const result = normalizeCoinoneBalance(coinoneBalanceFixture);

    const btc = result.holdings.find((h) => h.symbol === 'BTC');
    expect(btc!.avgBuyPrice).toBe(51000000);
    // totalBalance = 0.2 + 0.05 = 0.25, currentPrice = avgBuyPrice = 51000000
    // evaluationAmount = 0.25 * 51000000 = 12750000
    expect(btc!.evaluationAmount).toBe(12750000);
  });

  it('보유 수량이 0인 코인을 필터링한다', () => {
    const result = normalizeCoinoneBalance(coinoneBalanceFixture);

    const xrp = result.holdings.find((h) => h.symbol === 'XRP');
    expect(xrp).toBeUndefined();
  });

  it('잠김 수량이 0인 코인도 정상 처리한다', () => {
    const result = normalizeCoinoneBalance(coinoneBalanceFixture);

    const eth = result.holdings.find((h) => h.symbol === 'ETH');
    expect(eth!.balance).toBe(8);
    expect(eth!.lockedBalance).toBe(0);
  });

  it('result가 "success"가 아닌 경우 빈 결과를 반환한다', () => {
    const errorResponse: CoinoneBalanceResponse = {
      result: 'error',
      error_code: '4',
      error_msg: 'Blocked user access',
      balances: [],
    };
    const result = normalizeCoinoneBalance(errorResponse);

    expect(result.holdings).toHaveLength(0);
    expect(result.krwBalance).toBe(0);
  });

  it('null/undefined 입력 시 빈 결과를 반환한다', () => {
    expect(normalizeCoinoneBalance(null).holdings).toHaveLength(0);
    expect(normalizeCoinoneBalance(undefined).holdings).toHaveLength(0);
  });

  it('balances가 배열이 아닌 경우 빈 결과를 반환한다', () => {
    const result = normalizeCoinoneBalance({
      result: 'success',
      balances: 'not-array',
    });
    expect(result.holdings).toHaveLength(0);
  });

  it('average_price가 없는 경우 avgBuyPrice=0으로 처리한다', () => {
    const response: CoinoneBalanceResponse = {
      result: 'success',
      balances: [
        {
          currency: 'DOGE',
          available: '1000',
          limit: '0',
          // average_price가 없음
        },
      ],
    };
    const result = normalizeCoinoneBalance(response);

    expect(result.holdings[0].avgBuyPrice).toBe(0);
  });
});

// ===== 시세 정규화 테스트 =====

describe('normalizeCoinoneTicker', () => {
  it('시세 응답을 정규화된 형태로 변환한다', () => {
    const result = normalizeCoinoneTicker(coinoneTickerFixture);

    expect(result.exchange).toBe('coinone');
    expect(result.tickers).toHaveLength(2);
    expect(result.timestamp).toBeTypeOf('number');
  });

  it('코인 심볼을 대문자로 변환한다', () => {
    const result = normalizeCoinoneTicker(coinoneTickerFixture);

    expect(result.tickers[0].symbol).toBe('BTC');
    expect(result.tickers[1].symbol).toBe('ETH');
  });

  it('가격 정보를 올바르게 매핑한다', () => {
    const result = normalizeCoinoneTicker(coinoneTickerFixture);
    const btc = result.tickers[0];

    expect(btc.currentPrice).toBe(50500000);
    expect(btc.openPrice).toBe(49000000);
    expect(btc.highPrice).toBe(51000000);
    expect(btc.lowPrice).toBe(48500000);
    expect(btc.prevClosePrice).toBe(49500000);
  });

  it('변동률을 올바르게 계산한다', () => {
    const result = normalizeCoinoneTicker(coinoneTickerFixture);
    const btc = result.tickers[0];

    // (50500000 - 49500000) / 49500000 * 100 = 약 2.02%
    expect(btc.changeRate).toBeCloseTo(2.0202, 2);
    // 변동 금액 = 50500000 - 49500000 = 1000000
    expect(btc.changePrice).toBe(1000000);
  });

  it('전일 종가가 0인 경우 변동률을 0으로 처리한다', () => {
    const response: CoinoneTickerResponse = {
      result: 'success',
      tickers: [
        {
          target_currency: 'NEW',
          quote_currency: 'KRW',
          last: '1000',
          first: '1000',
          high: '1000',
          low: '1000',
          target_volume: '100',
          quote_volume: '100000',
          yesterday_last: '0',
          timestamp: Date.now(),
        },
      ],
    };
    const result = normalizeCoinoneTicker(response);
    expect(result.tickers[0].changeRate).toBe(0);
  });

  it('거래량 정보를 올바르게 매핑한다', () => {
    const result = normalizeCoinoneTicker(coinoneTickerFixture);
    const btc = result.tickers[0];

    expect(btc.volume24h).toBe(5000);
    expect(btc.volumeAmount24h).toBe(250000000000);
  });

  it('result가 "success"가 아닌 경우 빈 결과를 반환한다', () => {
    const result = normalizeCoinoneTicker({ result: 'error', tickers: [] });
    expect(result.tickers).toHaveLength(0);
  });

  it('null 입력 시 빈 결과를 반환한다', () => {
    const result = normalizeCoinoneTicker(null);
    expect(result.tickers).toHaveLength(0);
  });

  it('tickers가 배열이 아닌 경우 빈 결과를 반환한다', () => {
    const result = normalizeCoinoneTicker({ result: 'success', tickers: 'bad' });
    expect(result.tickers).toHaveLength(0);
  });
});

// ===== 호가 정규화 테스트 =====

describe('normalizeCoinoneOrderbook', () => {
  it('호가 응답을 정규화된 형태로 변환한다', () => {
    const result = normalizeCoinoneOrderbook(coinoneOrderbookFixture);

    expect(result.exchange).toBe('coinone');
    expect(result.orderbook.symbol).toBe('BTC');
    expect(result.orderbook.exchange).toBe('coinone');
  });

  it('매도 호가(asks)를 낮은 가격순으로 정렬한다', () => {
    const result = normalizeCoinoneOrderbook(coinoneOrderbookFixture);
    const asks = result.orderbook.asks;

    expect(asks).toHaveLength(3);
    expect(asks[0].price).toBe(50100000);
    expect(asks[1].price).toBe(50200000);
    expect(asks[2].price).toBe(50300000);
  });

  it('매수 호가(bids)를 높은 가격순으로 정렬한다', () => {
    const result = normalizeCoinoneOrderbook(coinoneOrderbookFixture);
    const bids = result.orderbook.bids;

    expect(bids).toHaveLength(3);
    expect(bids[0].price).toBe(50000000);
    expect(bids[1].price).toBe(49900000);
    expect(bids[2].price).toBe(49800000);
  });

  it('문자열 가격/수량을 숫자로 변환한다', () => {
    const result = normalizeCoinoneOrderbook(coinoneOrderbookFixture);

    expect(result.orderbook.asks[0].price).toBeTypeOf('number');
    expect(result.orderbook.asks[0].quantity).toBeTypeOf('number');
  });

  it('타임스탬프를 올바르게 매핑한다', () => {
    const result = normalizeCoinoneOrderbook(coinoneOrderbookFixture);

    expect(result.orderbook.timestamp).toBe(1746100800000);
  });

  it('result가 "success"가 아닌 경우 빈 호가를 반환한다', () => {
    const result = normalizeCoinoneOrderbook({ result: 'error', asks: [], bids: [] });
    expect(result.orderbook.asks).toHaveLength(0);
    expect(result.orderbook.bids).toHaveLength(0);
  });

  it('asks/bids가 없는 경우 빈 배열을 반환한다', () => {
    const result = normalizeCoinoneOrderbook({
      result: 'success',
      target_currency: 'BTC',
      quote_currency: 'KRW',
      timestamp: Date.now(),
    });
    expect(result.orderbook.asks).toHaveLength(0);
    expect(result.orderbook.bids).toHaveLength(0);
  });
});

// ===== 주문 내역 정규화 테스트 =====

describe('normalizeCoinoneOrderHistory', () => {
  it('주문 내역 응답을 정규화된 형태로 변환한다', () => {
    const result = normalizeCoinoneOrderHistory(coinoneOrdersFixture);

    expect(result.exchange).toBe('coinone');
    expect(result.orders).toHaveLength(4);
    expect(result.timestamp).toBeTypeOf('number');
  });

  it('주문 유형을 그대로 매핑한다 (buy/sell)', () => {
    const result = normalizeCoinoneOrderHistory(coinoneOrdersFixture);

    expect(result.orders[0].side).toBe('buy');
    expect(result.orders[1].side).toBe('sell');
  });

  it('완료된 주문을 filled로 매핑한다', () => {
    const result = normalizeCoinoneOrderHistory(coinoneOrdersFixture);

    // order-001: status='filled'
    expect(result.orders[0].status).toBe('filled');
    expect(result.orders[0].orderId).toBe('coinone-order-001');
  });

  it('대기 중인 주문을 open으로 매핑한다', () => {
    const result = normalizeCoinoneOrderHistory(coinoneOrdersFixture);

    // order-002: status='live', executed_qty=0
    expect(result.orders[1].status).toBe('open');
  });

  it('일부 체결된 주문을 partially_filled로 매핑한다', () => {
    const result = normalizeCoinoneOrderHistory(coinoneOrdersFixture);

    // order-003: status='live', qty=0.05, executed_qty=0.02
    expect(result.orders[2].status).toBe('partially_filled');
    expect(result.orders[2].executedQuantity).toBe(0.02);
    expect(result.orders[2].quantity).toBe(0.05);
  });

  it('취소된 주문을 cancelled로 매핑한다', () => {
    const result = normalizeCoinoneOrderHistory(coinoneOrdersFixture);

    // order-004: status='cancelled'
    expect(result.orders[3].status).toBe('cancelled');
  });

  it('코인 심볼을 대문자로 변환한다', () => {
    const result = normalizeCoinoneOrderHistory(coinoneOrdersFixture);

    expect(result.orders[0].symbol).toBe('BTC');
    expect(result.orders[0].currency).toBe('KRW');
  });

  it('주문 시각을 Date 객체로 변환한다', () => {
    const result = normalizeCoinoneOrderHistory(coinoneOrdersFixture);

    expect(result.orders[0].orderedAt).toBeInstanceOf(Date);
    // 타임스탬프 1746100800000 = 특정 시각
    expect(result.orders[0].orderedAt.getTime()).toBe(1746100800000);
  });

  it('result가 "success"가 아닌 경우 빈 결과를 반환한다', () => {
    const result = normalizeCoinoneOrderHistory({ result: 'error', orders: [] });
    expect(result.orders).toHaveLength(0);
  });

  it('orders가 배열이 아닌 경우 빈 결과를 반환한다', () => {
    const result = normalizeCoinoneOrderHistory({ result: 'success', orders: 'bad' });
    expect(result.orders).toHaveLength(0);
  });

  it('null 입력 시 빈 결과를 반환한다', () => {
    const result = normalizeCoinoneOrderHistory(null);
    expect(result.orders).toHaveLength(0);
  });
});
