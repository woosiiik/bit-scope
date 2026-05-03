/**
 * TelegramService 단위 테스트
 *
 * 텔레그램 봇 서비스의 핵심 로직을 검증한다:
 * - 인증 코드 생성 및 만료 처리
 * - 웹훅 처리 (연결 생성)
 * - 연결 조회 및 해제
 * - 메시지 전송 (BOT_TOKEN 미설정 시 비활성화)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TelegramService } from './telegram.service';
import { TelegramConnectionEntity } from './entities/telegram-connection.entity';

describe('TelegramService', () => {
  let service: TelegramService;
  let repository: jest.Mocked<Repository<TelegramConnectionEntity>>;
  let configService: jest.Mocked<ConfigService>;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // 기본적으로 BOT_TOKEN이 설정된 상태로 초기화
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'TELEGRAM_BOT_TOKEN') return 'test-bot-token';
      if (key === 'TELEGRAM_BOT_USERNAME') return 'TestBot';
      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramService,
        {
          provide: getRepositoryToken(TelegramConnectionEntity),
          useValue: mockRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<TelegramService>(TelegramService);
    repository = module.get(getRepositoryToken(TelegramConnectionEntity));
    configService = module.get(ConfigService);
  });

  describe('isEnabled', () => {
    it('BOT_TOKEN이 설정되어 있으면 true를 반환한다', () => {
      expect(service.isEnabled()).toBe(true);
    });

    it('BOT_TOKEN이 미설정이면 false를 반환한다', async () => {
      mockConfigService.get.mockImplementation(() => undefined);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TelegramService,
          {
            provide: getRepositoryToken(TelegramConnectionEntity),
            useValue: mockRepository,
          },
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const disabledService = module.get<TelegramService>(TelegramService);
      expect(disabledService.isEnabled()).toBe(false);
    });
  });

  describe('generateVerificationCode', () => {
    it('6자리 인증 코드를 생성한다', () => {
      const code = service.generateVerificationCode('0xabc123');
      expect(code).toHaveLength(6);
      expect(/^[A-Z2-9]+$/.test(code)).toBe(true);
    });

    it('동일 지갑의 이전 코드를 제거하고 새 코드를 생성한다', () => {
      const code1 = service.generateVerificationCode('0xabc123');
      const code2 = service.generateVerificationCode('0xabc123');

      expect(code1).not.toBe(code2);
    });

    it('서로 다른 지갑의 코드는 독립적이다', () => {
      const code1 = service.generateVerificationCode('0xabc123');
      const code2 = service.generateVerificationCode('0xdef456');

      expect(code1).not.toBe(code2);
    });
  });

  describe('getConnection', () => {
    it('연결 정보가 있으면 엔티티를 반환한다', async () => {
      const mockConnection = {
        id: 'uuid-1',
        walletAddress: '0xabc123',
        chatId: '12345',
        username: 'testuser',
        isActive: true,
      } as TelegramConnectionEntity;

      mockRepository.findOne.mockResolvedValue(mockConnection);

      const result = await service.getConnection('0xABC123');

      expect(result).toBe(mockConnection);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { walletAddress: '0xabc123' },
      });
    });

    it('연결 정보가 없으면 null을 반환한다', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getConnection('0xnoexist');

      expect(result).toBeNull();
    });
  });

  describe('disconnect', () => {
    it('연결이 있으면 제거하고 true를 반환한다', async () => {
      const mockConnection = {
        id: 'uuid-1',
        walletAddress: '0xabc123',
      } as TelegramConnectionEntity;

      mockRepository.findOne.mockResolvedValue(mockConnection);
      mockRepository.remove.mockResolvedValue(mockConnection);

      const result = await service.disconnect('0xabc123');

      expect(result).toBe(true);
      expect(mockRepository.remove).toHaveBeenCalledWith(mockConnection);
    });

    it('연결이 없으면 false를 반환한다', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.disconnect('0xnoexist');

      expect(result).toBe(false);
      expect(mockRepository.remove).not.toHaveBeenCalled();
    });
  });

  describe('getBotLink', () => {
    it('봇 사용자명이 있으면 딥링크를 반환한다', () => {
      const link = service.getBotLink();
      expect(link).toBe('https://t.me/TestBot');
    });
  });

  describe('sendMessage', () => {
    it('BOT_TOKEN이 없으면 false를 반환한다', async () => {
      mockConfigService.get.mockImplementation(() => undefined);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TelegramService,
          {
            provide: getRepositoryToken(TelegramConnectionEntity),
            useValue: mockRepository,
          },
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const disabledService = module.get<TelegramService>(TelegramService);
      const result = await disabledService.sendMessage('123', 'test');
      expect(result).toBe(false);
    });
  });

  describe('handleWebhook', () => {
    it('메시지가 없는 업데이트는 무시한다', async () => {
      await service.handleWebhook({});
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('/start만 전송하면 안내 메시지를 반환한다', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

      await service.handleWebhook({
        message: {
          text: '/start',
          chat: { id: 12345 },
          from: { username: 'user1' },
        },
      });

      expect(fetchSpy).toHaveBeenCalled();
      expect(mockRepository.save).not.toHaveBeenCalled();

      fetchSpy.mockRestore();
    });

    it('/start 인증코드로 연결을 생성한다', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

      // 먼저 인증 코드 생성
      const code = service.generateVerificationCode('0xabc123');

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue({
        walletAddress: '0xabc123',
        chatId: '12345',
        username: 'user1',
        isActive: true,
      } as TelegramConnectionEntity);
      mockRepository.save.mockResolvedValue({
        id: 'uuid-1',
        walletAddress: '0xabc123',
        chatId: '12345',
        username: 'user1',
        isActive: true,
      } as TelegramConnectionEntity);

      await service.handleWebhook({
        message: {
          text: `/start ${code}`,
          chat: { id: 12345 },
          from: { username: 'user1' },
        },
      });

      expect(mockRepository.create).toHaveBeenCalledWith({
        walletAddress: '0xabc123',
        chatId: '12345',
        username: 'user1',
        isActive: true,
      });
      expect(mockRepository.save).toHaveBeenCalled();

      fetchSpy.mockRestore();
    });

    it('유효하지 않은 인증 코드는 오류 메시지를 전송한다', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

      await service.handleWebhook({
        message: {
          text: '/start INVALID',
          chat: { id: 12345 },
          from: { username: 'user1' },
        },
      });

      expect(mockRepository.save).not.toHaveBeenCalled();
      // fetch should be called to send the error message
      expect(fetchSpy).toHaveBeenCalled();

      fetchSpy.mockRestore();
    });
  });
});
