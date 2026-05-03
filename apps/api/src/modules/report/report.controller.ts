/**
 * 리포트 컨트롤러
 *
 * 리포트 생성, 조회, 정기 스케줄 관리, 데이터 내보내기를 위한
 * REST API 엔드포인트를 제공한다.
 *
 * 주의: NestJS에서 라우트 매칭은 선언 순서에 따라 이루어진다.
 * 정적 경로(schedules 등)와 하위 경로(export, item 등)는
 * 와일드카드 파라미터(:walletAddress)보다 먼저 선언되어야 한다.
 *
 * @see 요구사항 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 12.13
 */

import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

import { ReportService } from './report.service';
import { CreateReportDto } from './dto/create-report.dto';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { QueryReportDto, ExportDataDto } from './dto/query-report.dto';
import { ReportEntity } from './entities/report.entity';
import { ReportScheduleEntity } from './entities/report-schedule.entity';

import type { ReportType, ExportFormat } from '@bitscope/shared';

@Controller('reports')
export class ReportController {
  private readonly logger = new Logger(ReportController.name);

  constructor(private readonly reportService: ReportService) {}

  // ========== 리포트 생성 ==========

  /**
   * POST /reports
   *
   * 수동으로 리포트를 생성한다.
   * 스냅샷 기반 요약 정보와 이전 대비 변동 사항을 포함한다.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createReport(@Body() dto: CreateReportDto): Promise<ReportEntity> {
    this.logger.log(
      `리포트 생성 요청 - wallet: ${dto.walletAddress}, type: ${dto.type}`,
    );
    return this.reportService.generateReport(dto);
  }

  // ========== 정기 리포트 스케줄 관리 ==========
  // 주의: schedules 경로는 :walletAddress 와일드카드보다 먼저 선언되어야 한다.
  // 그렇지 않으면 GET /reports/schedules가 :walletAddress="schedules"로 매칭된다.

  /**
   * POST /reports/schedules
   *
   * 정기 리포트 스케줄을 생성한다.
   */
  @Post('schedules')
  @HttpCode(HttpStatus.CREATED)
  async createSchedule(
    @Body() dto: CreateScheduleDto,
  ): Promise<ReportScheduleEntity> {
    this.logger.log(
      `리포트 스케줄 생성 요청 - wallet: ${dto.walletAddress}, type: ${dto.type}`,
    );
    return this.reportService.createSchedule(dto);
  }

  /**
   * GET /reports/schedules/:walletAddress
   *
   * 특정 지갑 주소의 정기 리포트 스케줄 목록을 조회한다.
   */
  @Get('schedules/:walletAddress')
  async getSchedules(
    @Param('walletAddress') walletAddress: string,
  ): Promise<ReportScheduleEntity[]> {
    this.logger.log(`리포트 스케줄 목록 조회 - wallet: ${walletAddress}`);
    return this.reportService.getSchedules(walletAddress);
  }

  /**
   * PATCH /reports/schedules/:scheduleId
   *
   * 기존 정기 리포트 스케줄을 수정한다.
   */
  @Patch('schedules/:scheduleId')
  async updateSchedule(
    @Param('scheduleId') scheduleId: string,
    @Body() dto: UpdateScheduleDto,
  ): Promise<ReportScheduleEntity> {
    this.logger.log(`리포트 스케줄 수정 요청 - id: ${scheduleId}`);
    return this.reportService.updateSchedule(scheduleId, dto);
  }

  /**
   * DELETE /reports/schedules/:scheduleId
   *
   * 정기 리포트 스케줄을 삭제한다.
   */
  @Delete('schedules/:scheduleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelSchedule(
    @Param('scheduleId') scheduleId: string,
  ): Promise<void> {
    this.logger.log(`리포트 스케줄 삭제 요청 - id: ${scheduleId}`);
    return this.reportService.cancelSchedule(scheduleId);
  }

  // ========== 데이터 내보내기 ==========
  // 주의: export 하위 경로는 :walletAddress 와일드카드보다 먼저 선언되어야 한다.

  /**
   * GET /reports/:walletAddress/export/transactions
   *
   * 거래 내역을 CSV 포맷으로 내보낸다.
   * 선택한 기간의 모든 스냅샷 보유 내역이 포함된다.
   *
   * 주의: 이 라우트는 :walletAddress/export보다 먼저 선언되어야 한다.
   */
  @Get(':walletAddress/export/transactions')
  async exportTransactions(
    @Param('walletAddress') walletAddress: string,
    @Query('start') start: string | undefined,
    @Query('end') end: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(
      `거래 내역 내보내기 요청 - wallet: ${walletAddress}`,
    );

    const startDate = start ? new Date(start) : undefined;
    const endDate = end ? new Date(end) : undefined;

    const result = await this.reportService.exportTransactionHistory(
      walletAddress,
      startDate,
      endDate,
    );

    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.send(result.buffer);
  }

  /**
   * GET /reports/:walletAddress/export
   *
   * 포트폴리오 스냅샷 데이터를 CSV, JSON, PDF 포맷으로 내보낸다.
   * 응답은 파일 다운로드 형태로 전달된다.
   */
  @Get(':walletAddress/export')
  async exportData(
    @Param('walletAddress') walletAddress: string,
    @Query() query: ExportDataDto,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(
      `데이터 내보내기 요청 - wallet: ${walletAddress}, format: ${query.format}`,
    );

    const start = query.start ? new Date(query.start) : undefined;
    const end = query.end ? new Date(query.end) : undefined;

    const result = await this.reportService.exportData(
      walletAddress,
      query.format as ExportFormat,
      start,
      end,
    );

    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.send(result.buffer);
  }

  // ========== 리포트 조회 ==========

  /**
   * GET /reports/:walletAddress/item/:reportId
   *
   * 특정 리포트를 ID로 조회한다.
   *
   * 주의: 이 라우트는 :walletAddress보다 먼저 선언되어야 한다.
   */
  @Get(':walletAddress/item/:reportId')
  async getReport(
    @Param('reportId') reportId: string,
  ): Promise<ReportEntity> {
    this.logger.log(`리포트 조회 - id: ${reportId}`);
    return this.reportService.getReport(reportId);
  }

  /**
   * GET /reports/:walletAddress
   *
   * 특정 지갑 주소의 리포트 이력을 조회한다.
   * type, limit 쿼리 파라미터로 필터링할 수 있다.
   *
   * 주의: 이 라우트는 가장 마지막에 선언되어야 한다.
   * :walletAddress가 다른 경로 세그먼트와 충돌할 수 있기 때문이다.
   */
  @Get(':walletAddress')
  async getReportHistory(
    @Param('walletAddress') walletAddress: string,
    @Query() query: QueryReportDto,
  ): Promise<ReportEntity[]> {
    const limit = query.limit ? parseInt(query.limit, 10) : 20;
    const effectiveLimit = isNaN(limit) || limit <= 0 ? 20 : limit;

    this.logger.log(
      `리포트 이력 조회 - wallet: ${walletAddress}, type: ${query.type || 'all'}, limit: ${effectiveLimit}`,
    );

    return this.reportService.getReportHistory(
      walletAddress,
      query.type as ReportType | undefined,
      effectiveLimit,
    );
  }
}
