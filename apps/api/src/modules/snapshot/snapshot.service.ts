/**
 * 포트폴리오 스냅샷 서비스
 *
 * 클라이언트가 대시보드 접속 시 전송한 포트폴리오 스냅샷을 DB에 저장하고,
 * 기간별/집계 조회 기능을 제공한다.
 * 서버에 API Key가 없으므로, 사용자 접속 시에만 스냅샷이 축적되는 구조이다.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PortfolioSnapshotEntity } from './entities/portfolio-snapshot.entity';
import { SnapshotHoldingEntity } from './entities/snapshot-holding.entity';
import { CreateSnapshotDto } from './dto/create-snapshot.dto';

import type { AggregationInterval } from '@bitscope/shared';

/**
 * 집계 간격별 MySQL DATE_FORMAT 패턴 화이트리스트
 *
 * SQL 쿼리에 문자열 보간으로 삽입되므로,
 * 안전한 값만 허용하는 화이트리스트로 관리한다.
 */
const DATE_FORMAT_BY_INTERVAL: Record<string, string> = {
  hourly: '%Y-%m-%d %H:00:00',
  daily: '%Y-%m-%d',
  weekly: '%x-W%v', // ISO 주차 기반 그룹화
  monthly: '%Y-%m',
};

/** 집계된 스냅샷 결과 타입 */
export interface AggregatedSnapshotResult {
  periodStart: Date;
  periodEnd: Date;
  avgTotalEvaluation: number;
  maxTotalEvaluation: number;
  minTotalEvaluation: number;
  snapshotCount: number;
}

@Injectable()
export class SnapshotService {
  private readonly logger = new Logger(SnapshotService.name);

  constructor(
    @InjectRepository(PortfolioSnapshotEntity)
    private readonly snapshotRepository: Repository<PortfolioSnapshotEntity>,
    @InjectRepository(SnapshotHoldingEntity)
    private readonly holdingRepository: Repository<SnapshotHoldingEntity>,
  ) {}

  /**
   * 포트폴리오 스냅샷을 DB에 저장한다.
   *
   * 클라이언트가 대시보드 접속 시 현재 포트폴리오 데이터를 전송하면
   * 이를 스냅샷으로 저장하여 이력 데이터를 축적한다.
   */
  async saveSnapshot(dto: CreateSnapshotDto): Promise<PortfolioSnapshotEntity> {
    this.logger.log(
      `스냅샷 저장 시작 - wallet: ${dto.walletAddress}, holdings: ${dto.holdings.length}개`,
    );

    // 스냅샷 엔티티 생성
    const snapshot = this.snapshotRepository.create({
      walletAddress: dto.walletAddress.toLowerCase(),
      totalEvaluation: dto.totalEvaluation,
      totalInvestment: dto.totalInvestment,
      totalProfitLoss: dto.totalProfitLoss,
      profitLossRate: dto.profitLossRate,
      holdings: dto.holdings.map((h) => {
        const holding = new SnapshotHoldingEntity();
        holding.symbol = h.symbol;
        holding.exchange = h.exchange;
        holding.balance = h.balance;
        holding.avgBuyPrice = h.avgBuyPrice;
        holding.currentPrice = h.currentPrice;
        holding.evaluation = h.evaluation;
        return holding;
      }),
    });

    // cascade: true 설정으로 holdings도 함께 저장됨
    const saved = await this.snapshotRepository.save(snapshot);

    this.logger.log(
      `스냅샷 저장 완료 - id: ${saved.id}, wallet: ${saved.walletAddress}`,
    );

    return saved;
  }

  /**
   * 기간별 스냅샷 목록을 조회한다.
   *
   * 시작/종료 시각이 지정되지 않으면 기본적으로 최근 30일 데이터를 반환한다.
   */
  async getSnapshots(
    walletAddress: string,
    start?: Date,
    end?: Date,
    limit?: number,
  ): Promise<PortfolioSnapshotEntity[]> {
    const normalizedAddress = walletAddress.toLowerCase();

    // 기본 기간: 최근 30일
    const effectiveEnd = end || new Date();
    const effectiveStart =
      start || new Date(effectiveEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

    const queryBuilder = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .leftJoinAndSelect('snapshot.holdings', 'holdings')
      .where('snapshot.walletAddress = :walletAddress', {
        walletAddress: normalizedAddress,
      })
      .andWhere('snapshot.createdAt >= :start', { start: effectiveStart })
      .andWhere('snapshot.createdAt <= :end', { end: effectiveEnd })
      .orderBy('snapshot.createdAt', 'DESC');

    if (limit && limit > 0) {
      queryBuilder.take(limit);
    }

    return queryBuilder.getMany();
  }

  /**
   * 특정 지갑 주소의 최신 스냅샷을 조회한다.
   */
  async getLatestSnapshot(
    walletAddress: string,
  ): Promise<PortfolioSnapshotEntity | null> {
    const normalizedAddress = walletAddress.toLowerCase();

    return this.snapshotRepository.findOne({
      where: { walletAddress: normalizedAddress },
      order: { createdAt: 'DESC' },
      relations: ['holdings'],
    });
  }

  /**
   * 스냅샷 데이터를 지정된 간격으로 집계하여 반환한다.
   *
   * 시계열 분석용으로, 시간/일/주/월 단위로 평균, 최대, 최소 평가금액을 산출한다.
   */
  async aggregateSnapshots(
    walletAddress: string,
    interval: AggregationInterval,
    start?: Date,
    end?: Date,
  ): Promise<AggregatedSnapshotResult[]> {
    const normalizedAddress = walletAddress.toLowerCase();

    // 기본 기간: 최근 30일
    const effectiveEnd = end || new Date();
    const effectiveStart =
      start || new Date(effectiveEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

    // MySQL의 DATE_FORMAT을 사용하여 간격별 그룹화
    // 안전한 화이트리스트 맵에서 DATE_FORMAT 패턴을 조회한다.
    // 문자열 보간을 통한 SQL 인젝션을 방지하기 위해
    // 반드시 허용된 포맷만 사용해야 한다.
    const dateFormat = DATE_FORMAT_BY_INTERVAL[interval] ?? DATE_FORMAT_BY_INTERVAL.daily;

    const results = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select([
        `DATE_FORMAT(snapshot.created_at, '${dateFormat}') as period_key`,
        `MIN(snapshot.created_at) as period_start`,
        `MAX(snapshot.created_at) as period_end`,
        `AVG(snapshot.total_evaluation) as avg_total_evaluation`,
        `MAX(snapshot.total_evaluation) as max_total_evaluation`,
        `MIN(snapshot.total_evaluation) as min_total_evaluation`,
        `COUNT(*) as snapshot_count`,
      ])
      .where('snapshot.wallet_address = :walletAddress', {
        walletAddress: normalizedAddress,
      })
      .andWhere('snapshot.created_at >= :start', { start: effectiveStart })
      .andWhere('snapshot.created_at <= :end', { end: effectiveEnd })
      .groupBy('period_key')
      .orderBy('period_key', 'ASC')
      .getRawMany();

    return results.map((row) => ({
      periodStart: new Date(row.period_start),
      periodEnd: new Date(row.period_end),
      avgTotalEvaluation: parseFloat(row.avg_total_evaluation) || 0,
      maxTotalEvaluation: parseFloat(row.max_total_evaluation) || 0,
      minTotalEvaluation: parseFloat(row.min_total_evaluation) || 0,
      snapshotCount: parseInt(row.snapshot_count, 10) || 0,
    }));
  }
}
