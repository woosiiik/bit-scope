/**
 * 고래 알림 서비스
 *
 * 대량 암호화폐 이체를 감지하여 제공한다.
 * Whale Alert API (무료 티어) 또는 바이낸스 대량 거래 감시를 사용한다.
 *
 * Whale Alert 무료: API Key 필요, 하루 100건
 * API Key 없으면 바이낸스 대량 거래(aggTrades)에서 대형 거래를 추출한다.
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

const COLLECT_INTERVAL_MS = 5 * 60 * 1000; // 5분
const WHALE_THRESHOLD_USD = 100_000; // $100K 이상

/** 바이낸스 최근 대량 거래 조회용 심볼 */
const WATCH_SYMBOLS = ['BTCUSDT', 'ETHUSDT'];

@Injectable()
export class WhaleAlertService implements OnModuleInit {
  private readonly logger = new Logger(WhaleAlertService.name);
  private transactions: WhaleTransaction[] = [];
  private readonly whaleAlertApiKey: string | null;

  constructor() {
    this.whaleAlertApiKey = process.env.WHALE_ALERT_API_KEY ?? null;
  }

  async onModuleInit(): Promise<void> {
    await this.collect();
  }

  @Interval('whale-alert-collect', COLLECT_INTERVAL_MS)
  async collect(): Promise<void> {
    try {
      if (this.whaleAlertApiKey) {
        await this.collectFromWhaleAlert();
      } else {
        await this.collectFromBinance();
      }
    } catch (error) {
      this.logger.warn(`고래 알림 수집 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Whale Alert API에서 수집 (API Key 있을 때)
   */
  private async collectFromWhaleAlert(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const start = now - 3600; // 최근 1시간

    const res = await fetch(
      `https://api.whale-alert.io/v1/transactions?api_key=${this.whaleAlertApiKey}&min_value=${WHALE_THRESHOLD_USD}&start=${start}&limit=50`,
      { signal: AbortSignal.timeout(15_000) },
    );

    if (!res.ok) {
      this.logger.warn(`Whale Alert API 오류: ${res.status}`);
      return;
    }

    const json = await res.json() as {
      transactions?: Array<{
        id: string;
        symbol: string;
        amount: number;
        amount_usd: number;
        from: { owner: string; owner_type: string };
        to: { owner: string; owner_type: string };
        timestamp: number;
        transaction_type: string;
      }>;
    };

    this.transactions = (json.transactions ?? []).map((tx) => ({
      id: tx.id,
      symbol: tx.symbol.toUpperCase(),
      amount: tx.amount,
      amountUsd: tx.amount_usd,
      from: tx.from.owner_type === 'exchange' ? tx.from.owner : 'unknown',
      to: tx.to.owner_type === 'exchange' ? tx.to.owner : 'unknown',
      timestamp: tx.timestamp * 1000,
      type: this.classifyTransaction(tx.from.owner_type, tx.to.owner_type),
    })).slice(0, 50);

    this.logger.log(`Whale Alert 수집 완료: ${this.transactions.length}건`);
  }

  /**
   * 바이낸스 대량 거래에서 수집 (API Key 없을 때)
   */
  private async collectFromBinance(): Promise<void> {
    const newTransactions: WhaleTransaction[] = [];

    for (const symbol of WATCH_SYMBOLS) {
      try {
        const res = await fetch(
          `https://fapi.binance.com/fapi/v1/trades?symbol=${symbol}&limit=100`,
          { signal: AbortSignal.timeout(10_000) },
        );

        if (!res.ok) continue;

        const trades = await res.json() as Array<{
          id: number;
          price: string;
          qty: string;
          quoteQty: string;
          time: number;
          isBuyerMaker: boolean;
        }>;

        const coinName = symbol.replace('USDT', '');

        for (const trade of trades) {
          const quoteQty = parseFloat(trade.quoteQty);
          if (quoteQty >= WHALE_THRESHOLD_USD) {
            newTransactions.push({
              id: `binance-${trade.id}`,
              symbol: coinName,
              amount: parseFloat(trade.qty),
              amountUsd: quoteQty,
              from: trade.isBuyerMaker ? 'Seller' : 'Buyer',
              to: trade.isBuyerMaker ? 'Buyer' : 'Seller',
              timestamp: trade.time,
              type: 'large_trade',
            });
          }
        }
      } catch {
        // 개별 심볼 실패 무시
      }
    }

    if (newTransactions.length > 0) {
      this.transactions = newTransactions
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 50);
      this.logger.log(`바이낸스 대량 거래 수집: ${this.transactions.length}건`);
    }
  }

  private classifyTransaction(fromType: string, toType: string): WhaleTransaction['type'] {
    if (fromType === 'exchange' && toType !== 'exchange') return 'exchange_withdrawal';
    if (fromType !== 'exchange' && toType === 'exchange') return 'exchange_deposit';
    return 'transfer';
  }

  getData(): WhaleTransaction[] {
    return this.transactions;
  }
}
