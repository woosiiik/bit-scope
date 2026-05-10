/**
 * 고래 알림 서비스
 *
 * 3가지 소스에서 대량 거래/이체를 감지한다:
 * 1. 바이낸스 Spot/Futures 대량 거래 (무료, 키 불필요)
 * 2. mempool.space - 거래소 핫월렛 BTC 입출금 (무료, 키 불필요)
 * 3. Whale Alert API (유료, 키 있을 때만)
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

export interface WhaleTransaction {
  id: string;
  symbol: string;
  amount: number;
  amountUsd: number;
  from: string;
  to: string;
  timestamp: number;
  type: 'transfer' | 'exchange_deposit' | 'exchange_withdrawal' | 'large_trade';
}

const COLLECT_INTERVAL_MS = 5 * 60 * 1000;
const BINANCE_THRESHOLD_USD = 50_000;
const BTC_WHALE_THRESHOLD = 5; // 5 BTC 이상

/** 바이낸스 거래 심볼 */
const WATCH_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];

/** 주요 거래소 BTC 핫월렛 주소 (공개 정보) */
const EXCHANGE_WALLETS: Record<string, string> = {
  // Binance
  '34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo': 'Binance',
  'bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h': 'Binance',
  '3M219KR5vEneNb47ewrPfWyb5jQ2DjxRP6': 'Binance',
  // Coinbase
  '3Kzh9qAqVWQhEsfQz7zEQL1EuSx5tyNLNS': 'Coinbase',
  'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh': 'Coinbase',
  // Kraken
  '3FupZp77ySr7jwoLYEJ9mwzJpvoNBXsBnE': 'Kraken',
  'bc1qw5f2fkm6q7kgvv7a3t9k8s8yp7f6a5s6c3j2qx': 'Kraken',
  // Bitfinex
  '3D2oetdNuZUqQHPJmcMDDHYoqkyNVsFk9r': 'Bitfinex',
  'bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97': 'Bitfinex',
};

@Injectable()
export class WhaleAlertService implements OnModuleInit {
  private readonly logger = new Logger(WhaleAlertService.name);
  private transactions: WhaleTransaction[] = [];
  private readonly whaleAlertApiKey: string | null;

  /** BTC/USD 대략적 가격 (mempool에서 USD 환산용) */
  private btcPrice = 100_000;

  constructor() {
    this.whaleAlertApiKey = process.env.WHALE_ALERT_API_KEY ?? null;
  }

  async onModuleInit(): Promise<void> {
    setTimeout(() => this.collect(), 15_000);
  }

  @Interval('whale-alert-collect', COLLECT_INTERVAL_MS)
  async collect(): Promise<void> {
    try {
      // BTC 가격 갱신
      await this.updateBtcPrice();

      const results = await Promise.allSettled([
        this.collectFromBinance(),
        this.collectFromMempool(),
        ...(this.whaleAlertApiKey ? [this.collectFromWhaleAlert()] : []),
      ]);

      const allTxs: WhaleTransaction[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          allTxs.push(...result.value);
        }
      }

      if (allTxs.length > 0) {
        // 기존 + 신규 병합, 중복 제거, 최신순 정렬
        const existingIds = new Set(this.transactions.map((t) => t.id));
        const newTxs = allTxs.filter((t) => !existingIds.has(t.id));
        this.transactions = [...newTxs, ...this.transactions]
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 100);
        this.logger.log(`고래 알림 수집 완료: 신규 ${newTxs.length}건, 총 ${this.transactions.length}건`);
      }
    } catch (error) {
      this.logger.warn(`고래 알림 수집 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** BTC 가격 업데이트 */
  private async updateBtcPrice(): Promise<void> {
    try {
      const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', {
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) {
        const data = await res.json() as { price: string };
        this.btcPrice = parseFloat(data.price) || 100_000;
      }
    } catch { /* 실패 시 기존 가격 유지 */ }
  }

  /** Whale Alert API (키 있을 때) */
  private async collectFromWhaleAlert(): Promise<WhaleTransaction[]> {
    const now = Math.floor(Date.now() / 1000);
    const start = now - 3600;

    const res = await fetch(
      `https://api.whale-alert.io/v1/transactions?api_key=${this.whaleAlertApiKey}&min_value=${BINANCE_THRESHOLD_USD}&start=${start}&limit=50`,
      { signal: AbortSignal.timeout(15_000) },
    );

    if (!res.ok) return [];

    const json = await res.json() as {
      transactions?: Array<{
        id: string; symbol: string; amount: number; amount_usd: number;
        from: { owner: string; owner_type: string };
        to: { owner: string; owner_type: string };
        timestamp: number;
      }>;
    };

    return (json.transactions ?? []).map((tx) => ({
      id: `wa-${tx.id}`,
      symbol: tx.symbol.toUpperCase(),
      amount: tx.amount,
      amountUsd: tx.amount_usd,
      from: tx.from.owner_type === 'exchange' ? tx.from.owner : 'Unknown Wallet',
      to: tx.to.owner_type === 'exchange' ? tx.to.owner : 'Unknown Wallet',
      timestamp: tx.timestamp * 1000,
      type: this.classifyWalletType(tx.from.owner_type, tx.to.owner_type),
    }));
  }

  /** 바이낸스 Spot+Futures 대량 거래 */
  private async collectFromBinance(): Promise<WhaleTransaction[]> {
    const txs: WhaleTransaction[] = [];

    const endpoints = [
      { base: 'https://fapi.binance.com/fapi/v1/trades', market: 'Futures' },
      { base: 'https://api.binance.com/api/v3/trades', market: 'Spot' },
    ];

    for (const { base, market } of endpoints) {
      for (const symbol of WATCH_SYMBOLS) {
        try {
          const res = await fetch(`${base}?symbol=${symbol}&limit=50`, {
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) continue;

          const trades = await res.json() as Array<{
            id: number; price: string; qty: string; quoteQty: string; time: number; isBuyerMaker: boolean;
          }>;

          const coinName = symbol.replace('USDT', '');

          for (const trade of trades) {
            const quoteQty = parseFloat(trade.quoteQty);
            if (quoteQty >= BINANCE_THRESHOLD_USD) {
              txs.push({
                id: `bn-${market}-${trade.id}`,
                symbol: coinName,
                amount: parseFloat(trade.qty),
                amountUsd: quoteQty,
                from: trade.isBuyerMaker ? `${market} Seller` : `${market} Buyer`,
                to: trade.isBuyerMaker ? `${market} Buyer` : `${market} Seller`,
                timestamp: trade.time,
                type: 'large_trade',
              });
            }
          }
        } catch { /* */ }
      }
    }

    return txs;
  }

  /** mempool.space - 거래소 핫월렛 BTC 입출금 감지 */
  private async collectFromMempool(): Promise<WhaleTransaction[]> {
    const txs: WhaleTransaction[] = [];
    const walletEntries = Object.entries(EXCHANGE_WALLETS);

    // 주요 거래소 핫월렛 3개만 조회 (Rate Limit 고려)
    for (const [address, exchangeName] of walletEntries.slice(0, 3)) {
      try {
        const res = await fetch(`https://mempool.space/api/address/${address}/txs`, {
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) continue;

        const mempoolTxs = await res.json() as Array<{
          txid: string;
          status: { block_time?: number; confirmed: boolean };
          vin: Array<{ prevout: { scriptpubkey_address?: string; value: number } }>;
          vout: Array<{ scriptpubkey_address?: string; value: number }>;
        }>;

        // 최근 10개 트랜잭션만
        for (const tx of mempoolTxs.slice(0, 10)) {
          const totalOut = tx.vout.reduce((s, o) => s + o.value, 0) / 1e8;

          if (totalOut < BTC_WHALE_THRESHOLD) continue;

          // 입금인지 출금인지 판별
          const isDeposit = tx.vout.some((o) => o.scriptpubkey_address === address);
          const isWithdrawal = tx.vin.some((v) => v.prevout?.scriptpubkey_address === address);

          let type: WhaleTransaction['type'] = 'transfer';
          let from = 'Unknown';
          let to = 'Unknown';

          if (isWithdrawal) {
            type = 'exchange_withdrawal';
            from = exchangeName;
            to = 'External Wallet';
          } else if (isDeposit) {
            type = 'exchange_deposit';
            from = 'External Wallet';
            to = exchangeName;
          }

          txs.push({
            id: `mp-${tx.txid.slice(0, 12)}`,
            symbol: 'BTC',
            amount: totalOut,
            amountUsd: totalOut * this.btcPrice,
            from,
            to,
            timestamp: (tx.status.block_time ?? Math.floor(Date.now() / 1000)) * 1000,
            type,
          });
        }
      } catch { /* */ }
    }

    return txs;
  }

  private classifyWalletType(fromType: string, toType: string): WhaleTransaction['type'] {
    if (fromType === 'exchange' && toType !== 'exchange') return 'exchange_withdrawal';
    if (fromType !== 'exchange' && toType === 'exchange') return 'exchange_deposit';
    return 'transfer';
  }

  getData(): WhaleTransaction[] {
    return this.transactions;
  }
}
