/**
 * 업비트 API 응답 정규화 단위 테스트
 *
 * 업비트 잔고, 시세, 호가, 주문 내역 응답의 정규화를 검증한다.
 * 실제 응답 fixture 기반으로 정확한 변환, 빈 잔고, 특수 케이스를 포함한다.
 *
 * @see 요구사항 12.4 (응답 데이터 통일된 내부 데이터 모델 정규화)
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeUpbitBalance,
  normalizeUpbitTicker,
  normalizeUpbitOrderbook,
  normalizeUpbitOrderHistory,
  extractSymbolFromMarket,
  extractCurrencyFromMarket,
} from '../../normalizer/upbit';
import type {
  UpbitAccountItem,
  UpbitTickerItem,
  UpbitOrderbookItem,
  UpbitOrderItem,
} from '../../normalizer/upbit';

// ===== Fixture 데이터: 업비트 실제 응답 구조 기반 =====

const upbitBalanceFixture: UpbitAccountItem[] = [
  {
    currency: 'KRW',
    balance: '1000000',
    locked: '50000',
    avg_buy_price: '0',
    avg_buy_price_modified: false,
    unit_currency: 'KRW',
  },
  {
    currency: 'BTC',
    balance: '0.5',
    locked: '0.1',
    avg_buy_price: '50000000',
    avg_buy_price_modified: false,
    unit_currency: 'KRW',
  },
  {
    currency: 'ETH',
    balance: '10',
    locked: '0',
    avg_buy_price: '3000000',
    avg_buy_price_modified: false,
    unit_currency: 'KRW',
  },
  // 수량 0인 코인 (필터링 대상)
  {
    currency: 'XRP',
    balance: '0',
    locked: '0',
    avg_buy_price: '500',
    avg_buy_price_modified: false,
    unit_currency: 'KRW',
  },
];

const upbitTickerFixture: UpbitTickerItem[] = [
  {
    market: 'KRW-BTC',
    trade_date: '20250501',
    trade_time: '120000',
    trade_date_kst: '20250501',
    trade_time_kst: '210000',
    trade_timestamp: 1746100800000,
    opening_price: 49000000,
    high_price: 51000000,
    low_price: 48500000,
    trade_price: 50500000,
    prev_closing_price: 49500000,
    change: 'RISE',
    change_price: 1000000,
    change_rate: 0.0202,
    signed_change_price: 1000000,
    signed_change_rate: 0.0202,
    trade_volume: 0.5,
    acc_trade_price: 100000000000,
    acc_trade_price_24h: 250000000000,
    acc_trade_volume: 2000,
    acc_trade_volume_24h: 5000,
    highest_52_week_price: 80000000,
    highest_52_week_date: '2025-03-15',
    lowest_52_week_price: 30000000,
    lowest_52_week_date: '2024-07-01',
    timestamp: 1746100800000,
  },
  {
    market: 'KRW-ETH',
    trade_date: '20250501',
    trade_time: '120000',
    trade_date_kst: '20250501',
    trade_time_kst: '210000',
    trade_timestamp: 1746100800000,
    opening_price: 3100000,
    high_price: 3200000,
    low_price: 3000000,
    trade_price: 3150000,
    prev_closing_price: 3050000,
    change: 'RISE',
    change_price: 100000,
    change_rate: 0.0328,
    signed_change_price: 100000,
    signed_change_rate: 0.0328,
    trade_volume: 10,
    acc_trade_price: 5000000000,
    acc_trade_price_24h: 12000000000,
    acc_trade_volume: 1600,
    acc_trade_volume_24h: 4000,
    highest_52_week_price: 5000000,
    highest_52_week_date: '2025-01-10',
    lowest_52_week_price: 2000000,
    lowest_52_week_date: '2024-09-20',
    timestamp: 1746100800000,
  },
];

const upbitOrderbookFixture: UpbitOrderbookItem[] = [
  {
    market: 'KRW-BTC',
    timestamp: 1746100800000,
    total_ask_size: 5.5,
    total_bid_size: 6.2,
    orderbook_units: [
      { ask_price: 50100000, bid_price: 50000000, ask_size: 1.0, bid_size: 1.5 },
      { ask_price: 50200000, bid_price: 49900000, ask_size: 0.8, bid_size: 2.0 },
      { ask_price: 50300000, bid_price: 49800000, ask_size: 1.2, bid_size: 1.0 },
    ],
  },
];

const upbitOrdersFixture: UpbitOrderItem[] = [
  {
    uuid: 'order-001',
    side: 'bid',
    ord_type: 'limit',
    price: '50000000',
    state: 'done',
    market: 'KRW-BTC',
    created_at: '2025-05-01T09:00:00+09:00',
    volume: '0.1',
    remaining_volume: '0',
    reserved_fee: '0',
    remaining_fee: '0',
    paid_fee: '25000',
    locked: '0',
    executed_volume: '0.1',
    trades_count: 1,
  },
  {
    uuid: 'order-002',
    side: 'ask',
    ord_type: 'limit',
    price: '51000000',
    state: 'wait',
    market: 'KRW-BTC',
    created_at: '2025-05-01T10:00:00+09:00',
    volume: '0.05',
    remaining_volume: '0.05',
    reserved_fee: '0',
    remaining_fee: '0',
    paid_fee: '0',
    locked: '0.05',
    executed_volume: '0',
    trades_count: 0,
  },
  {
    uuid: 'order-003',
    side: 'bid',
    ord_type: 'limit',
    price: '3000000',
    state: 'wait',
    market: 'KRW-ETH',
    created_at: '2025-05-01T11:00:00+09:00',
    volume: '5',
    remaining_volume: '3',
    reserved_fee: '0',
    remaining_fee: '0',
    paid_fee: '0',
    locked: '3',
    executed_volume: '2',
    trades_count: 1,
  },
  {
    uuid: 'order-004',
    side: 'ask',
    ord_type: 'limit',
    price: '500',
    state: 'cancel',
    market: 'KRW-XRP',
    created_at: '2025-04-30T15:00:00+09:00',
    volume: '1000',
    remaining_volume: '1000',
    reserved_fee: '0',
    remaining_fee: '0',
    paid_fee: '0',
    locked: '0',
    executed_volume: '0',
    trades_count: 0,
  },
];

// ===== 헬퍼 함수 테스트 =====

describe('extractSymbolFromMarket', () => {
  it('업비트 마켓 코드에서 코인 심볼을 추출한다', () => {
    expect(extractSymbolFromMarket('KRW-BTC')).toBe('BTC');
    expect(extractSymbolFromMarket('KRW-ETH')).toBe('ETH');
    expect(extractSymbolFromMarket('BTC-XRP')).toBe('XRP');
  });

  it('하이픈이 없는 경우 원본을 반환한다', () => {
    expect(extractSymbolFromMarket('BTC')).toBe('BTC');
  });
});

describe('extractCurrencyFromMarket', () => {
  it('업비트 마켓 코드에서 마켓 통화를 추출한다', () => {
    expect(extractCurrencyFromMarket('KRW-BTC')).toBe('KRW');
    expect(extractCurrencyFromMarket('BTC-XRP')).toBe('BTC');
    expect(extractCurrencyFromMarket('USDT-ETH')).toBe('USDT');
  });

  it('알 수 없는 통화는 KRW를 반환한다', () => {
    expect(extractCurrencyFromMarket('EUR-BTC')).toBe('KRW');
  });
});

// ===== 잔고 정규화 테스트 =====

describe('normalizeUpbitBalance', () => {
  it('잔고 응답을 정규화된 형태로 변환한다', () => {
    const result = normalizeUpbitBalance(upbitBalanceFixture);

    expect(result.exchange).toBe('upbit');
    expect(result.timestamp).toBeTypeOf('number');
  });

  it('KRW 잔고를 krwBalance로 분리한다', () => {
    const result = normalizeUpbitBalance(upbitBalanceFixture);

    // total = balance + locked = 1000000 + 50000
    expect(result.krwBalance).toBe(1050000);
    // holdings에 KRW가 포함되지 않음
    expect(result.holdings.find((h) => h.symbol === 'KRW')).toBeUndefined();
  });

  it('보유 코인의 잔고를 올바르게 변환한다', () => {
    const result = normalizeUpbitBalance(upbitBalanceFixture);

    const btc = result.holdings.find((h) => h.symbol === 'BTC');
    expect(btc).toBeDefined();
    expect(btc!.exchange).toBe('upbit');
    expect(btc!.balance).toBe(0.5);
    expect(btc!.lockedBalance).toBe(0.1);
    expect(btc!.avgBuyPrice).toBe(50000000);
    expect(btc!.currency).toBe('KRW');
  });

  it('매수 평균가가 0이 아닌 코인의 기본 평가금액을 계산한다', () => {
    const result = normalizeUpbitBalance(upbitBalanceFixture);

    const btc = result.holdings.find((h) => h.symbol === 'BTC');
    // totalBalance = 0.5 + 0.1 = 0.6, avgBuyPrice = 50000000
    // currentPrice = avgBuyPrice (기본값), evaluationAmount = 0.6 * 50000000
    expect(btc!.evaluationAmount).toBe(30000000);
  });

  it('보유 수량이 0인 코인을 필터링한다', () => {
    const result = normalizeUpbitBalance(upbitBalanceFixture);

    const xrp = result.holdings.find((h) => h.symbol === 'XRP');
    expect(xrp).toBeUndefined();
  });

  it('빈 배열 입력 시 빈 결과를 반환한다', () => {
    const result = normalizeUpbitBalance([]);

    expect(result.exchange).toBe('upbit');
    expect(result.holdings).toHaveLength(0);
    expect(result.krwBalance).toBe(0);
  });

  it('배열이 아닌 입력 시 빈 결과를 반환한다', () => {
    const result = normalizeUpbitBalance({ error: 'invalid' });

    expect(result.holdings).toHaveLength(0);
    expect(result.krwBalance).toBe(0);
  });

  it('null/undefined 입력 시 빈 결과를 반환한다', () => {
    expect(normalizeUpbitBalance(null).holdings).toHaveLength(0);
    expect(normalizeUpbitBalance(undefined).holdings).toHaveLength(0);
  });

  it('숫자 문자열을 올바르게 파싱한다', () => {
    const result = normalizeUpbitBalance(upbitBalanceFixture);
    const eth = result.holdings.find((h) => h.symbol === 'ETH');

    expect(eth!.balance).toBe(10);
    expect(eth!.lockedBalance).toBe(0);
    expect(eth!.avgBuyPrice).toBe(3000000);
  });
});

// ===== 시세 정규화 테스트 =====

describe('normalizeUpbitTicker', () => {
  it('시세 응답을 정규화된 형태로 변환한다', () => {
    const result = normalizeUpbitTicker(upbitTickerFixture);

    expect(result.exchange).toBe('upbit');
    expect(result.tickers).toHaveLength(2);
    expect(result.timestamp).toBeTypeOf('number');
  });

  it('마켓 코드에서 코인 심볼을 추출한다', () => {
    const result = normalizeUpbitTicker(upbitTickerFixture);

    expect(result.tickers[0].symbol).toBe('BTC');
    expect(result.tickers[1].symbol).toBe('ETH');
  });

  it('가격 정보를 올바르게 매핑한다', () => {
    const result = normalizeUpbitTicker(upbitTickerFixture);
    const btc = result.tickers[0];

    expect(btc.currentPrice).toBe(50500000);
    expect(btc.openPrice).toBe(49000000);
    expect(btc.highPrice).toBe(51000000);
    expect(btc.lowPrice).toBe(48500000);
    expect(btc.prevClosePrice).toBe(49500000);
  });

  it('변동률을 백분율(%)로 변환한다', () => {
    const result = normalizeUpbitTicker(upbitTickerFixture);
    const btc = result.tickers[0];

    // signed_change_rate 0.0202 -> 2.02%
    expect(btc.changeRate).toBeCloseTo(2.02, 2);
    expect(btc.changePrice).toBe(1000000);
  });

  it('거래량 정보를 올바르게 매핑한다', () => {
    const result = normalizeUpbitTicker(upbitTickerFixture);
    const btc = result.tickers[0];

    expect(btc.volume24h).toBe(5000);
    expect(btc.volumeAmount24h).toBe(250000000000);
  });

  it('빈 배열 입력 시 빈 결과를 반환한다', () => {
    const result = normalizeUpbitTicker([]);
    expect(result.tickers).toHaveLength(0);
  });

  it('배열이 아닌 입력 시 빈 결과를 반환한다', () => {
    const result = normalizeUpbitTicker('not-array');
    expect(result.tickers).toHaveLength(0);
  });
});

// ===== 호가 정규화 테스트 =====

describe('normalizeUpbitOrderbook', () => {
  it('호가 응답을 정규화된 형태로 변환한다', () => {
    const result = normalizeUpbitOrderbook(upbitOrderbookFixture);

    expect(result.exchange).toBe('upbit');
    expect(result.orderbook.symbol).toBe('BTC');
    expect(result.orderbook.exchange).toBe('upbit');
  });

  it('매도 호가(asks)를 낮은 가격순으로 정렬한다', () => {
    const result = normalizeUpbitOrderbook(upbitOrderbookFixture);
    const asks = result.orderbook.asks;

    expect(asks).toHaveLength(3);
    expect(asks[0].price).toBe(50100000);
    expect(asks[1].price).toBe(50200000);
    expect(asks[2].price).toBe(50300000);
  });

  it('매수 호가(bids)를 높은 가격순으로 정렬한다', () => {
    const result = normalizeUpbitOrderbook(upbitOrderbookFixture);
    const bids = result.orderbook.bids;

    expect(bids).toHaveLength(3);
    expect(bids[0].price).toBe(50000000);
    expect(bids[1].price).toBe(49900000);
    expect(bids[2].price).toBe(49800000);
  });

  it('수량을 올바르게 매핑한다', () => {
    const result = normalizeUpbitOrderbook(upbitOrderbookFixture);

    expect(result.orderbook.asks[0].quantity).toBe(1.0);
    expect(result.orderbook.bids[0].quantity).toBe(1.5);
  });

  it('빈 배열 입력 시 빈 호가를 반환한다', () => {
    const result = normalizeUpbitOrderbook([]);
    expect(result.orderbook.asks).toHaveLength(0);
    expect(result.orderbook.bids).toHaveLength(0);
  });

  it('orderbook_units가 없는 경우 빈 호가를 반환한다', () => {
    const result = normalizeUpbitOrderbook([{ market: 'KRW-BTC', timestamp: 0 }]);
    expect(result.orderbook.asks).toHaveLength(0);
    expect(result.orderbook.bids).toHaveLength(0);
  });
});

// ===== 주문 내역 정규화 테스트 =====

describe('normalizeUpbitOrderHistory', () => {
  it('주문 내역 응답을 정규화된 형태로 변환한다', () => {
    const result = normalizeUpbitOrderHistory(upbitOrdersFixture);

    expect(result.exchange).toBe('upbit');
    expect(result.orders).toHaveLength(4);
    expect(result.timestamp).toBeTypeOf('number');
  });

  it('주문 유형(bid/ask)을 buy/sell로 매핑한다', () => {
    const result = normalizeUpbitOrderHistory(upbitOrdersFixture);

    expect(result.orders[0].side).toBe('buy');  // bid -> buy
    expect(result.orders[1].side).toBe('sell'); // ask -> sell
  });

  it('완료된 주문 상태를 filled로 매핑한다', () => {
    const result = normalizeUpbitOrderHistory(upbitOrdersFixture);

    // order-001: state='done'
    expect(result.orders[0].status).toBe('filled');
  });

  it('대기 중인 주문 상태를 open으로 매핑한다', () => {
    const result = normalizeUpbitOrderHistory(upbitOrdersFixture);

    // order-002: state='wait', executedVolume=0
    expect(result.orders[1].status).toBe('open');
  });

  it('일부 체결된 주문을 partially_filled로 매핑한다', () => {
    const result = normalizeUpbitOrderHistory(upbitOrdersFixture);

    // order-003: state='wait', volume=5, executedVolume=2
    expect(result.orders[2].status).toBe('partially_filled');
    expect(result.orders[2].executedQuantity).toBe(2);
    expect(result.orders[2].quantity).toBe(5);
  });

  it('취소된 주문을 cancelled로 매핑한다', () => {
    const result = normalizeUpbitOrderHistory(upbitOrdersFixture);

    // order-004: state='cancel'
    expect(result.orders[3].status).toBe('cancelled');
  });

  it('마켓 코드에서 심볼과 통화를 추출한다', () => {
    const result = normalizeUpbitOrderHistory(upbitOrdersFixture);

    expect(result.orders[0].symbol).toBe('BTC');
    expect(result.orders[0].currency).toBe('KRW');
  });

  it('주문 시각을 Date 객체로 변환한다', () => {
    const result = normalizeUpbitOrderHistory(upbitOrdersFixture);

    expect(result.orders[0].orderedAt).toBeInstanceOf(Date);
  });

  it('빈 배열 입력 시 빈 결과를 반환한다', () => {
    const result = normalizeUpbitOrderHistory([]);
    expect(result.orders).toHaveLength(0);
  });

  it('배열이 아닌 입력 시 빈 결과를 반환한다', () => {
    const result = normalizeUpbitOrderHistory({ error: 'invalid' });
    expect(result.orders).toHaveLength(0);
  });
});
