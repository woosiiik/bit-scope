/**
 * 알림 컨트롤러
 *
 * 가격 알림 및 김치 프리미엄 알림의 CRUD와
 * 알림 이력 조회를 위한 REST API 엔드포인트를 제공한다.
 *
 * @see 요구사항 6.1, 6.2, 6.3, 6.5
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
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';

import { AlertService } from './alert.service';
import { CreateAlertDto } from './dto/create-alert.dto';
import { UpdateAlertDto } from './dto/update-alert.dto';
import { QueryAlertDto, QueryAlertHistoryDto } from './dto/query-alert.dto';
import { AlertEntity } from './entities/alert.entity';
import { AlertHistoryEntity } from './entities/alert-history.entity';

@Controller('alerts')
export class AlertController {
  private readonly logger = new Logger(AlertController.name);

  constructor(private readonly alertService: AlertService) {}

  /**
   * POST /alerts
   *
   * 새로운 가격 알림 또는 김치 프리미엄 알림을 생성한다.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createAlert(@Body() dto: CreateAlertDto): Promise<AlertEntity> {
    this.logger.log(
      `알림 생성 요청 - wallet: ${dto.walletAddress}, symbol: ${dto.symbol}`,
    );
    return this.alertService.createAlert(dto);
  }

  /**
   * GET /alerts/:walletAddress/history
   *
   * 특정 지갑 주소의 알림 발생 이력을 조회한다.
   * limit 쿼리 파라미터로 최대 조회 수를 지정할 수 있다 (기본 50).
   *
   * 주의: 이 라우트는 :walletAddress보다 먼저 선언되어야 한다.
   * 그렇지 않으면 "history"가 walletAddress 파라미터로 매칭된다.
   */
  @Get(':walletAddress/history')
  async getAlertHistory(
    @Param('walletAddress') walletAddress: string,
    @Query() query: QueryAlertHistoryDto,
  ): Promise<AlertHistoryEntity[]> {
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const effectiveLimit = isNaN(limit) || limit <= 0 ? 50 : limit;

    this.logger.log(
      `알림 이력 조회 - wallet: ${walletAddress}, limit: ${effectiveLimit}`,
    );

    return this.alertService.getAlertHistory(walletAddress, effectiveLimit);
  }

  /**
   * GET /alerts/:walletAddress
   *
   * 특정 지갑 주소의 알림 목록을 조회한다.
   * isActive, symbol 쿼리 파라미터로 필터링할 수 있다.
   */
  @Get(':walletAddress')
  async getAlerts(
    @Param('walletAddress') walletAddress: string,
    @Query() query: QueryAlertDto,
  ): Promise<AlertEntity[]> {
    this.logger.log(
      `알림 목록 조회 - wallet: ${walletAddress}, isActive: ${query.isActive ?? 'all'}`,
    );

    const isActive =
      query.isActive !== undefined
        ? query.isActive === 'true'
        : undefined;

    return this.alertService.getAlerts(
      walletAddress,
      isActive,
      query.symbol,
    );
  }

  /**
   * PATCH /alerts/:alertId
   *
   * 기존 알림 설정을 부분적으로 수정한다.
   */
  @Patch(':alertId')
  async updateAlert(
    @Param('alertId') alertId: string,
    @Body() dto: UpdateAlertDto,
  ): Promise<AlertEntity> {
    this.logger.log(`알림 수정 요청 - id: ${alertId}`);
    return this.alertService.updateAlert(alertId, dto);
  }

  /**
   * DELETE /alerts/item/:alertId
   *
   * 알림을 삭제한다. 관련 이력도 함께 삭제된다.
   */
  @Delete('item/:alertId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAlert(@Param('alertId') alertId: string): Promise<void> {
    this.logger.log(`알림 삭제 요청 - id: ${alertId}`);
    return this.alertService.deleteAlert(alertId);
  }
}
