/**
 * 청산 데이터 수집 서비스
 *
 * - Binance: WebSocket wss://fstream.binance.com/ws/!forceOrder@arr (실시간)
 * - Bybit: WebSocket wss://stream.bybit.com/v5/public/linear (실시간)
 * - OKX: REST /api/v5/public/liquidation-orders (5분 폴링)
 * - Gate.io: REST /api/v4/futures/usdt/liq_orders (5분 폴링)
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import WebSocket from 'ws';

import { LiquidationEntity } from './entities/liquidation.entity';

/** 폴링 간격 (5분) */
const POLL_INTERVAL_MS = 5 * 60 * 1000;

/** WebSocket 재연결 대기 (10초) */
const WS_RECONNECT_DELAY = 10_000;

@Injectable()
export class LiquidationCollectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LiquidationCollectorService.name);

  private binanceWs: WebSocket | null = null;
  private bybitWs: WebSocket | null = null;
  private isShuttingDown = false;

  /** 배치 인서트용 버퍼 */
  private buffer: LiquidationEntity[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(LiquidationEntity)
    private readonly liquidationRepo: Repository<LiquidationEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Liquidation collector 시작');
    this.connectBinanceWs();
    this.connectBybitWs();
    // 5초마다 버퍼 flush
    this.flushTimer = setInterval(() => this.flushBuffer(), 5000);
    // OKX/Gate 초기 폴링
    await this.pollOkxLiquidations();
    await this.pollGateLiquidations();
  }

  onModuleDestroy(): void {
    this.isShuttingDown = true;
    this.binanceWs?.close();
    this.bybitWs?.close();
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushBuffer();
  }

  // ===== Binance WebSocket =====

  private connectBinanceWs(): void {
    const url = 'wss://fstream.binance.com/ws/!forceOrder@arr';
    this.logger.log(`Binance Liquidation WS 연결: ${url}`);

    const ws = new WebSocket(url);

    ws.on('open', () => {
      this.logger.log('Binance Liquidation WS 연결됨');
    });

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        // Binance forceOrder: { e: "forceOrder", o: { s, S, o, f, q, p, ap, X, l, T } }
        const order = msg.o;
        if (!order) return;

        const symbol = this.normalizeSymbol(order.s);
        if (!symbol) return;

        const quantity = parseFloat(order.q) || 0;
        const price = parseFloat(order.ap) || parseFloat(order.p) || 0;

        this.addToBuffer({
          symbol,
          exchange: 'binance',
          side: order.S === 'SELL' ? 'SHORT' : 'LONG',
          quantity,
          price,
          usdValue: quantity * price,
          timestamp: order.T || Date.now(),
        });
      } catch {
        // 파싱 실패 무시
      }
    });

    ws.on('close', () => {
      this.logger.warn('Binance Liquidation WS 연결 끊김');
      if (!this.isShuttingDown) {
        setTimeout(() => this.connectBinanceWs(), WS_RECONNECT_DELAY);
      }
    });

    ws.on('error', (err) => {
      this.logger.error(`Binance Liquidation WS 에러: ${err.message}`);
    });

    this.binanceWs = ws;
  }

  // ===== Bybit WebSocket =====

  private connectBybitWs(): void {
    const url = 'wss://stream.bybit.com/v5/public/linear';
    this.logger.log(`Bybit Liquidation WS 연결: ${url}`);

    const ws = new WebSocket(url);

    ws.on('open', () => {
      this.logger.log('Bybit Liquidation WS 연결됨');
      // allLiquidation 토픽 구독
      ws.send(JSON.stringify({ op: 'subscribe', args: ['allLiquidation'] }));
    });

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.topic !== 'allLiquidation' || !msg.data) return;

        const d = msg.data;
        const symbol = this.normalizeSymbol(d.symbol);
        if (!symbol) return;

        const quantity = parseFloat(d.size) || 0;
        const price = parseFloat(d.price) || 0;

        this.addToBuffer({
          symbol,
          exchange: 'bybit',
          side: d.side === 'Sell' ? 'SHORT' : 'LONG',
          quantity,
          price,
          usdValue: quantity * price,
          timestamp: d.updatedTime || Date.now(),
        });
      } catch {
        // 파싱 실패 무시
      }
    });

    ws.on('close', () => {
      this.logger.warn('Bybit Liquidation WS 연결 끊김');
      if (!this.isShuttingDown) {
        setTimeout(() => this.connectBybitWs(), WS_RECONNECT_DELAY);
      }
    });

    ws.on('error', (err) => {
      this.logger.error(`Bybit Liquidation WS 에러: ${err.message}`);
    });

    this.bybitWs = ws;
  }

  // ===== OKX REST 폴링 =====

  @Interval('liquidation-poll-okx', POLL_INTERVAL_MS)
  async pollOkxLiquidations(): Promise<void> {
    try {
      const res = await fetch(
        'https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&limit=100',
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) return;
      const data = await res.json();

      if (data?.code !== '0' || !Array.isArray(data?.data)) return;

      for (const item of data.data) {
        const details = item.details;
        if (!Array.isArray(details)) continue;

        for (const d of details) {
          const instId = item.instId ?? '';
          const symbol = instId.split('-')[0];
          if (!symbol) continue;

          const quantity = parseFloat(d.sz) || 0;
          const price = parseFloat(d.bkPx) || 0;

          this.addToBuffer({
            symbol,
            exchange: 'okx',
            side: d.side === 'sell' ? 'SHORT' : 'LONG',
            quantity,
            price,
            usdValue: quantity * price,
            timestamp: parseInt(d.ts) || Date.now(),
          });
        }
      }
    } catch (err) {
      this.logger.error(`OKX liquidation poll 에러: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ===== Gate.io REST 폴링 =====

  @Interval('liquidation-poll-gate', POLL_INTERVAL_MS)
  async pollGateLiquidations(): Promise<void> {
    try {
      const res = await fetch(
        'https://api.gateio.ws/api/v4/futures/usdt/liq_orders?limit=100',
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) return;
      const data = await res.json();

      if (!Array.isArray(data)) return;

      for (const item of data) {
        const contract = item.contract ?? '';
        const symbol = contract.split('_')[0];
        if (!symbol) continue;

        const quantity = Math.abs(parseFloat(item.size)) || 0;
        const price = parseFloat(item.fill_price || item.order_price) || 0;

        this.addToBuffer({
          symbol,
          exchange: 'gate',
          side: parseFloat(item.size) < 0 ? 'SHORT' : 'LONG',
          quantity,
          price,
          usdValue: quantity * price,
          timestamp: (item.time ?? 0) * 1000 || Date.now(),
        });
      }
    } catch (err) {
      this.logger.error(`Gate liquidation poll 에러: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ===== 유틸리티 =====

  /** Binance/Bybit 심볼 정규화: BTCUSDT → BTC */
  private normalizeSymbol(rawSymbol: string): string | null {
    if (!rawSymbol) return null;
    if (rawSymbol.endsWith('USDT')) return rawSymbol.replace(/USDT$/, '');
    return null;
  }

  /** 버퍼에 청산 이벤트 추가 */
  private addToBuffer(data: Omit<LiquidationEntity, 'id'>): void {
    const entity = this.liquidationRepo.create(data);
    this.buffer.push(entity);
  }

  /** 버퍼를 DB에 일괄 저장 */
  private async flushBuffer(): Promise<void> {
    if (this.buffer.length === 0) return;

    const toInsert = [...this.buffer];
    this.buffer = [];

    try {
      await this.liquidationRepo.insert(toInsert);
      if (toInsert.length > 10) {
        this.logger.debug(`Liquidation ${toInsert.length}건 저장`);
      }
    } catch (err) {
      this.logger.error(`Liquidation 저장 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
