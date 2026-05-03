/**
 * TelegramController 단위 테스트
 *
 * 텔레그램 컨트롤러의 각 엔드포인트를 검증한다:
 * - 웹훅 수신
 * - 연결 상태 조회
 * - 연결 해제
 * - 연결 링크 생성
 * - 테스트 알림 전송
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';

import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { TelegramConnectionEntity } from './entities/telegram-connection.entity';

describe('TelegramController', () => {
  let controller: TelegramController;
  let telegramService: jest.Mocked<TelegramService>;

  const mockTelegramService = {
    isEnabled: jest.fn(),
    sendMessage: jest.fn(),
    handleWebhook: jest.fn(),
    getConnection: jest.fn(),
    disconnect: jest.fn(),
    generateVerificationCode: jest.fn(),
    getBotLink: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TelegramController],
      providers: [
        {
          provide: TelegramService,
          useValue: mockTelegramService,
        },
      ],
    }).compile();

    controller = module.get<TelegramController>(TelegramController);
    telegramService = module.get(TelegramService);
  });

  describe('handleWebhook', () => {
    it('웹훅을 처리하고 ok: true를 반환한다', async () => {
      const update = { message: { text: '/start', chat: { id: 123 } } };
      mockTelegramService.handleWebhook.mockResolvedValue(undefined);

      const result = await controller.handleWebhook(update);

      expect(result).toEqual({ ok: true });
      expect(mockTelegramService.handleWebhook).toHaveBeenCalledWith(update);
    });

    it('웹훅 처리 오류 시에도 ok: true를 반환한다', async () => {
      mockTelegramService.handleWebhook.mockRejectedValue(
        new Error('처리 오류'),
      );

      const result = await controller.handleWebhook({});

      expect(result).toEqual({ ok: true });
    });
  });

  describe('getStatus', () => {
    it('연결된 상태를 반환한다', async () => {
      mockTelegramService.isEnabled.mockReturnValue(true);
      mockTelegramService.getConnection.mockResolvedValue({
        id: 'uuid-1',
        walletAddress: '0xabc',
        chatId: '123',
        username: 'testuser',
        isActive: true,
      } as TelegramConnectionEntity);

      const result = await controller.getStatus('0xabc');

      expect(result).toEqual({
        connected: true,
        username: 'testuser',
        isActive: true,
        enabled: true,
      });
    });

    it('미연결 상태를 반환한다', async () => {
      mockTelegramService.isEnabled.mockReturnValue(true);
      mockTelegramService.getConnection.mockResolvedValue(null);

      const result = await controller.getStatus('0xabc');

      expect(result).toEqual({
        connected: false,
        username: null,
        isActive: false,
        enabled: true,
      });
    });
  });

  describe('disconnect', () => {
    it('연결 해제에 성공한다', async () => {
      mockTelegramService.disconnect.mockResolvedValue(true);

      await expect(controller.disconnect('0xabc')).resolves.toBeUndefined();
    });

    it('연결이 없으면 NotFoundException을 던진다', async () => {
      mockTelegramService.disconnect.mockResolvedValue(false);

      await expect(controller.disconnect('0xabc')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getConnectLink', () => {
    it('인증 코드와 봇 링크를 반환한다', () => {
      mockTelegramService.generateVerificationCode.mockReturnValue('ABC123');
      mockTelegramService.getBotLink.mockReturnValue(
        'https://t.me/TestBot',
      );

      const result = controller.getConnectLink('0xabc');

      expect(result).toEqual({
        verificationCode: 'ABC123',
        botLink: 'https://t.me/TestBot',
        botUsername: 'TestBot',
        expiresInSeconds: 300,
      });
    });
  });

  describe('sendTestMessage', () => {
    it('테스트 메시지를 전송한다', async () => {
      mockTelegramService.getConnection.mockResolvedValue({
        id: 'uuid-1',
        chatId: '123',
        isActive: true,
      } as TelegramConnectionEntity);
      mockTelegramService.sendMessage.mockResolvedValue(true);

      const result = await controller.sendTestMessage('0xabc');

      expect(result).toEqual({ sent: true });
      expect(mockTelegramService.sendMessage).toHaveBeenCalled();
    });

    it('연결이 없으면 NotFoundException을 던진다', async () => {
      mockTelegramService.getConnection.mockResolvedValue(null);

      await expect(controller.sendTestMessage('0xabc')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
