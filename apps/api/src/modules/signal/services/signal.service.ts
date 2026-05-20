/**
 * 시그널 서비스
 *
 * 시그널 데이터 CRUD, 중복 체크, 코인별 최신 시그널 집계를 담당한다.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SignalEntity } from '../entities/signal.entity';
import type { ParsedSignal } from './signal-parser.service';

@Injectable()
export class SignalService {
  private readonly logger = new Logger(SignalService.name);

  constructor(
    @InjectRepository(SignalEntity)
    private readonly signalRepo: Repository<SignalEntity>,
  ) {}

  /**
   * 여러 시그널을 일괄 저장한다 (중복 체크).
   */
  async saveSignals(signals: ParsedSignal[]): Promise<number> {
    let savedCount = 0;

    for (const signal of signals) {
      const exists = await this.signalRepo.findOne({
        where: {
          telegramMessageId: signal.telegramMessageId,
          coinSymbol: signal.coinSymbol,
        },
      });

      if (exists) continue;

      await this.signalRepo.save(
        this.signalRepo.create({
          coinSymbol: signal.coinSymbol,
          direction: signal.direction,
          signalType: signal.signalType,
          sectionName: signal.sectionName,
          telegramMessageId: signal.telegramMessageId,
          signalAt: signal.signalAt,
          rawMessage: signal.rawMessage,
        }),
      );
      savedCount++;
    }

    return savedCount;
  }

  /**
   * 시그널 목록을 페이지네이션으로 조회한다.
   */
  async getSignalList(page: number, limit: number): Promise<{
    items: SignalEntity[];
    total: number;
    page: number;
    limit: number;
  }> {
    const [items, total] = await this.signalRepo.findAndCount({
      order: { signalAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total, page, limit };
  }

  /**
   * 특정 코인의 시그널 이력을 반환한다.
   */
  async getSignalsByCoin(coinSymbol: string, limit: number = 200): Promise<SignalEntity[]> {
    return this.signalRepo.find({
      where: { coinSymbol },
      order: { signalAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * 코인별 최신 시그널을 반환한다.
   */
  async getLatestByCoins(): Promise<Array<{
    coinSymbol: string;
    direction: 'LONG' | 'SHORT';
    signalType: string;
    sectionName: string | null;
    signalAt: Date;
  }>> {
    const rows = await this.signalRepo.query(`
      SELECT s.coin_symbol, s.direction, s.signal_type, s.section_name, s.signal_at
      FROM t_signal s
      INNER JOIN (
        SELECT coin_symbol, MAX(signal_at) AS max_at
        FROM t_signal
        GROUP BY coin_symbol
      ) latest ON s.coin_symbol = latest.coin_symbol AND s.signal_at = latest.max_at
      ORDER BY s.signal_at DESC
    `);

    return rows.map((r: any) => ({
      coinSymbol: r.coin_symbol,
      direction: r.direction,
      signalType: r.signal_type,
      sectionName: r.section_name,
      signalAt: r.signal_at,
    }));
  }
}
