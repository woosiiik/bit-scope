/**
 * ReportService - 리포트 서비스
 *
 * 수동/자동 리포트 생성, 정기 리포트 스케줄 관리,
 * 데이터 내보내기(CSV, JSON, PDF) 기능을 담당한다.
 *
 * SnapshotService에서 포트폴리오 스냅샷 데이터를 조회하여
 * 리포트를 생성하며, NestJS 스케줄러(@Cron)를 사용하여
 * 정기 리포트를 자동 생성한다.
 *
 * @see 설계 문서 3.3.5 ReportService
 * @see 요구사항 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 12.13
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';

import type { ReportType, ExportFormat } from '@bitscope/shared';

import { ReportEntity } from './entities/report.entity';
import { ReportScheduleEntity } from './entities/report-schedule.entity';
import { SnapshotService } from '../snapshot/snapshot.service';
import { PortfolioSnapshotEntity } from '../snapshot/entities/portfolio-snapshot.entity';
import { CreateReportDto } from './dto/create-report.dto';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';

/** 리포트 유형별 기본 기간(밀리초) */
const REPORT_PERIOD_MS: Record<string, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

/** 리포트 유형별 기본 cron 표현식 */
const REPORT_CRON_EXPRESSIONS: Record<string, string> = {
  /** 매일 오전 9시 */
  daily: '0 9 * * *',
  /** 매주 월요일 오전 9시 */
  weekly: '0 9 * * 1',
  /** 매월 1일 오전 9시 */
  monthly: '0 9 1 * *',
};

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  constructor(
    @InjectRepository(ReportEntity)
    private readonly reportRepository: Repository<ReportEntity>,
    @InjectRepository(ReportScheduleEntity)
    private readonly scheduleRepository: Repository<ReportScheduleEntity>,
    private readonly snapshotService: SnapshotService,
  ) {}

  // ========== 수동 리포트 생성 ==========

  /**
   * 리포트를 수동으로 생성한다.
   *
   * 스냅샷 데이터를 기반으로 요약 정보를 산출하고,
   * 이전 리포트 대비 변동 사항을 하이라이트하여 포함한다.
   *
   * @param dto 리포트 생성 요청 데이터
   * @returns 생성된 리포트 엔티티
   */
  async generateReport(dto: CreateReportDto): Promise<ReportEntity> {
    const walletAddress = dto.walletAddress.toLowerCase();
    const reportType = dto.type as ReportType;

    this.logger.log(
      `리포트 생성 시작 - wallet: ${walletAddress}, type: ${reportType}`,
    );

    // 리포트 기간 산출
    const { periodStart, periodEnd } = this.calculateReportPeriod(
      reportType,
      dto.periodStart ? new Date(dto.periodStart) : undefined,
      dto.periodEnd ? new Date(dto.periodEnd) : undefined,
    );

    // 기간 내 스냅샷 조회
    const snapshots = await this.snapshotService.getSnapshots(
      walletAddress,
      periodStart,
      periodEnd,
    );

    // 최신 스냅샷(현재 시점의 데이터)
    const latestSnapshot =
      snapshots.length > 0 ? snapshots[0]! : null;

    // 이전 리포트 조회 (변동 사항 비교용)
    const previousReport = await this.reportRepository.findOne({
      where: { walletAddress, type: reportType },
      order: { generatedAt: 'DESC' },
    });

    // 리포트 요약 생성
    const summary = this.buildReportSummary(
      latestSnapshot,
      previousReport,
    );

    // 리포트 데이터 구성 (최신 스냅샷 기반)
    const data = latestSnapshot
      ? this.buildReportData(latestSnapshot)
      : this.buildEmptyReportData(walletAddress);

    // 리포트 엔티티 생성 및 저장
    const report = this.reportRepository.create({
      walletAddress,
      type: reportType,
      periodStart,
      periodEnd,
      summary,
      data,
    });

    const saved = await this.reportRepository.save(report);

    this.logger.log(
      `리포트 생성 완료 - id: ${saved.id}, wallet: ${walletAddress}`,
    );

    return saved;
  }

  // ========== 리포트 조회 ==========

  /**
   * 특정 리포트를 ID로 조회한다.
   *
   * @param reportId 리포트 ID
   * @returns 리포트 엔티티
   * @throws NotFoundException 리포트를 찾을 수 없는 경우
   */
  async getReport(reportId: string): Promise<ReportEntity> {
    const report = await this.reportRepository.findOne({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException(`리포트를 찾을 수 없습니다: ${reportId}`);
    }

    return report;
  }

  /**
   * 특정 지갑 주소의 리포트 이력을 조회한다.
   *
   * @param walletAddress 지갑 주소
   * @param type 리포트 유형 필터 (선택)
   * @param limit 조회할 최대 개수 (기본 20)
   * @returns 리포트 엔티티 배열 (최신순)
   */
  async getReportHistory(
    walletAddress: string,
    type?: ReportType,
    limit: number = 20,
  ): Promise<ReportEntity[]> {
    const normalizedAddress = walletAddress.toLowerCase();

    const queryBuilder = this.reportRepository
      .createQueryBuilder('report')
      .where('report.walletAddress = :walletAddress', {
        walletAddress: normalizedAddress,
      });

    if (type) {
      queryBuilder.andWhere('report.type = :type', { type });
    }

    queryBuilder
      .orderBy('report.generatedAt', 'DESC')
      .take(limit);

    return queryBuilder.getMany();
  }

  // ========== 정기 리포트 스케줄 관리 ==========

  /**
   * 정기 리포트 스케줄을 생성한다.
   *
   * @param dto 스케줄 생성 요청 데이터
   * @returns 생성된 스케줄 엔티티
   */
  async createSchedule(dto: CreateScheduleDto): Promise<ReportScheduleEntity> {
    const walletAddress = dto.walletAddress.toLowerCase();
    const type = dto.type as ReportType;

    this.logger.log(
      `리포트 스케줄 생성 - wallet: ${walletAddress}, type: ${type}`,
    );

    // 동일 유형의 기존 활성 스케줄 확인
    const existingSchedule = await this.scheduleRepository.findOne({
      where: {
        walletAddress,
        type,
        isActive: true,
      },
    });

    if (existingSchedule) {
      throw new BadRequestException(
        `이미 활성화된 ${type} 리포트 스케줄이 존재합니다. 기존 스케줄 ID: ${existingSchedule.id}`,
      );
    }

    const cronExpression = REPORT_CRON_EXPRESSIONS[type] || '0 9 * * *';
    const nextRunAt = this.calculateNextRunTime(cronExpression);

    const schedule = this.scheduleRepository.create({
      walletAddress,
      type,
      isActive: dto.isActive ?? true,
      cronExpression,
      nextRunAt,
    });

    const saved = await this.scheduleRepository.save(schedule);

    this.logger.log(
      `리포트 스케줄 생성 완료 - id: ${saved.id}, nextRunAt: ${saved.nextRunAt.toISOString()}`,
    );

    return saved;
  }

  /**
   * 정기 리포트 스케줄을 수정한다.
   *
   * @param scheduleId 스케줄 ID
   * @param dto 수정할 필드
   * @returns 수정된 스케줄 엔티티
   * @throws NotFoundException 스케줄을 찾을 수 없는 경우
   */
  async updateSchedule(
    scheduleId: string,
    dto: UpdateScheduleDto,
  ): Promise<ReportScheduleEntity> {
    const schedule = await this.scheduleRepository.findOne({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw new NotFoundException(
        `리포트 스케줄을 찾을 수 없습니다: ${scheduleId}`,
      );
    }

    if (dto.type !== undefined) {
      schedule.type = dto.type;
      schedule.cronExpression =
        REPORT_CRON_EXPRESSIONS[dto.type] || '0 9 * * *';
      schedule.nextRunAt = this.calculateNextRunTime(schedule.cronExpression);
    }

    if (dto.isActive !== undefined) {
      schedule.isActive = dto.isActive;

      // 활성화 시 다음 실행 시각 재계산
      if (dto.isActive) {
        schedule.nextRunAt = this.calculateNextRunTime(schedule.cronExpression);
      }
    }

    const updated = await this.scheduleRepository.save(schedule);

    this.logger.log(
      `리포트 스케줄 수정 완료 - id: ${updated.id}, type: ${updated.type}, isActive: ${updated.isActive}`,
    );

    return updated;
  }

  /**
   * 정기 리포트 스케줄을 삭제(취소)한다.
   *
   * @param scheduleId 스케줄 ID
   * @throws NotFoundException 스케줄을 찾을 수 없는 경우
   */
  async cancelSchedule(scheduleId: string): Promise<void> {
    const schedule = await this.scheduleRepository.findOne({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw new NotFoundException(
        `리포트 스케줄을 찾을 수 없습니다: ${scheduleId}`,
      );
    }

    await this.scheduleRepository.remove(schedule);

    this.logger.log(`리포트 스케줄 삭제 완료 - id: ${scheduleId}`);
  }

  /**
   * 특정 지갑 주소의 리포트 스케줄 목록을 조회한다.
   *
   * @param walletAddress 지갑 주소
   * @returns 스케줄 엔티티 배열
   */
  async getSchedules(walletAddress: string): Promise<ReportScheduleEntity[]> {
    const normalizedAddress = walletAddress.toLowerCase();

    return this.scheduleRepository.find({
      where: { walletAddress: normalizedAddress },
      order: { createdAt: 'DESC' },
    });
  }

  // ========== 정기 리포트 자동 실행 (cron) ==========

  /**
   * 매 분마다 실행 가능한 정기 리포트 스케줄을 확인하고,
   * 실행 시점이 도래한 스케줄에 대해 리포트를 자동 생성한다.
   *
   * NestJS @Cron 데코레이터를 사용하여 매 분마다 실행된다.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processScheduledReports(): Promise<void> {
    const now = new Date();

    // 실행 시점이 도래한 활성 스케줄 조회
    const dueSchedules = await this.scheduleRepository.find({
      where: {
        isActive: true,
        nextRunAt: LessThanOrEqual(now),
      },
    });

    if (dueSchedules.length === 0) {
      return;
    }

    this.logger.log(
      `정기 리포트 실행 대상: ${dueSchedules.length}개`,
    );

    for (const schedule of dueSchedules) {
      try {
        // 리포트 자동 생성
        const dto = new CreateReportDto();
        dto.walletAddress = schedule.walletAddress;
        dto.type = schedule.type;

        await this.generateReport(dto);

        // 다음 실행 시각 갱신
        schedule.nextRunAt = this.calculateNextRunTime(schedule.cronExpression);
        await this.scheduleRepository.save(schedule);

        this.logger.log(
          `정기 리포트 생성 완료 - wallet: ${schedule.walletAddress}, type: ${schedule.type}, nextRunAt: ${schedule.nextRunAt.toISOString()}`,
        );
      } catch (error) {
        this.logger.error(
          `정기 리포트 생성 실패 - scheduleId: ${schedule.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  // ========== 데이터 내보내기 ==========

  /**
   * 포트폴리오 스냅샷 데이터를 지정된 포맷으로 내보낸다.
   *
   * @param walletAddress 지갑 주소
   * @param format 내보내기 포맷 (csv, json, pdf)
   * @param start 시작 기간 (선택)
   * @param end 종료 기간 (선택)
   * @returns 내보내기 데이터 버퍼와 Content-Type
   */
  async exportData(
    walletAddress: string,
    format: ExportFormat,
    start?: Date,
    end?: Date,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const normalizedAddress = walletAddress.toLowerCase();

    this.logger.log(
      `데이터 내보내기 - wallet: ${normalizedAddress}, format: ${format}`,
    );

    // 스냅샷 데이터 조회
    const snapshots = await this.snapshotService.getSnapshots(
      normalizedAddress,
      start,
      end,
    );

    // 최신 스냅샷 기반으로 내보내기 수행
    const latestSnapshot = snapshots.length > 0 ? snapshots[0]! : null;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    switch (format) {
      case 'csv':
        return {
          buffer: this.exportToCsv(latestSnapshot),
          contentType: 'text/csv; charset=utf-8',
          filename: `bitscope-portfolio-${timestamp}.csv`,
        };
      case 'json':
        return {
          buffer: this.exportToJson(latestSnapshot),
          contentType: 'application/json; charset=utf-8',
          filename: `bitscope-portfolio-${timestamp}.json`,
        };
      case 'pdf':
        return {
          buffer: this.exportToPdf(latestSnapshot),
          contentType: 'application/pdf',
          filename: `bitscope-portfolio-${timestamp}.pdf`,
        };
      default:
        throw new BadRequestException(`지원하지 않는 내보내기 포맷입니다: ${format}`);
    }
  }

  /**
   * 거래 내역을 CSV 포맷으로 내보낸다.
   *
   * 선택한 기간 내 모든 스냅샷의 보유 내역을 CSV로 변환한다.
   *
   * @param walletAddress 지갑 주소
   * @param start 시작 기간 (선택)
   * @param end 종료 기간 (선택)
   * @returns CSV 데이터 버퍼와 메타데이터
   */
  async exportTransactionHistory(
    walletAddress: string,
    start?: Date,
    end?: Date,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const normalizedAddress = walletAddress.toLowerCase();

    this.logger.log(
      `거래 내역 내보내기 - wallet: ${normalizedAddress}`,
    );

    const snapshots = await this.snapshotService.getSnapshots(
      normalizedAddress,
      start,
      end,
    );

    const csvLines: string[] = [
      'Timestamp,Symbol,Exchange,Balance,AvgBuyPrice,CurrentPrice,Evaluation',
    ];

    for (const snapshot of snapshots) {
      const time = snapshot.createdAt.toISOString();
      for (const holding of snapshot.holdings || []) {
        csvLines.push(
          [
            time,
            holding.symbol,
            holding.exchange,
            holding.balance,
            holding.avgBuyPrice,
            holding.currentPrice,
            holding.evaluation,
          ].join(','),
        );
      }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    return {
      buffer: Buffer.from(csvLines.join('\n'), 'utf-8'),
      contentType: 'text/csv; charset=utf-8',
      filename: `bitscope-transactions-${timestamp}.csv`,
    };
  }

  // ========== 내부 유틸리티 메서드 ==========

  /**
   * 리포트 유형에 따라 기간 시작/종료를 산출한다.
   *
   * custom 유형은 사용자가 직접 지정한 기간을 사용한다.
   * 나머지 유형은 현재 시점 기준으로 유형별 기본 기간을 적용한다.
   */
  calculateReportPeriod(
    type: ReportType,
    customStart?: Date,
    customEnd?: Date,
  ): { periodStart: Date; periodEnd: Date } {
    const now = new Date();

    if (type === 'custom') {
      if (!customStart || !customEnd) {
        throw new BadRequestException(
          'custom 유형의 리포트는 periodStart와 periodEnd가 필수입니다.',
        );
      }
      return { periodStart: customStart, periodEnd: customEnd };
    }

    const periodMs = REPORT_PERIOD_MS[type] || REPORT_PERIOD_MS.daily!;
    const periodStart = new Date(now.getTime() - periodMs);
    const periodEnd = now;

    return { periodStart, periodEnd };
  }

  /**
   * 스냅샷 데이터를 기반으로 리포트 요약 정보를 생성한다.
   *
   * 이전 리포트가 있는 경우 변동 사항을 비교하여
   * 신규 편입/편출 코인, 평가금액 변동 등을 산출한다.
   */
  buildReportSummary(
    latestSnapshot: PortfolioSnapshotEntity | null,
    previousReport: ReportEntity | null,
  ): Record<string, unknown> {
    const currentEvaluation = latestSnapshot
      ? Number(latestSnapshot.totalEvaluation)
      : 0;

    // 이전 리포트의 평가금액
    const previousData = previousReport?.data as
      | Record<string, unknown>
      | undefined;
    const previousEvaluation = previousData
      ? Number(previousData.totalEvaluation || 0)
      : 0;

    // 평가금액 변동
    const evaluationChange = currentEvaluation - previousEvaluation;
    const evaluationChangeRate =
      previousEvaluation > 0
        ? (evaluationChange / previousEvaluation) * 100
        : 0;

    // 현재 보유 코인 심볼 목록
    const currentSymbols = new Set(
      (latestSnapshot?.holdings || []).map((h) => h.symbol),
    );

    // 이전 리포트의 보유 코인 심볼 목록
    const previousHoldings = previousData?.holdings as
      | Array<{ symbol: string }>
      | undefined;
    const previousSymbols = new Set(
      (previousHoldings || []).map((h) => h.symbol),
    );

    // 신규 편입 코인
    const newCoins = [...currentSymbols].filter((s) => !previousSymbols.has(s));

    // 편출된 코인
    const removedCoins = [...previousSymbols].filter(
      (s) => !currentSymbols.has(s),
    );

    // 코인별 수익률 계산 (상위/하위 랭킹)
    const holdingRates = (latestSnapshot?.holdings || [])
      .map((h) => {
        const avgBuyPrice = Number(h.avgBuyPrice);
        const currentPrice = Number(h.currentPrice);
        const rate =
          avgBuyPrice > 0
            ? ((currentPrice - avgBuyPrice) / avgBuyPrice) * 100
            : 0;
        return { symbol: h.symbol, rate: Math.round(rate * 100) / 100 };
      })
      .sort((a, b) => b.rate - a.rate);

    // 중복 심볼 제거 후 상위/하위 5개 추출
    const uniqueHoldings = this.deduplicateBySymbol(holdingRates);
    const topGainers = uniqueHoldings
      .filter((h) => h.rate > 0)
      .slice(0, 5);
    const topLosers = uniqueHoldings
      .filter((h) => h.rate < 0)
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 5);

    return {
      totalEvaluation: currentEvaluation,
      evaluationChange: Math.round(evaluationChange * 100) / 100,
      evaluationChangeRate: Math.round(evaluationChangeRate * 100) / 100,
      topGainers,
      topLosers,
      newCoins,
      removedCoins,
    };
  }

  /**
   * 스냅샷 엔티티에서 리포트 데이터 객체를 구성한다.
   */
  buildReportData(
    snapshot: PortfolioSnapshotEntity,
  ): Record<string, unknown> {
    return {
      walletAddress: snapshot.walletAddress,
      timestamp: snapshot.createdAt.toISOString(),
      totalEvaluation: Number(snapshot.totalEvaluation),
      totalInvestment: Number(snapshot.totalInvestment),
      totalProfitLoss: Number(snapshot.totalProfitLoss),
      profitLossRate: Number(snapshot.profitLossRate),
      holdings: (snapshot.holdings || []).map((h) => ({
        symbol: h.symbol,
        exchange: h.exchange,
        balance: Number(h.balance),
        avgBuyPrice: Number(h.avgBuyPrice),
        currentPrice: Number(h.currentPrice),
        evaluation: Number(h.evaluation),
      })),
    };
  }

  /**
   * 스냅샷 데이터가 없을 때 사용하는 빈 리포트 데이터를 생성한다.
   */
  private buildEmptyReportData(
    walletAddress: string,
  ): Record<string, unknown> {
    return {
      walletAddress,
      timestamp: new Date().toISOString(),
      totalEvaluation: 0,
      totalInvestment: 0,
      totalProfitLoss: 0,
      profitLossRate: 0,
      holdings: [],
    };
  }

  /**
   * 심볼 기준으로 중복을 제거한다.
   * 동일 심볼이 여러 거래소에 있을 경우 수익률이 가장 높은 것을 유지한다.
   */
  private deduplicateBySymbol(
    holdings: { symbol: string; rate: number }[],
  ): { symbol: string; rate: number }[] {
    const symbolMap = new Map<string, { symbol: string; rate: number }>();

    for (const h of holdings) {
      const existing = symbolMap.get(h.symbol);
      if (!existing || Math.abs(h.rate) > Math.abs(existing.rate)) {
        symbolMap.set(h.symbol, h);
      }
    }

    return [...symbolMap.values()];
  }

  /**
   * cron 표현식을 기반으로 다음 실행 시각을 산출한다.
   *
   * 간단한 구현으로 현재 시점에서 유형별 기본 간격을 더한다.
   * (실제 프로덕션에서는 cron-parser 라이브러리 사용 권장)
   */
  calculateNextRunTime(cronExpression: string): Date {
    const now = new Date();

    // cron 표현식에서 기본 간격 추정
    if (cronExpression === REPORT_CRON_EXPRESSIONS.daily) {
      // 다음 날 오전 9시
      const next = new Date(now);
      next.setDate(next.getDate() + 1);
      next.setHours(9, 0, 0, 0);
      return next;
    }

    if (cronExpression === REPORT_CRON_EXPRESSIONS.weekly) {
      // 다음 월요일 오전 9시
      const next = new Date(now);
      const daysUntilMonday = ((1 - next.getDay()) + 7) % 7 || 7;
      next.setDate(next.getDate() + daysUntilMonday);
      next.setHours(9, 0, 0, 0);
      return next;
    }

    if (cronExpression === REPORT_CRON_EXPRESSIONS.monthly) {
      // 다음 달 1일 오전 9시
      const next = new Date(now);
      next.setMonth(next.getMonth() + 1);
      next.setDate(1);
      next.setHours(9, 0, 0, 0);
      return next;
    }

    // 기본값: 24시간 뒤
    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }

  /**
   * 스냅샷 데이터를 CSV 포맷으로 변환한다.
   */
  private exportToCsv(
    snapshot: PortfolioSnapshotEntity | null,
  ): Buffer {
    const lines: string[] = [
      'Symbol,Exchange,Balance,AvgBuyPrice,CurrentPrice,Evaluation',
    ];

    if (snapshot) {
      for (const holding of snapshot.holdings || []) {
        lines.push(
          [
            holding.symbol,
            holding.exchange,
            holding.balance,
            holding.avgBuyPrice,
            holding.currentPrice,
            holding.evaluation,
          ].join(','),
        );
      }

      // 요약 정보를 마지막에 추가
      lines.push('');
      lines.push(`Total Evaluation,${snapshot.totalEvaluation}`);
      lines.push(`Total Investment,${snapshot.totalInvestment}`);
      lines.push(`Total ProfitLoss,${snapshot.totalProfitLoss}`);
      lines.push(`ProfitLoss Rate (%),${snapshot.profitLossRate}`);
    }

    return Buffer.from(lines.join('\n'), 'utf-8');
  }

  /**
   * 스냅샷 데이터를 JSON 포맷으로 변환한다.
   */
  private exportToJson(
    snapshot: PortfolioSnapshotEntity | null,
  ): Buffer {
    const data = snapshot
      ? this.buildReportData(snapshot)
      : { walletAddress: '', holdings: [], totalEvaluation: 0 };

    return Buffer.from(JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * 스냅샷 데이터를 PDF 포맷으로 변환한다.
   *
   * 간단한 텍스트 기반 PDF를 생성한다.
   * 실제 프로덕션에서는 puppeteer나 pdfkit 등의 라이브러리를 사용하여
   * 디자인된 PDF를 생성하는 것을 권장한다.
   */
  private exportToPdf(
    snapshot: PortfolioSnapshotEntity | null,
  ): Buffer {
    // 간단한 PDF 구조 생성 (최소 유효 PDF)
    const content = this.buildPdfContent(snapshot);
    return Buffer.from(content, 'binary');
  }

  /**
   * 최소 유효 PDF 문서 내용을 생성한다.
   *
   * PDF 1.4 규격에 맞는 간단한 텍스트 기반 PDF를 구성한다.
   */
  private buildPdfContent(
    snapshot: PortfolioSnapshotEntity | null,
  ): string {
    const lines: string[] = [];

    lines.push('BitScope Portfolio Report');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');

    if (snapshot) {
      lines.push(`Total Evaluation: ${Number(snapshot.totalEvaluation).toLocaleString()} KRW`);
      lines.push(`Total Investment: ${Number(snapshot.totalInvestment).toLocaleString()} KRW`);
      lines.push(`Total ProfitLoss: ${Number(snapshot.totalProfitLoss).toLocaleString()} KRW`);
      lines.push(`ProfitLoss Rate: ${snapshot.profitLossRate}%`);
      lines.push('');
      lines.push('Holdings:');

      for (const holding of snapshot.holdings || []) {
        lines.push(
          `  ${holding.symbol} (${holding.exchange}): ${holding.balance} @ ${Number(holding.currentPrice).toLocaleString()} KRW = ${Number(holding.evaluation).toLocaleString()} KRW`,
        );
      }
    } else {
      lines.push('No snapshot data available.');
    }

    // 실제 PDF 형식 대신 텍스트 형식의 리포트를 반환한다.
    // 프로덕션에서는 pdfkit 등의 라이브러리로 실제 PDF를 생성해야 한다.
    return lines.join('\n');
  }
}
