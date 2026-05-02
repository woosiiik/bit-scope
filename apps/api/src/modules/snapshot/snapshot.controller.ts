/**
 * 포트폴리오 스냅샷 컨트롤러
 *
 * 클라이언트가 포트폴리오 스냅샷을 저장하고 조회하기 위한
 * REST API 엔드포인트를 제공한다.
 */

import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';

import { SnapshotService, AggregatedSnapshotResult } from './snapshot.service';
import { CreateSnapshotDto } from './dto/create-snapshot.dto';
import { QuerySnapshotDto } from './dto/query-snapshot.dto';
import { PortfolioSnapshotEntity } from './entities/portfolio-snapshot.entity';

import type { AggregationInterval } from '@bitscope/shared';

@Controller('snapshots')
export class SnapshotController {
  private readonly logger = new Logger(SnapshotController.name);

  constructor(private readonly snapshotService: SnapshotService) {}

  /**
   * POST /snapshots
   *
   * 클라이언트가 전송한 포트폴리오 스냅샷을 DB에 저장한다.
   * 대시보드 접속 시마다 호출되어 포트폴리오 이력이 축적된다.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createSnapshot(
    @Body() dto: CreateSnapshotDto,
  ): Promise<PortfolioSnapshotEntity> {
    this.logger.log(`스냅샷 생성 요청 - wallet: ${dto.walletAddress}`);
    return this.snapshotService.saveSnapshot(dto);
  }

  /**
   * GET /snapshots/:walletAddress
   *
   * 특정 지갑 주소의 기간별 스냅샷 목록을 조회한다.
   * 쿼리 파라미터로 시작/종료 시각, 집계 간격, 조회 개수를 지정할 수 있다.
   *
   * - interval이 지정되면 집계된 결과를 반환한다.
   * - interval이 없으면 개별 스냅샷 목록을 반환한다.
   */
  @Get(':walletAddress')
  async getSnapshots(
    @Param('walletAddress') walletAddress: string,
    @Query() query: QuerySnapshotDto,
  ): Promise<PortfolioSnapshotEntity[] | AggregatedSnapshotResult[]> {
    this.logger.log(
      `스냅샷 조회 요청 - wallet: ${walletAddress}, interval: ${query.interval || 'none'}`,
    );

    const start = query.start ? new Date(query.start) : undefined;
    const end = query.end ? new Date(query.end) : undefined;
    const limit = query.limit ? parseInt(query.limit, 10) : undefined;

    // 집계 간격이 지정된 경우 집계 결과 반환
    if (query.interval) {
      return this.snapshotService.aggregateSnapshots(
        walletAddress,
        query.interval as AggregationInterval,
        start,
        end,
      );
    }

    // 개별 스냅샷 목록 반환
    return this.snapshotService.getSnapshots(walletAddress, start, end, limit);
  }

  /**
   * GET /snapshots/:walletAddress/latest
   *
   * 특정 지갑 주소의 최신 스냅샷을 조회한다.
   * 스냅샷이 없으면 null을 반환한다.
   */
  @Get(':walletAddress/latest')
  async getLatestSnapshot(
    @Param('walletAddress') walletAddress: string,
  ): Promise<PortfolioSnapshotEntity | null> {
    this.logger.log(`최신 스냅샷 조회 요청 - wallet: ${walletAddress}`);
    return this.snapshotService.getLatestSnapshot(walletAddress);
  }
}
