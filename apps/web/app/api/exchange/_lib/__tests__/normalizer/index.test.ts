/**
 * 응답 정규화 디스패치 함수 단위 테스트
 *
 * ExchangeType에 따라 올바른 거래소별 정규화 함수가 호출되는지,
 * 지원하지 않는 거래소 입력 시 오류가 발생하는지 검증한다.
 *
 * @see 요구사항 12.4 (응답 데이터 통일된 내부 데이터 모델 정규화)
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeBalance,
  normalizeTicker,
  normalizeOrderbook,
  normalizeOrderHistory,
} from '../../normalizer/index';

// ===== 최소 fixture 데이터 =====

const upbitBalanceFixture = [
  {
    currency: 'BTC',
    balance: '0.5',
    locked: '0',
    avg_buy_price: '50000000',
    avg_buy_price_modified: false,
    unit_currency: 'KRW',
  },
];

const bithumbBalanceFixture = [
  {
    currency: 'BTC',
    balance: '0.3',
    locked: '0',
    avg_buy_price: '50000000',
    avg_buy_price_modified: false,
    unit_currency: 'KRW',
  },
];

const coinoneBalanceFixture = {
  result: 'success',
  balances: [
    {
      currency: 'BTC',
      available: '0.2',
      limit: '0',
      average_price: '51000000',
    },
  ],
};

const upbitTickerFixture = [
  {
    market: 'KRW-BTC',
    trade_price: 50500000,
    opening_price: 49000000,
    high_price: 51000000,
    low_price: 48500000,
    prev_closing_price: 49500000,
    signed_change_rate: 0.02,
    signed_change_price: 1000000,
    acc_trade_volume_24h: 5000,
    acc_trade_price_24h: 250000000000,
    timestamp: 1746100800000,
  },
];

const bithumbTickerFixture = {
  status: '0000',
  data: {
    opening_price: '49000000',
    closing_price: '50500000',
    min_price: '48500000',
    max_price: '51000000',
    prev_closing_price: '49500000',
    units_traded: '3000',
    acc_trade_value: '150000000000',
    units_traded_24H: '5500',
    acc_trade_value_24H: '275000000000',
    fluctate_24H: '1000000',
    fluctate_rate_24H: '2.02',
    date: '1746100800000',
  },
};

const coinoneTickerFixture = {
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
  ],
};

// ===== normalizeBalance 디스패치 테스트 =====

describe('normalizeBalance', () => {
  it('업비트 응답을 올바르게 디스패치한다', () => {
    const result = normalizeBalance('upbit', upbitBalanceFixture);

    expect(result.exchange).toBe('upbit');
    expect(result.holdings).toHaveLength(1);
    expect(result.holdings[0].symbol).toBe('BTC');
  });

  it('빗썸 응답을 올바르게 디스패치한다', () => {
    const result = normalizeBalance('bithumb', bithumbBalanceFixture);

    expect(result.exchange).toBe('bithumb');
    expect(result.holdings).toHaveLength(1);
    expect(result.holdings[0].symbol).toBe('BTC');
  });

  it('코인원 응답을 올바르게 디스패치한다', () => {
    const result = normalizeBalance('coinone', coinoneBalanceFixture);

    expect(result.exchange).toBe('coinone');
    expect(result.holdings).toHaveLength(1);
    expect(result.holdings[0].symbol).toBe('BTC');
  });

  it('Gate.io 응답을 올바르게 디스패치한다', () => {
    const gateFixture = [
      { currency: 'BTC', available: '0.5', locked: '0' },
    ];
    const result = normalizeBalance('gate', gateFixture);

    expect(result.exchange).toBe('gate');
    expect(result.holdings).toHaveLength(1);
    expect(result.holdings[0].symbol).toBe('BTC');
  });

  it('Bitget 응답을 올바르게 디스패치한다', () => {
    const bitgetFixture = {
      code: '00000',
      msg: 'success',
      data: [{ coin: 'BTC', available: '0.5', frozen: '0', usdtValue: '40000' }],
    };
    const result = normalizeBalance('bitget', bitgetFixture);

    expect(result.exchange).toBe('bitget');
    expect(result.holdings).toHaveLength(1);
    expect(result.holdings[0].symbol).toBe('BTC');
  });

  it('하이퍼리퀴드 응답을 올바르게 디스패치한다', () => {
    const hyperliquidFixture = {
      perps: {
        marginSummary: {
          accountValue: '29780.01',
          totalNtlPos: '5000.0',
          totalRawUsd: '24780.01',
          totalMarginUsed: '2500.0',
        },
        crossMarginSummary: {
          accountValue: '29780.01',
          totalNtlPos: '5000.0',
          totalRawUsd: '24780.01',
          totalMarginUsed: '2500.0',
        },
        withdrawable: '22280.01',
        assetPositions: [],
        time: 1733968369395,
      },
      spot: {
        balances: [
          { coin: 'USDC', token: 0, total: '1000.22', hold: '0.0', entryNtl: '0.0' },
          { coin: 'PURR', token: 1, total: '500.0', hold: '0.0', entryNtl: '250.0' },
        ],
      },
    };
    const result = normalizeBalance('hyperliquid', hyperliquidFixture);

    expect(result.exchange).toBe('hyperliquid');
    expect(result.holdings.length).toBeGreaterThan(0);
    expect(result.walletSummary).toBeDefined();
  });

  it('지원하지 않는 거래소 입력 시 오류를 발생시킨다', () => {
    expect(() => {
      normalizeBalance('kraken' as never, {});
    }).toThrow('지원하지 않는 거래소입니다: kraken');
  });
});

// ===== normalizeTicker 디스패치 테스트 =====

describe('normalizeTicker', () => {
  it('업비트 응답을 올바르게 디스패치한다', () => {
    const result = normalizeTicker('upbit', upbitTickerFixture);

    expect(result.exchange).toBe('upbit');
    expect(result.tickers).toHaveLength(1);
    expect(result.tickers[0].symbol).toBe('BTC');
  });

  it('빗썸 응답을 올바르게 디스패치한다 (symbol 지정)', () => {
    const result = normalizeTicker('bithumb', bithumbTickerFixture, 'BTC');

    expect(result.exchange).toBe('bithumb');
    expect(result.tickers).toHaveLength(1);
    expect(result.tickers[0].symbol).toBe('BTC');
  });

  it('코인원 응답을 올바르게 디스패치한다', () => {
    const result = normalizeTicker('coinone', coinoneTickerFixture);

    expect(result.exchange).toBe('coinone');
    expect(result.tickers).toHaveLength(1);
    expect(result.tickers[0].symbol).toBe('BTC');
  });

  it('Gate.io 응답을 올바르게 디스패치한다', () => {
    const gateFixture = [
      {
        currency_pair: 'BTC_USDT',
        last: '80000',
        change_percentage: '2.5',
        base_volume: '1000',
        quote_volume: '80000000',
        high_24h: '81000',
        low_24h: '79000',
        lowest_ask: '80100',
        highest_bid: '79900',
      },
    ];
    const result = normalizeTicker('gate', gateFixture);

    expect(result.exchange).toBe('gate');
    expect(result.tickers).toHaveLength(1);
    expect(result.tickers[0].symbol).toBe('BTC');
  });

  it('Bitget 응답을 올바르게 디스패치한다', () => {
    const bitgetFixture = {
      code: '00000',
      msg: 'success',
      data: [
        {
          symbol: 'BTCUSDT',
          lastPr: '80000',
          high24h: '81000',
          low24h: '79000',
          open: '78000',
          change24h: '0.025',
          baseVolume: '1000',
          quoteVolume: '80000000',
        },
      ],
    };
    const result = normalizeTicker('bitget', bitgetFixture);

    expect(result.exchange).toBe('bitget');
    expect(result.tickers).toHaveLength(1);
    expect(result.tickers[0].symbol).toBe('BTC');
  });

  it('지원하지 않는 거래소 입력 시 오류를 발생시킨다', () => {
    expect(() => {
      normalizeTicker('kraken' as never, {});
    }).toThrow('지원하지 않는 거래소입니다: kraken');
  });
});

// ===== normalizeOrderbook 디스패치 테스트 =====

describe('normalizeOrderbook', () => {
  it('업비트 응답을 올바르게 디스패치한다', () => {
    const result = normalizeOrderbook('upbit', [
      {
        market: 'KRW-BTC',
        timestamp: 1746100800000,
        total_ask_size: 1.0,
        total_bid_size: 1.0,
        orderbook_units: [
          { ask_price: 50100000, bid_price: 50000000, ask_size: 1.0, bid_size: 1.0 },
        ],
      },
    ]);

    expect(result.exchange).toBe('upbit');
    expect(result.orderbook.symbol).toBe('BTC');
  });

  it('빗썸 응답을 올바르게 디스패치한다', () => {
    const result = normalizeOrderbook('bithumb', {
      status: '0000',
      data: {
        timestamp: '1746100800000',
        order_currency: 'BTC',
        payment_currency: 'KRW',
        asks: [{ price: '50100000', quantity: '1.0' }],
        bids: [{ price: '50000000', quantity: '1.0' }],
      },
    });

    expect(result.exchange).toBe('bithumb');
    expect(result.orderbook.symbol).toBe('BTC');
  });

  it('코인원 응답을 올바르게 디스패치한다', () => {
    const result = normalizeOrderbook('coinone', {
      result: 'success',
      target_currency: 'BTC',
      quote_currency: 'KRW',
      timestamp: 1746100800000,
      asks: [{ price: '50100000', qty: '1.0' }],
      bids: [{ price: '50000000', qty: '1.0' }],
    });

    expect(result.exchange).toBe('coinone');
    expect(result.orderbook.symbol).toBe('BTC');
  });

  it('지원하지 않는 거래소 입력 시 오류를 발생시킨다', () => {
    expect(() => {
      normalizeOrderbook('kraken' as never, {});
    }).toThrow('지원하지 않는 거래소입니다: kraken');
  });
});

// ===== normalizeOrderHistory 디스패치 테스트 =====

describe('normalizeOrderHistory', () => {
  it('업비트 응답을 올바르게 디스패치한다', () => {
    const result = normalizeOrderHistory('upbit', [
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
    ]);

    expect(result.exchange).toBe('upbit');
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0].side).toBe('buy');
  });

  it('빗썸 응답을 올바르게 디스패치한다', () => {
    const result = normalizeOrderHistory('bithumb', [
      {
        uuid: 'bithumb-001',
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
    ]);

    expect(result.exchange).toBe('bithumb');
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0].side).toBe('buy');
  });

  it('코인원 응답을 올바르게 디스패치한다', () => {
    const result = normalizeOrderHistory('coinone', {
      result: 'success',
      orders: [
        {
          order_id: 'coinone-001',
          target_currency: 'BTC',
          quote_currency: 'KRW',
          type: 'buy',
          price: '50000000',
          qty: '0.1',
          executed_qty: '0.1',
          status: 'filled',
          timestamp: '1746100800000',
        },
      ],
    });

    expect(result.exchange).toBe('coinone');
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0].side).toBe('buy');
  });

  it('지원하지 않는 거래소 입력 시 오류를 발생시킨다', () => {
    expect(() => {
      normalizeOrderHistory('kraken' as never, {});
    }).toThrow('지원하지 않는 거래소입니다: kraken');
  });
});
