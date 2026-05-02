/**
 * SnapshotService 단위 테스트
 *
 * 모의 리포지토리를 사용하여 스냅샷 저장/조회 비즈니스 로직을 검증한다.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';

import { SnapshotService } from './snapshot.service';
import { PortfolioSnapshotEntity } from './entities/portfolio-snapshot.entity';
import { SnapshotHoldingEntity } from './entities/snapshot-holding.entity';
import { CreateSnapshotDto, CreateSnapshotHoldingDto } from './dto/create-snapshot.dto';

/** 스냅샷 테스트 픽스처 데이터 생성 */
function createTestDto(): CreateSnapshotDto {
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
  return dto;
}

/** 저장된 스냅샷 엔티티 픽스처 생성 */
function createSavedSnapshot(): PortfolioSnapshotEntity {
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

describe('SnapshotService', () => {
  let service: SnapshotService;
  let snapshotRepo: jest.Mocked<Partial<Repository<PortfolioSnapshotEntity>>>;
  let holdingRepo: jest.Mocked<Partial<Repository<SnapshotHoldingEntity>>>;

  beforeEach(async () => {
    // 모의 QueryBuilder 생성
    const mockQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getRawMany: jest.fn().mockResolvedValue([]),
    };

    snapshotRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    holdingRepo = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SnapshotService,
        {
          provide: getRepositoryToken(PortfolioSnapshotEntity),
          useValue: snapshotRepo,
        },
        {
          provide: getRepositoryToken(SnapshotHoldingEntity),
          useValue: holdingRepo,
        },
      ],
    }).compile();

    service = module.get<SnapshotService>(SnapshotService);
  });

  it('서비스 인스턴스가 정의되어 있어야 한다', () => {
    expect(service).toBeDefined();
  });

  describe('saveSnapshot', () => {
    it('스냅샷을 정상적으로 저장해야 한다', async () => {
      const dto = createTestDto();
      const savedSnapshot = createSavedSnapshot();

      (snapshotRepo.create as jest.Mock).mockReturnValue(savedSnapshot);
      (snapshotRepo.save as jest.Mock).mockResolvedValue(savedSnapshot);

      const result = await service.saveSnapshot(dto);

      expect(snapshotRepo.create).toHaveBeenCalledTimes(1);
      expect(snapshotRepo.save).toHaveBeenCalledTimes(1);
      expect(result.id).toBe('snapshot-uuid-1');
      expect(result.totalEvaluation).toBe(10000000);
      expect(result.holdings).toHaveLength(1);
    });

    it('지갑 주소를 소문자로 정규화하여 저장해야 한다', async () => {
      const dto = createTestDto();
      dto.walletAddress = '0x1234567890ABCDEF1234567890ABCDEF12345678';

      const savedSnapshot = createSavedSnapshot();
      (snapshotRepo.create as jest.Mock).mockReturnValue(savedSnapshot);
      (snapshotRepo.save as jest.Mock).mockResolvedValue(savedSnapshot);

      await service.saveSnapshot(dto);

      expect(snapshotRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        }),
      );
    });

    it('보유 코인 없이도 스냅샷을 저장할 수 있어야 한다', async () => {
      const dto = createTestDto();
      dto.holdings = [];

      const savedSnapshot = createSavedSnapshot();
      savedSnapshot.holdings = [];

      (snapshotRepo.create as jest.Mock).mockReturnValue(savedSnapshot);
      (snapshotRepo.save as jest.Mock).mockResolvedValue(savedSnapshot);

      const result = await service.saveSnapshot(dto);

      expect(result.holdings).toHaveLength(0);
    });

    it('여러 거래소의 보유 코인을 포함하여 저장할 수 있어야 한다', async () => {
      const dto = createTestDto();

      const ethHolding = new CreateSnapshotHoldingDto();
      ethHolding.symbol = 'ETH';
      ethHolding.exchange = 'bithumb';
      ethHolding.balance = 10;
      ethHolding.avgBuyPrice = 2500000;
      ethHolding.currentPrice = 3000000;
      ethHolding.evaluation = 30000000;

      dto.holdings.push(ethHolding);

      const savedSnapshot = createSavedSnapshot();
      const ethEntity = new SnapshotHoldingEntity();
      ethEntity.symbol = 'ETH';
      ethEntity.exchange = 'bithumb';
      savedSnapshot.holdings.push(ethEntity);

      (snapshotRepo.create as jest.Mock).mockReturnValue(savedSnapshot);
      (snapshotRepo.save as jest.Mock).mockResolvedValue(savedSnapshot);

      const result = await service.saveSnapshot(dto);

      expect(result.holdings).toHaveLength(2);
    });
  });

  describe('getSnapshots', () => {
    it('기간별 스냅샷 목록을 조회해야 한다', async () => {
      const snapshots = [createSavedSnapshot()];

      const qb = snapshotRepo.createQueryBuilder!('snapshot');
      (qb as any).getMany.mockResolvedValue(snapshots);

      const result = await service.getSnapshots(
        '0x1234567890abcdef1234567890abcdef12345678',
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result).toHaveLength(1);
      expect(snapshotRepo.createQueryBuilder).toHaveBeenCalledWith('snapshot');
    });

    it('지갑 주소를 소문자로 정규화하여 조회해야 한다', async () => {
      const qb = snapshotRepo.createQueryBuilder!('snapshot');
      (qb as any).getMany.mockResolvedValue([]);

      await service.getSnapshots(
        '0x1234567890ABCDEF1234567890ABCDEF12345678',
      );

      expect((qb as any).where).toHaveBeenCalledWith(
        'snapshot.walletAddress = :walletAddress',
        { walletAddress: '0x1234567890abcdef1234567890abcdef12345678' },
      );
    });

    it('시작/종료 시각 미지정 시 기본 30일 기간으로 조회해야 한다', async () => {
      const qb = snapshotRepo.createQueryBuilder!('snapshot');
      (qb as any).getMany.mockResolvedValue([]);

      await service.getSnapshots(
        '0x1234567890abcdef1234567890abcdef12345678',
      );

      // andWhere가 start와 end 조건으로 두 번 호출되어야 한다
      expect((qb as any).andWhere).toHaveBeenCalledTimes(2);
    });

    it('limit 파라미터가 있으면 결과 수를 제한해야 한다', async () => {
      const qb = snapshotRepo.createQueryBuilder!('snapshot');
      (qb as any).getMany.mockResolvedValue([]);

      await service.getSnapshots(
        '0x1234567890abcdef1234567890abcdef12345678',
        undefined,
        undefined,
        10,
      );

      expect((qb as any).take).toHaveBeenCalledWith(10);
    });
  });

  describe('getLatestSnapshot', () => {
    it('최신 스냅샷을 반환해야 한다', async () => {
      const snapshot = createSavedSnapshot();
      (snapshotRepo.findOne as jest.Mock).mockResolvedValue(snapshot);

      const result = await service.getLatestSnapshot(
        '0x1234567890abcdef1234567890abcdef12345678',
      );

      expect(result).toBeDefined();
      expect(result!.id).toBe('snapshot-uuid-1');
      expect(snapshotRepo.findOne).toHaveBeenCalledWith({
        where: { walletAddress: '0x1234567890abcdef1234567890abcdef12345678' },
        order: { createdAt: 'DESC' },
        relations: ['holdings'],
      });
    });

    it('스냅샷이 없으면 null을 반환해야 한다', async () => {
      (snapshotRepo.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.getLatestSnapshot(
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      );

      expect(result).toBeNull();
    });

    it('지갑 주소를 소문자로 정규화하여 조회해야 한다', async () => {
      (snapshotRepo.findOne as jest.Mock).mockResolvedValue(null);

      await service.getLatestSnapshot(
        '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      );

      expect(snapshotRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { walletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
        }),
      );
    });
  });

  describe('aggregateSnapshots', () => {
    it('일별 집계 결과를 반환해야 한다', async () => {
      const rawResults = [
        {
          period_key: '2026-01-15',
          period_start: '2026-01-15 10:00:00',
          period_end: '2026-01-15 22:00:00',
          avg_total_evaluation: '10500000',
          max_total_evaluation: '11000000',
          min_total_evaluation: '10000000',
          snapshot_count: '5',
        },
      ];

      const qb = snapshotRepo.createQueryBuilder!('snapshot');
      (qb as any).getRawMany.mockResolvedValue(rawResults);

      const result = await service.aggregateSnapshots(
        '0x1234567890abcdef1234567890abcdef12345678',
        'daily',
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result).toHaveLength(1);
      expect(result[0]!.avgTotalEvaluation).toBe(10500000);
      expect(result[0]!.maxTotalEvaluation).toBe(11000000);
      expect(result[0]!.minTotalEvaluation).toBe(10000000);
      expect(result[0]!.snapshotCount).toBe(5);
    });

    it('시간별 집계 간격을 지원해야 한다', async () => {
      const qb = snapshotRepo.createQueryBuilder!('snapshot');
      (qb as any).getRawMany.mockResolvedValue([]);

      await service.aggregateSnapshots(
        '0x1234567890abcdef1234567890abcdef12345678',
        'hourly',
      );

      expect((qb as any).select).toHaveBeenCalled();
    });

    it('주별 집계 간격을 지원해야 한다', async () => {
      const qb = snapshotRepo.createQueryBuilder!('snapshot');
      (qb as any).getRawMany.mockResolvedValue([]);

      await service.aggregateSnapshots(
        '0x1234567890abcdef1234567890abcdef12345678',
        'weekly',
      );

      expect((qb as any).select).toHaveBeenCalled();
    });

    it('월별 집계 간격을 지원해야 한다', async () => {
      const qb = snapshotRepo.createQueryBuilder!('snapshot');
      (qb as any).getRawMany.mockResolvedValue([]);

      await service.aggregateSnapshots(
        '0x1234567890abcdef1234567890abcdef12345678',
        'monthly',
      );

      expect((qb as any).select).toHaveBeenCalled();
    });

    it('데이터가 없으면 빈 배열을 반환해야 한다', async () => {
      const qb = snapshotRepo.createQueryBuilder!('snapshot');
      (qb as any).getRawMany.mockResolvedValue([]);

      const result = await service.aggregateSnapshots(
        '0x1234567890abcdef1234567890abcdef12345678',
        'daily',
      );

      expect(result).toHaveLength(0);
    });
  });
});
