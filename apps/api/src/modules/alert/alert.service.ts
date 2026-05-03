/**
 * AlertService - 알림 서비스
 *
 * 가격 알림 및 김치 프리미엄 알림의 CRUD 관리와
 * 실시간 시세 변동 시 알림 조건 매칭 및 알림 발송을 담당한다.
 *
 * PriceMonitorService의 시세 업데이트 이벤트를 구독하여
 * 활성화된 알림 조건을 실시간으로 감시하고,
 * 조건 충족 시 PriceGateway를 통해 사용자에게 알림을 전송한다.
 *
 * @see 설계 문서 3.3.4 AlertService
 * @see 요구사항 6.1, 6.2, 6.5, 6.6, 6.7, 12.11
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';

import type {
  ExchangeType,
  PriceUpdate,
  AlertNotification,
  AlertCondition,
} from '@bitscope/shared';

import { AlertEntity } from './entities/alert.entity';
import { AlertHistoryEntity } from './entities/alert-history.entity';
import { CreateAlertDto } from './dto/create-alert.dto';
import { UpdateAlertDto } from './dto/update-alert.dto';
import { PRICE_EVENTS } from '../price/price-monitor.service';
import { PriceGateway } from '../price/price.gateway';
import { PremiumService } from '../premium/premium.service';
import { TelegramService } from '../telegram/telegram.service';

/**
 * 알림 중복 방지를 위한 쿨다운 시간 (밀리초)
 *
 * 동일한 알림이 짧은 시간 내에 반복 발생하는 것을 방지한다.
 * 한 번 발생한 알림은 이 시간이 지난 후에야 다시 발생할 수 있다.
 */
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5분

/**
 * 알림 조건 검사 스로틀링 간격 (밀리초)
 *
 * 동일 심볼에 대한 시세 업데이트가 초당 수십 회 발생할 수 있으므로,
 * 심볼별로 최소 이 간격을 두고 알림 조건을 검사한다.
 * 이를 통해 DB 쿼리 횟수를 크게 줄인다.
 */
const ALERT_CHECK_THROTTLE_MS = 3_000; // 3초

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  /**
   * 알림 중복 방지를 위한 마지막 발생 시각 맵
   * key: alertId, value: 마지막 발생 시각 (밀리초)
   */
  private readonly lastTriggeredMap = new Map<string, number>();

  /**
   * 심볼별 마지막 알림 검사 시각 맵 (스로틀링용)
   * key: symbol, value: 마지막 검사 시각 (밀리초)
   */
  private readonly lastCheckMap = new Map<string, number>();

  constructor(
    @InjectRepository(AlertEntity)
    private readonly alertRepository: Repository<AlertEntity>,
    @InjectRepository(AlertHistoryEntity)
    private readonly alertHistoryRepository: Repository<AlertHistoryEntity>,
    private readonly priceGateway: PriceGateway,
    private readonly premiumService: PremiumService,
    private readonly telegramService: TelegramService,
  ) {}

  /**
   * 새로운 알림을 생성한다.
   *
   * @param dto 알림 생성 요청 데이터
   * @returns 생성된 알림 엔티티
   */
  async createAlert(dto: CreateAlertDto): Promise<AlertEntity> {
    this.logger.log(
      `알림 생성 - wallet: ${dto.walletAddress}, symbol: ${dto.symbol}, condition: ${dto.condition}`,
    );

    const alert = this.alertRepository.create({
      walletAddress: dto.walletAddress.toLowerCase(),
      symbol: dto.symbol.toUpperCase(),
      exchange: dto.exchange || null,
      condition: dto.condition,
      targetValue: dto.targetValue,
      isActive: dto.isActive ?? true,
    });

    const saved = await this.alertRepository.save(alert);

    this.logger.log(`알림 생성 완료 - id: ${saved.id}`);
    return saved;
  }

  /**
   * 기존 알림 설정을 수정한다.
   *
   * @param alertId 수정할 알림 ID
   * @param dto 수정할 필드
   * @returns 수정된 알림 엔티티
   * @throws NotFoundException 알림을 찾을 수 없는 경우
   */
  async updateAlert(alertId: string, dto: UpdateAlertDto): Promise<AlertEntity> {
    const alert = await this.alertRepository.findOne({
      where: { id: alertId },
    });

    if (!alert) {
      throw new NotFoundException(`알림을 찾을 수 없습니다: ${alertId}`);
    }

    // 제공된 필드만 업데이트
    if (dto.symbol !== undefined) {
      alert.symbol = dto.symbol.toUpperCase();
    }
    if (dto.exchange !== undefined) {
      alert.exchange = dto.exchange;
    }
    if (dto.condition !== undefined) {
      alert.condition = dto.condition;
    }
    if (dto.targetValue !== undefined) {
      alert.targetValue = dto.targetValue;
    }
    if (dto.isActive !== undefined) {
      alert.isActive = dto.isActive;

      // 알림이 비활성화되면 쿨다운 맵에서 제거
      if (!dto.isActive) {
        this.lastTriggeredMap.delete(alertId);
      }
    }

    const updated = await this.alertRepository.save(alert);

    this.logger.log(`알림 수정 완료 - id: ${updated.id}`);
    return updated;
  }

  /**
   * 알림을 삭제한다.
   *
   * cascade 설정에 의해 관련 이력도 함께 삭제된다.
   *
   * @param alertId 삭제할 알림 ID
   * @throws NotFoundException 알림을 찾을 수 없는 경우
   */
  async deleteAlert(alertId: string): Promise<void> {
    const alert = await this.alertRepository.findOne({
      where: { id: alertId },
    });

    if (!alert) {
      throw new NotFoundException(`알림을 찾을 수 없습니다: ${alertId}`);
    }

    await this.alertRepository.remove(alert);
    this.lastTriggeredMap.delete(alertId);

    this.logger.log(`알림 삭제 완료 - id: ${alertId}`);
  }

  /**
   * 특정 지갑 주소의 알림 목록을 조회한다.
   *
   * @param walletAddress 지갑 주소
   * @param isActive 활성 상태 필터 (undefined이면 전체)
   * @param symbol 코인 심볼 필터 (undefined이면 전체)
   * @returns 알림 엔티티 배열
   */
  async getAlerts(
    walletAddress: string,
    isActive?: boolean,
    symbol?: string,
  ): Promise<AlertEntity[]> {
    const normalizedAddress = walletAddress.toLowerCase();

    const queryBuilder = this.alertRepository
      .createQueryBuilder('alert')
      .where('alert.walletAddress = :walletAddress', {
        walletAddress: normalizedAddress,
      });

    if (isActive !== undefined) {
      queryBuilder.andWhere('alert.isActive = :isActive', { isActive });
    }

    if (symbol) {
      queryBuilder.andWhere('alert.symbol = :symbol', {
        symbol: symbol.toUpperCase(),
      });
    }

    queryBuilder.orderBy('alert.createdAt', 'DESC');

    return queryBuilder.getMany();
  }

  /**
   * 특정 지갑 주소의 알림 발생 이력을 조회한다.
   *
   * @param walletAddress 지갑 주소
   * @param limit 조회할 최대 이력 수 (기본 50)
   * @returns 알림 이력 엔티티 배열 (최신순)
   */
  async getAlertHistory(
    walletAddress: string,
    limit: number = 50,
  ): Promise<AlertHistoryEntity[]> {
    const normalizedAddress = walletAddress.toLowerCase();

    return this.alertHistoryRepository
      .createQueryBuilder('history')
      .innerJoinAndSelect('history.alert', 'alert')
      .where('alert.walletAddress = :walletAddress', {
        walletAddress: normalizedAddress,
      })
      .orderBy('history.triggeredAt', 'DESC')
      .take(limit)
      .getMany();
  }

  /**
   * PriceMonitorService의 시세 업데이트 이벤트를 수신하여
   * 가격 알림 조건을 검사한다.
   *
   * 심볼별로 스로틀링을 적용하여 DB 쿼리 부하를 줄인다.
   * 고빈도 시세 업데이트(초당 수십 회)가 매번 DB 쿼리를 발생시키지 않도록
   * 동일 심볼에 대해 최소 ALERT_CHECK_THROTTLE_MS 간격을 둔다.
   *
   * EventEmitter2의 @OnEvent 데코레이터를 사용하여
   * PRICE_EVENTS.PRICE_UPDATE 이벤트를 구독한다.
   *
   * @param update 시세 업데이트 데이터
   */
  @OnEvent(PRICE_EVENTS.PRICE_UPDATE)
  async handlePriceUpdate(update: PriceUpdate): Promise<void> {
    // 심볼별 스로틀링: 최근 검사로부터 충분한 시간이 지나지 않았으면 스킵
    const now = Date.now();
    const lastCheck = this.lastCheckMap.get(update.symbol) ?? 0;
    if (now - lastCheck < ALERT_CHECK_THROTTLE_MS) {
      return;
    }
    this.lastCheckMap.set(update.symbol, now);

    try {
      await this.checkPriceAlerts(update);
      await this.checkPremiumAlerts(update.symbol);
    } catch (error) {
      this.logger.error(
        `알림 조건 검사 중 오류: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 가격 알림 조건을 검사한다.
   *
   * 활성화된 가격 알림 중 해당 심볼 및 거래소의 조건을 확인하고,
   * 조건이 충족되면 알림을 발송하고 이력을 저장한다.
   *
   * @param update 시세 업데이트 데이터
   */
  private async checkPriceAlerts(update: PriceUpdate): Promise<void> {
    // 해당 심볼의 활성 가격 알림 조회 (above, below 조건만)
    const alerts = await this.alertRepository.find({
      where: [
        {
          symbol: update.symbol,
          condition: 'above',
          isActive: true,
        },
        {
          symbol: update.symbol,
          condition: 'below',
          isActive: true,
        },
      ],
    });

    for (const alert of alerts) {
      // 거래소 필터: 특정 거래소 지정 시 해당 거래소의 시세만 검사
      if (alert.exchange && alert.exchange !== update.exchange) {
        continue;
      }

      const isConditionMet = this.evaluatePriceCondition(
        alert.condition as AlertCondition,
        update.price,
        alert.targetValue,
      );

      if (isConditionMet && !this.isInCooldown(alert.id)) {
        await this.triggerAlert(alert, update.price);
      }
    }
  }

  /**
   * 김치 프리미엄 알림 조건을 검사한다.
   *
   * 활성화된 프리미엄 알림 중 해당 심볼의 조건을 확인하고,
   * 조건이 충족되면 알림을 발송하고 이력을 저장한다.
   *
   * @param symbol 시세 업데이트가 발생한 심볼
   */
  private async checkPremiumAlerts(symbol: string): Promise<void> {
    // 해당 심볼의 활성 프리미엄 알림 조회
    const alerts = await this.alertRepository.find({
      where: [
        {
          symbol,
          condition: 'premium_above',
          isActive: true,
        },
        {
          symbol,
          condition: 'premium_below',
          isActive: true,
        },
      ],
    });

    if (alerts.length === 0) {
      return;
    }

    // 현재 프리미엄 계산
    const premium = this.premiumService.calculatePremium(symbol);
    if (!premium) {
      return;
    }

    for (const alert of alerts) {
      const isConditionMet = this.evaluatePremiumCondition(
        alert.condition as AlertCondition,
        premium.premiumRate,
        alert.targetValue,
      );

      if (isConditionMet && !this.isInCooldown(alert.id)) {
        await this.triggerAlert(alert, premium.premiumRate);
      }
    }
  }

  /**
   * 가격 알림 조건을 평가한다.
   *
   * @param condition 알림 조건
   * @param currentPrice 현재 가격
   * @param targetValue 목표 가격
   * @returns 조건 충족 여부
   */
  private evaluatePriceCondition(
    condition: AlertCondition,
    currentPrice: number,
    targetValue: number,
  ): boolean {
    switch (condition) {
      case 'above':
        return currentPrice >= targetValue;
      case 'below':
        return currentPrice <= targetValue;
      default:
        return false;
    }
  }

  /**
   * 프리미엄 알림 조건을 평가한다.
   *
   * @param condition 알림 조건
   * @param currentRate 현재 프리미엄 비율 (%)
   * @param targetValue 목표 프리미엄 비율 (%)
   * @returns 조건 충족 여부
   */
  private evaluatePremiumCondition(
    condition: AlertCondition,
    currentRate: number,
    targetValue: number,
  ): boolean {
    switch (condition) {
      case 'premium_above':
        return currentRate >= targetValue;
      case 'premium_below':
        return currentRate <= targetValue;
      default:
        return false;
    }
  }

  /**
   * 알림 쿨다운 여부를 확인한다.
   *
   * 동일한 알림이 짧은 시간 내에 반복 발생하는 것을 방지한다.
   *
   * @param alertId 알림 ID
   * @returns 쿨다운 중이면 true
   */
  private isInCooldown(alertId: string): boolean {
    const lastTriggered = this.lastTriggeredMap.get(alertId);
    if (!lastTriggered) {
      return false;
    }

    return Date.now() - lastTriggered < ALERT_COOLDOWN_MS;
  }

  /**
   * 알림을 발동시킨다.
   *
   * WebSocket을 통해 사용자에게 알림을 전송하고,
   * 알림 이력을 DB에 저장하며, 쿨다운 맵을 갱신한다.
   *
   * @param alert 발동된 알림 엔티티
   * @param triggeredValue 발동 시점의 값 (가격 또는 프리미엄 비율)
   */
  private async triggerAlert(
    alert: AlertEntity,
    triggeredValue: number,
  ): Promise<void> {
    const message = this.buildAlertMessage(alert, triggeredValue);

    this.logger.log(
      `알림 발동 - id: ${alert.id}, wallet: ${alert.walletAddress}, message: ${message}`,
    );

    // 1. 쿨다운 맵 갱신 (먼저 설정하여 중복 발동 방지)
    this.lastTriggeredMap.set(alert.id, Date.now());

    // 2. WebSocket을 통해 사용자에게 알림 전송
    const notification: AlertNotification = {
      alertId: alert.id,
      symbol: alert.symbol,
      condition: alert.condition as AlertCondition,
      targetValue: alert.targetValue,
      triggeredValue,
      message,
      triggeredAt: new Date(),
    };

    this.priceGateway.broadcastAlert(alert.walletAddress, notification);

    // 3. 알림 이력 DB 저장
    try {
      const history = this.alertHistoryRepository.create({
        alertId: alert.id,
        triggeredValue,
        message,
      });

      await this.alertHistoryRepository.save(history);
    } catch (error) {
      this.logger.error(
        `알림 이력 저장 실패 - alertId: ${alert.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // 4. 텔레그램 메시지 발송 (실패해도 다른 알림에 영향 없음)
    try {
      await this.sendTelegramNotification(alert, triggeredValue);
    } catch (error) {
      this.logger.error(
        `텔레그램 알림 발송 실패 - alertId: ${alert.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 알림 메시지를 생성한다.
   *
   * 알림 조건에 따라 사용자 친화적인 메시지를 구성한다.
   *
   * @param alert 알림 엔티티
   * @param triggeredValue 발동 시점의 값
   * @returns 알림 메시지 문자열
   */
  private buildAlertMessage(
    alert: AlertEntity,
    triggeredValue: number,
  ): string {
    const symbol = alert.symbol;
    const condition = alert.condition as AlertCondition;
    const targetValue = alert.targetValue;

    switch (condition) {
      case 'above':
        return `${symbol} 가격이 ${targetValue.toLocaleString()}원 이상에 도달했습니다. (현재가: ${triggeredValue.toLocaleString()}원)`;
      case 'below':
        return `${symbol} 가격이 ${targetValue.toLocaleString()}원 이하로 하락했습니다. (현재가: ${triggeredValue.toLocaleString()}원)`;
      case 'premium_above':
        return `${symbol} 김치 프리미엄이 ${targetValue}% 이상에 도달했습니다. (현재: ${triggeredValue.toFixed(2)}%)`;
      case 'premium_below':
        return `${symbol} 김치 프리미엄이 ${targetValue}% 이하로 하락했습니다. (현재: ${triggeredValue.toFixed(2)}%)`;
      default:
        return `${symbol} 알림 조건이 충족되었습니다.`;
    }
  }

  /**
   * 텔레그램으로 알림을 발송한다.
   *
   * 텔레그램 연결이 있는 사용자에게만 발송하며,
   * 발송 실패 시 조용히 로그만 남기고 다른 알림에 영향을 주지 않는다.
   *
   * @param alert 발동된 알림 엔티티
   * @param triggeredValue 발동 시점의 값 (가격 또는 프리미엄 비율)
   */
  private async sendTelegramNotification(
    alert: AlertEntity,
    triggeredValue: number,
  ): Promise<void> {
    if (!this.telegramService.isEnabled()) {
      return;
    }

    const connection = await this.telegramService.getConnection(
      alert.walletAddress,
    );

    if (!connection || !connection.isActive) {
      return;
    }

    const telegramMessage = this.buildTelegramMessage(alert, triggeredValue);
    await this.telegramService.sendMessage(connection.chatId, telegramMessage);
  }

  /**
   * 텔레그램 알림 메시지를 HTML 형식으로 생성한다.
   *
   * @param alert 알림 엔티티
   * @param triggeredValue 발동 시점의 값
   * @returns HTML 형식의 텔레그램 메시지
   */
  private buildTelegramMessage(
    alert: AlertEntity,
    triggeredValue: number,
  ): string {
    const symbol = alert.symbol;
    const condition = alert.condition as AlertCondition;
    const targetValue = alert.targetValue;

    const exchangeNameMap: Record<string, string> = {
      upbit: 'Upbit',
      bithumb: 'Bithumb',
      coinone: 'Coinone',
    };

    const exchangeName = alert.exchange
      ? exchangeNameMap[alert.exchange] ?? alert.exchange
      : '';

    switch (condition) {
      case 'above':
        return (
          `<b>BitScope Alert</b>\n\n` +
          `<b>${symbol}</b>\n` +
          `Condition: >= ${targetValue.toLocaleString()} KRW\n` +
          `Current: ${triggeredValue.toLocaleString()} KRW\n` +
          (exchangeName ? `Exchange: ${exchangeName}\n` : '') +
          `\n---\nBitScope`
        );
      case 'below':
        return (
          `<b>BitScope Alert</b>\n\n` +
          `<b>${symbol}</b>\n` +
          `Condition: <= ${targetValue.toLocaleString()} KRW\n` +
          `Current: ${triggeredValue.toLocaleString()} KRW\n` +
          (exchangeName ? `Exchange: ${exchangeName}\n` : '') +
          `\n---\nBitScope`
        );
      case 'premium_above':
        return (
          `<b>BitScope Premium Alert</b>\n\n` +
          `<b>${symbol}</b>\n` +
          `Condition: Premium >= ${targetValue}%\n` +
          `Current: ${triggeredValue.toFixed(2)}%\n` +
          `\n---\nBitScope`
        );
      case 'premium_below':
        return (
          `<b>BitScope Premium Alert</b>\n\n` +
          `<b>${symbol}</b>\n` +
          `Condition: Premium <= ${targetValue}%\n` +
          `Current: ${triggeredValue.toFixed(2)}%\n` +
          `\n---\nBitScope`
        );
      default:
        return (
          `<b>BitScope Alert</b>\n\n` +
          `<b>${symbol}</b>\n` +
          `Alert condition met.\n` +
          `\n---\nBitScope`
        );
    }
  }
}
