/**
 * SnapshotController 단위 테스트
 *
 * 모의 SnapshotService를 사용하여 컨트롤러의
 * 요청 라우팅 및 응답 변환을 검증한다.
 */

import { Test, TestingModule } from '@nestjs/testing';

import { SnapshotController } from './snapshot.controller';
import { SnapshotService, AggregatedSnapshotResult } from './snapshot.service';
import { CreateSnapshotDto, CreateSnapshotHoldingDto } from './dto/create-snapshot.dto';
import { QuerySnapshotDto } from './dto/query-snapshot.dto';
import { PortfolioSnapshotEntity } from './entities/portfolio-snapshot.entity';
import { SnapshotHoldingEntity } from './entities/snapshot-holding.entity';

/** 스냅샷 엔티티 픽스처 생성 */
function createMockSnapshot(): PortfolioSnapshotEntity {
  const snapshot = new PortfolioSnapshotEntity();
  snapshot.id = 'snapshot-uuid-1';
  snapshot.walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
  snapshot.createdAt = new Date('2026-01-15T10:00:00Z');
  snapshot.totalEvaluation = 10000000;
  snapshot.totalInvestment = 8000000;
  snapshot.totalProfitLoss = 2000000;
  snapshot.profitLossRate = 25.0;

  const holding = new SnapshotHoldingEntity();
  holding.id = 'holding-uuid-1';
  holding.snapshotId = 'snapshot-uuid-1';
  holding.symbol = 'BTC';
  holding.exchange = 'upbit';
  holding.balance = 0.5;
  holding.avgBuyPrice = 50000000;
  holding.currentPrice = 55000000;
  holding.evaluation = 27500000;

  snapshot.holdings = [holding];
  return snapshot;
}

describe('SnapshotController', () => {
  let controller: SnapshotController;
  let service: jest.Mocked<SnapshotService>;

  beforeEach(async () => {
    const mockService = {
      saveSnapshot: jest.fn(),
      getSnapshots: jest.fn(),
      getLatestSnapshot: jest.fn(),
      aggregateSnapshots: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SnapshotController],
      providers: [
        {
          provide: SnapshotService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<SnapshotController>(SnapshotController);
    service = module.get(SnapshotService);
  });

  it('컨트롤러 인스턴스가 정의되어 있어야 한다', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /snapshots', () => {
    it('스냅샷을 생성하고 저장된 엔티티를 반환해야 한다', async () => {
      const dto = new CreateSnapshotDto();
      dto.walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
      dto.totalEvaluation = 10000000;
      dto.totalInvestment = 8000000;
      dto.totalProfitLoss = 2000000;
      dto.profitLossRate = 25.0;
      dto.holdings = [];

      const savedSnapshot = createMockSnapshot();
      savedSnapshot.holdings = [];
      service.saveSnapshot.mockResolvedValue(savedSnapshot);

      const result = await controller.createSnapshot(dto);

      expect(service.saveSnapshot).toHaveBeenCalledWith(dto);
      expect(result.id).toBe('snapshot-uuid-1');
    });

    it('보유 코인을 포함한 스냅샷을 생성할 수 있어야 한다', async () => {
      const dto = new CreateSnapshotDto();
      dto.walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
      dto.totalEvaluation = 10000000;
      dto.totalInvestment = 8000000;
      dto.totalProfitLoss = 2000000;
      dto.profitLossRate = 25.0;

      const holding = new CreateSnapshotHoldingDto();
      holding.symbol = 'BTC';
      holding.exchange = 'upbit';
      holding.balance = 0.5;
      holding.avgBuyPrice = 50000000;
      holding.currentPrice = 55000000;
      holding.evaluation = 27500000;
      dto.holdings = [holding];

      const savedSnapshot = createMockSnapshot();
      service.saveSnapshot.mockResolvedValue(savedSnapshot);

      const result = await controller.createSnapshot(dto);

      expect(result.holdings).toHaveLength(1);
      expect(result.holdings[0]!.symbol).toBe('BTC');
    });
  });

  describe('GET /snapshots/:walletAddress', () => {
    it('기간별 스냅샷 목록을 반환해야 한다', async () => {
      const snapshots = [createMockSnapshot()];
      service.getSnapshots.mockResolvedValue(snapshots);

      const query = new QuerySnapshotDto();
      query.start = '2026-01-01T00:00:00Z';
      query.end = '2026-01-31T23:59:59Z';

      const result = await controller.getSnapshots(
        '0x1234567890abcdef1234567890abcdef12345678',
        query,
      );

      expect(service.getSnapshots).toHaveBeenCalledWith(
        '0x1234567890abcdef1234567890abcdef12345678',
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-01-31T23:59:59Z'),
        undefined,
      );
      expect(result).toHaveLength(1);
    });

    it('interval 파라미터가 있으면 집계 결과를 반환해야 한다', async () => {
      const aggregated: AggregatedSnapshotResult[] = [
        {
          periodStart: new Date('2026-01-15'),
          periodEnd: new Date('2026-01-15'),
          avgTotalEvaluation: 10500000,
          maxTotalEvaluation: 11000000,
          minTotalEvaluation: 10000000,
          snapshotCount: 5,
        },
      ];
      service.aggregateSnapshots.mockResolvedValue(aggregated);

      const query = new QuerySnapshotDto();
      query.interval = 'daily';
      query.start = '2026-01-01T00:00:00Z';
      query.end = '2026-01-31T23:59:59Z';

      const result = await controller.getSnapshots(
        '0x1234567890abcdef1234567890abcdef12345678',
        query,
      );

      expect(service.aggregateSnapshots).toHaveBeenCalledWith(
        '0x1234567890abcdef1234567890abcdef12345678',
        'daily',
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-01-31T23:59:59Z'),
      );
      expect(result).toHaveLength(1);
    });

    it('limit 파라미터를 숫자로 변환하여 전달해야 한다', async () => {
      service.getSnapshots.mockResolvedValue([]);

      const query = new QuerySnapshotDto();
      query.limit = '50';

      await controller.getSnapshots(
        '0x1234567890abcdef1234567890abcdef12345678',
        query,
      );

      expect(service.getSnapshots).toHaveBeenCalledWith(
        '0x1234567890abcdef1234567890abcdef12345678',
        undefined,
        undefined,
        50,
      );
    });

    it('쿼리 파라미터 없이도 조회할 수 있어야 한다', async () => {
      service.getSnapshots.mockResolvedValue([]);

      const query = new QuerySnapshotDto();

      await controller.getSnapshots(
        '0x1234567890abcdef1234567890abcdef12345678',
        query,
      );

      expect(service.getSnapshots).toHaveBeenCalledWith(
        '0x1234567890abcdef1234567890abcdef12345678',
        undefined,
        undefined,
        undefined,
      );
    });
  });

  describe('GET /snapshots/:walletAddress/latest', () => {
    it('최신 스냅샷을 반환해야 한다', async () => {
      const snapshot = createMockSnapshot();
      service.getLatestSnapshot.mockResolvedValue(snapshot);

      const result = await controller.getLatestSnapshot(
        '0x1234567890abcdef1234567890abcdef12345678',
      );

      expect(service.getLatestSnapshot).toHaveBeenCalledWith(
        '0x1234567890abcdef1234567890abcdef12345678',
      );
      expect(result).toBeDefined();
      expect(result!.id).toBe('snapshot-uuid-1');
    });

    it('스냅샷이 없으면 null을 반환해야 한다', async () => {
      service.getLatestSnapshot.mockResolvedValue(null);

      const result = await controller.getLatestSnapshot(
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      );

      expect(result).toBeNull();
    });
  });
});
