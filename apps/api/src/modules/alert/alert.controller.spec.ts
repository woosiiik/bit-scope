/**
 * AlertController 단위 테스트
 *
 * 모의 AlertService를 사용하여 REST API 엔드포인트의
 * 요청 위임 및 응답 처리를 검증한다.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';

import { AlertController } from './alert.controller';
import { AlertService } from './alert.service';
import { AlertEntity } from './entities/alert.entity';
import { AlertHistoryEntity } from './entities/alert-history.entity';

/** 테스트용 AlertEntity 생성 헬퍼 */
function createAlertEntity(overrides: Partial<AlertEntity> = {}): AlertEntity {
  const entity = new AlertEntity();
  entity.id = overrides.id || 'alert-uuid-1';
  entity.walletAddress = overrides.walletAddress || '0x1234567890abcdef1234567890abcdef12345678';
  entity.symbol = overrides.symbol || 'BTC';
  entity.exchange = overrides.exchange ?? 'upbit';
  entity.currency = overrides.currency ?? 'KRW';
  entity.condition = overrides.condition || 'above';
  entity.targetValue = overrides.targetValue ?? 100_000_000;
  entity.isActive = overrides.isActive ?? true;
  entity.createdAt = overrides.createdAt || new Date('2026-05-01T00:00:00Z');
  entity.updatedAt = overrides.updatedAt || new Date('2026-05-01T00:00:00Z');
  entity.histories = overrides.histories || [];
  return entity;
}

describe('AlertController', () => {
  let controller: AlertController;
  let alertService: jest.Mocked<Partial<AlertService>>;

  beforeEach(async () => {
    alertService = {
      createAlert: jest.fn(),
      updateAlert: jest.fn(),
      deleteAlert: jest.fn(),
      getAlerts: jest.fn().mockResolvedValue([]),
      getAlertHistory: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlertController],
      providers: [
        {
          provide: AlertService,
          useValue: alertService,
        },
      ],
    }).compile();

    controller = module.get<AlertController>(AlertController);
  });

  it('컨트롤러 인스턴스가 정의되어 있어야 한다', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /alerts', () => {
    it('알림 생성을 서비스에 위임해야 한다', async () => {
      const dto = {
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        symbol: 'BTC',
        exchange: 'upbit',
        currency: 'KRW',
        condition: 'above',
        targetValue: 100_000_000,
      };
      const createdAlert = createAlertEntity();
      (alertService.createAlert as jest.Mock).mockResolvedValue(createdAlert);

      const result = await controller.createAlert(dto);

      expect(alertService.createAlert).toHaveBeenCalledWith(dto);
      expect(result).toBe(createdAlert);
    });
  });

  describe('GET /alerts/:walletAddress', () => {
    it('알림 목록 조회를 서비스에 위임해야 한다', async () => {
      const alerts = [createAlertEntity()];
      (alertService.getAlerts as jest.Mock).mockResolvedValue(alerts);

      const result = await controller.getAlerts(
        '0x1234567890abcdef1234567890abcdef12345678',
        {},
      );

      expect(alertService.getAlerts).toHaveBeenCalledWith(
        '0x1234567890abcdef1234567890abcdef12345678',
        undefined,
        undefined,
      );
      expect(result).toBe(alerts);
    });

    it('isActive 쿼리 파라미터를 boolean으로 변환해야 한다', async () => {
      (alertService.getAlerts as jest.Mock).mockResolvedValue([]);

      await controller.getAlerts(
        '0x1234567890abcdef1234567890abcdef12345678',
        { isActive: 'true' },
      );

      expect(alertService.getAlerts).toHaveBeenCalledWith(
        '0x1234567890abcdef1234567890abcdef12345678',
        true,
        undefined,
      );
    });

    it('symbol 쿼리 파라미터를 전달해야 한다', async () => {
      (alertService.getAlerts as jest.Mock).mockResolvedValue([]);

      await controller.getAlerts(
        '0x1234567890abcdef1234567890abcdef12345678',
        { symbol: 'BTC' },
      );

      expect(alertService.getAlerts).toHaveBeenCalledWith(
        '0x1234567890abcdef1234567890abcdef12345678',
        undefined,
        'BTC',
      );
    });
  });

  describe('GET /alerts/:walletAddress/history', () => {
    it('알림 이력 조회를 서비스에 위임해야 한다', async () => {
      (alertService.getAlertHistory as jest.Mock).mockResolvedValue([]);

      const result = await controller.getAlertHistory(
        '0x1234567890abcdef1234567890abcdef12345678',
        {},
      );

      expect(alertService.getAlertHistory).toHaveBeenCalledWith(
        '0x1234567890abcdef1234567890abcdef12345678',
        50,
      );
      expect(result).toEqual([]);
    });

    it('limit 쿼리 파라미터를 숫자로 변환해야 한다', async () => {
      (alertService.getAlertHistory as jest.Mock).mockResolvedValue([]);

      await controller.getAlertHistory(
        '0x1234567890abcdef1234567890abcdef12345678',
        { limit: '20' },
      );

      expect(alertService.getAlertHistory).toHaveBeenCalledWith(
        '0x1234567890abcdef1234567890abcdef12345678',
        20,
      );
    });

    it('잘못된 limit 값은 기본값 50으로 처리해야 한다', async () => {
      (alertService.getAlertHistory as jest.Mock).mockResolvedValue([]);

      await controller.getAlertHistory(
        '0x1234567890abcdef1234567890abcdef12345678',
        { limit: 'invalid' },
      );

      expect(alertService.getAlertHistory).toHaveBeenCalledWith(
        '0x1234567890abcdef1234567890abcdef12345678',
        50,
      );
    });
  });

  describe('PATCH /alerts/:alertId', () => {
    it('알림 수정을 서비스에 위임해야 한다', async () => {
      const updated = createAlertEntity({ targetValue: 120_000_000 });
      (alertService.updateAlert as jest.Mock).mockResolvedValue(updated);

      const result = await controller.updateAlert('alert-1', {
        targetValue: 120_000_000,
      });

      expect(alertService.updateAlert).toHaveBeenCalledWith('alert-1', {
        targetValue: 120_000_000,
      });
      expect(result).toBe(updated);
    });

    it('존재하지 않는 알림 수정 시 NotFoundException을 전파해야 한다', async () => {
      (alertService.updateAlert as jest.Mock).mockRejectedValue(
        new NotFoundException('알림을 찾을 수 없습니다'),
      );

      await expect(
        controller.updateAlert('nonexistent', { targetValue: 100 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('DELETE /alerts/item/:alertId', () => {
    it('알림 삭제를 서비스에 위임해야 한다', async () => {
      (alertService.deleteAlert as jest.Mock).mockResolvedValue(undefined);

      await controller.deleteAlert('alert-1');

      expect(alertService.deleteAlert).toHaveBeenCalledWith('alert-1');
    });

    it('존재하지 않는 알림 삭제 시 NotFoundException을 전파해야 한다', async () => {
      (alertService.deleteAlert as jest.Mock).mockRejectedValue(
        new NotFoundException('알림을 찾을 수 없습니다'),
      );

      await expect(controller.deleteAlert('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
