/**
 * ReportService 단위 테스트
 *
 * 모의 리포지토리와 SnapshotService를 사용하여
 * 리포트 생성, 조회, 스케줄 관리, 데이터 내보내기
 * 비즈니스 로직을 검증한다.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';

import { ReportService } from './report.service';
import { ReportEntity } from './entities/report.entity';
import { ReportScheduleEntity } from './entities/report-schedule.entity';
import { SnapshotService } from '../snapshot/snapshot.service';
import { PortfolioSnapshotEntity } from '../snapshot/entities/portfolio-snapshot.entity';
import { SnapshotHoldingEntity } from '../snapshot/entities/snapshot-holding.entity';
import { CreateReportDto } from './dto/create-report.dto';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';

/** 테스트용 스냅샷 엔티티 생성 */
function createTestSnapshot(): PortfolioSnapshotEntity {
  const snapshot = new PortfolioSnapshotEntity();
  snapshot.id = 'snapshot-uuid-1';
  snapshot.walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
  snapshot.createdAt = new Date('2026-01-15T10:00:00Z');
  snapshot.totalEvaluation = 10000000;
  snapshot.totalInvestment = 8000000;
  snapshot.totalProfitLoss = 2000000;
  snapshot.profitLossRate = 25.0;

  const btcHolding = new SnapshotHoldingEntity();
  btcHolding.id = 'holding-uuid-1';
  btcHolding.snapshotId = 'snapshot-uuid-1';
  btcHolding.symbol = 'BTC';
  btcHolding.exchange = 'upbit';
  btcHolding.balance = 0.5;
  btcHolding.avgBuyPrice = 50000000;
  btcHolding.currentPrice = 55000000;
  btcHolding.evaluation = 27500000;

  const ethHolding = new SnapshotHoldingEntity();
  ethHolding.id = 'holding-uuid-2';
  ethHolding.snapshotId = 'snapshot-uuid-1';
  ethHolding.symbol = 'ETH';
  ethHolding.exchange = 'bithumb';
  ethHolding.balance = 5;
  ethHolding.avgBuyPrice = 3000000;
  ethHolding.currentPrice = 2800000;
  ethHolding.evaluation = 14000000;

  snapshot.holdings = [btcHolding, ethHolding];
  return snapshot;
}

/** 테스트용 리포트 엔티티 생성 */
function createTestReport(): ReportEntity {
  const report = new ReportEntity();
  report.id = 'report-uuid-1';
  report.walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
  report.type = 'weekly';
  report.generatedAt = new Date('2026-01-08T09:00:00Z');
  report.periodStart = new Date('2026-01-01T00:00:00Z');
  report.periodEnd = new Date('2026-01-08T00:00:00Z');
  report.summary = {
    totalEvaluation: 9500000,
    evaluationChange: 0,
    evaluationChangeRate: 0,
    topGainers: [],
    topLosers: [],
    newCoins: ['BTC', 'ETH'],
    removedCoins: [],
  };
  report.data = {
    walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
    totalEvaluation: 9500000,
    totalInvestment: 8000000,
    holdings: [
      { symbol: 'BTC', exchange: 'upbit', balance: 0.5 },
      { symbol: 'ETH', exchange: 'bithumb', balance: 5 },
    ],
  };
  return report;
}

/** 테스트용 스케줄 엔티티 생성 */
function createTestSchedule(): ReportScheduleEntity {
  const schedule = new ReportScheduleEntity();
  schedule.id = 'schedule-uuid-1';
  schedule.walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
  schedule.type = 'weekly';
  schedule.isActive = true;
  schedule.cronExpression = '0 9 * * 1';
  schedule.nextRunAt = new Date('2026-01-20T09:00:00Z');
  schedule.createdAt = new Date('2026-01-13T10:00:00Z');
  schedule.updatedAt = new Date('2026-01-13T10:00:00Z');
  return schedule;
}

describe('ReportService', () => {
  let service: ReportService;
  let reportRepo: jest.Mocked<Partial<Repository<ReportEntity>>>;
  let scheduleRepo: jest.Mocked<Partial<Repository<ReportScheduleEntity>>>;
  let snapshotService: jest.Mocked<Partial<SnapshotService>>;

  beforeEach(async () => {
    // 모의 QueryBuilder 생성
    const mockReportQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    reportRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockReportQueryBuilder),
    };

    scheduleRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      remove: jest.fn(),
    };

    snapshotService = {
      getSnapshots: jest.fn().mockResolvedValue([]),
      getLatestSnapshot: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportService,
        {
          provide: getRepositoryToken(ReportEntity),
          useValue: reportRepo,
        },
        {
          provide: getRepositoryToken(ReportScheduleEntity),
          useValue: scheduleRepo,
        },
        {
          provide: SnapshotService,
          useValue: snapshotService,
        },
      ],
    }).compile();

    service = module.get<ReportService>(ReportService);
  });

  it('서비스 인스턴스가 정의되어 있어야 한다', () => {
    expect(service).toBeDefined();
  });

  // ========== 리포트 생성 ==========

  describe('generateReport', () => {
    it('스냅샷 데이터를 기반으로 리포트를 생성해야 한다', async () => {
      const dto = new CreateReportDto();
      dto.walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
      dto.type = 'weekly';

      const snapshot = createTestSnapshot();
      (snapshotService.getSnapshots as jest.Mock).mockResolvedValue([snapshot]);
      (reportRepo.findOne as jest.Mock).mockResolvedValue(null);

      const savedReport = createTestReport();
      (reportRepo.create as jest.Mock).mockReturnValue(savedReport);
      (reportRepo.save as jest.Mock).mockResolvedValue(savedReport);

      const result = await service.generateReport(dto);

      expect(reportRepo.create).toHaveBeenCalledTimes(1);
      expect(reportRepo.save).toHaveBeenCalledTimes(1);
      expect(result.id).toBe('report-uuid-1');
      expect(result.type).toBe('weekly');
    });

    it('지갑 주소를 소문자로 정규화하여 생성해야 한다', async () => {
      const dto = new CreateReportDto();
      dto.walletAddress = '0x1234567890ABCDEF1234567890ABCDEF12345678';
      dto.type = 'daily';

      const savedReport = createTestReport();
      (reportRepo.create as jest.Mock).mockReturnValue(savedReport);
      (reportRepo.save as jest.Mock).mockResolvedValue(savedReport);
      (reportRepo.findOne as jest.Mock).mockResolvedValue(null);

      await service.generateReport(dto);

      expect(snapshotService.getSnapshots).toHaveBeenCalledWith(
        '0x1234567890abcdef1234567890abcdef12345678',
        expect.any(Date),
        expect.any(Date),
      );
    });

    it('스냅샷이 없어도 빈 리포트를 생성해야 한다', async () => {
      const dto = new CreateReportDto();
      dto.walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
      dto.type = 'daily';

      (snapshotService.getSnapshots as jest.Mock).mockResolvedValue([]);
      (reportRepo.findOne as jest.Mock).mockResolvedValue(null);

      const savedReport = createTestReport();
      (reportRepo.create as jest.Mock).mockReturnValue(savedReport);
      (reportRepo.save as jest.Mock).mockResolvedValue(savedReport);

      await service.generateReport(dto);

      expect(reportRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalEvaluation: 0,
            holdings: [],
          }),
        }),
      );
    });

    it('이전 리포트 대비 변동 사항을 포함해야 한다', async () => {
      const dto = new CreateReportDto();
      dto.walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
      dto.type = 'weekly';

      const snapshot = createTestSnapshot();
      (snapshotService.getSnapshots as jest.Mock).mockResolvedValue([snapshot]);

      // 이전 리포트 (BTC만 보유)
      const previousReport = createTestReport();
      previousReport.data = {
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        totalEvaluation: 9500000,
        holdings: [
          { symbol: 'BTC', exchange: 'upbit', balance: 0.5 },
        ],
      };
      (reportRepo.findOne as jest.Mock).mockResolvedValue(previousReport);

      const savedReport = createTestReport();
      (reportRepo.create as jest.Mock).mockReturnValue(savedReport);
      (reportRepo.save as jest.Mock).mockResolvedValue(savedReport);

      await service.generateReport(dto);

      // create에 전달된 인자 중 summary를 검증
      const createCall = (reportRepo.create as jest.Mock).mock.calls[0]![0];
      expect(createCall.summary).toBeDefined();
      // ETH는 이전에 없었으므로 newCoins에 포함되어야 한다
      expect(createCall.summary.newCoins).toContain('ETH');
    });

    it('custom 유형은 사용자 지정 기간을 사용해야 한다', async () => {
      const dto = new CreateReportDto();
      dto.walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
      dto.type = 'custom';
      dto.periodStart = '2026-01-01T00:00:00Z';
      dto.periodEnd = '2026-01-15T00:00:00Z';

      const savedReport = createTestReport();
      (reportRepo.create as jest.Mock).mockReturnValue(savedReport);
      (reportRepo.save as jest.Mock).mockResolvedValue(savedReport);
      (reportRepo.findOne as jest.Mock).mockResolvedValue(null);

      await service.generateReport(dto);

      expect(snapshotService.getSnapshots).toHaveBeenCalledWith(
        expect.any(String),
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-01-15T00:00:00Z'),
      );
    });

    it('custom 유형에서 기간이 없으면 예외를 발생시켜야 한다', async () => {
      const dto = new CreateReportDto();
      dto.walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
      dto.type = 'custom';

      await expect(service.generateReport(dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ========== 리포트 조회 ==========

  describe('getReport', () => {
    it('리포트를 ID로 조회해야 한다', async () => {
      const report = createTestReport();
      (reportRepo.findOne as jest.Mock).mockResolvedValue(report);

      const result = await service.getReport('report-uuid-1');

      expect(result.id).toBe('report-uuid-1');
      expect(reportRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'report-uuid-1' },
      });
    });

    it('존재하지 않는 리포트 조회 시 NotFoundException을 발생시켜야 한다', async () => {
      (reportRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.getReport('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getReportHistory', () => {
    it('지갑 주소별 리포트 이력을 조회해야 한다', async () => {
      const reports = [createTestReport()];
      const qb = (reportRepo.createQueryBuilder as jest.Mock)();
      qb.getMany.mockResolvedValue(reports);

      const result = await service.getReportHistory(
        '0x1234567890abcdef1234567890abcdef12345678',
      );

      expect(result).toHaveLength(1);
      expect(reportRepo.createQueryBuilder).toHaveBeenCalledWith('report');
    });

    it('지갑 주소를 소문자로 정규화하여 조회해야 한다', async () => {
      const qb = (reportRepo.createQueryBuilder as jest.Mock)();
      qb.getMany.mockResolvedValue([]);

      await service.getReportHistory(
        '0x1234567890ABCDEF1234567890ABCDEF12345678',
      );

      expect(qb.where).toHaveBeenCalledWith(
        'report.walletAddress = :walletAddress',
        { walletAddress: '0x1234567890abcdef1234567890abcdef12345678' },
      );
    });

    it('유형 필터를 적용하여 조회할 수 있어야 한다', async () => {
      const qb = (reportRepo.createQueryBuilder as jest.Mock)();
      qb.getMany.mockResolvedValue([]);

      await service.getReportHistory(
        '0x1234567890abcdef1234567890abcdef12345678',
        'weekly',
      );

      expect(qb.andWhere).toHaveBeenCalledWith('report.type = :type', {
        type: 'weekly',
      });
    });

    it('limit 파라미터로 결과 수를 제한해야 한다', async () => {
      const qb = (reportRepo.createQueryBuilder as jest.Mock)();
      qb.getMany.mockResolvedValue([]);

      await service.getReportHistory(
        '0x1234567890abcdef1234567890abcdef12345678',
        undefined,
        5,
      );

      expect(qb.take).toHaveBeenCalledWith(5);
    });
  });

  // ========== 정기 리포트 스케줄 ==========

  describe('createSchedule', () => {
    it('정기 리포트 스케줄을 생성해야 한다', async () => {
      const dto = new CreateScheduleDto();
      dto.walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
      dto.type = 'weekly';

      (scheduleRepo.findOne as jest.Mock).mockResolvedValue(null);

      const savedSchedule = createTestSchedule();
      (scheduleRepo.create as jest.Mock).mockReturnValue(savedSchedule);
      (scheduleRepo.save as jest.Mock).mockResolvedValue(savedSchedule);

      const result = await service.createSchedule(dto);

      expect(scheduleRepo.create).toHaveBeenCalledTimes(1);
      expect(scheduleRepo.save).toHaveBeenCalledTimes(1);
      expect(result.type).toBe('weekly');
      expect(result.isActive).toBe(true);
    });

    it('동일 유형의 활성 스케줄이 있으면 예외를 발생시켜야 한다', async () => {
      const dto = new CreateScheduleDto();
      dto.walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
      dto.type = 'weekly';

      const existingSchedule = createTestSchedule();
      (scheduleRepo.findOne as jest.Mock).mockResolvedValue(existingSchedule);

      await expect(service.createSchedule(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('지갑 주소를 소문자로 정규화해야 한다', async () => {
      const dto = new CreateScheduleDto();
      dto.walletAddress = '0x1234567890ABCDEF1234567890ABCDEF12345678';
      dto.type = 'daily';

      (scheduleRepo.findOne as jest.Mock).mockResolvedValue(null);

      const savedSchedule = createTestSchedule();
      (scheduleRepo.create as jest.Mock).mockReturnValue(savedSchedule);
      (scheduleRepo.save as jest.Mock).mockResolvedValue(savedSchedule);

      await service.createSchedule(dto);

      expect(scheduleRepo.findOne).toHaveBeenCalledWith({
        where: {
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          type: 'daily',
          isActive: true,
        },
      });
    });
  });

  describe('updateSchedule', () => {
    it('스케줄을 수정해야 한다', async () => {
      const dto = new UpdateScheduleDto();
      dto.isActive = false;

      const schedule = createTestSchedule();
      (scheduleRepo.findOne as jest.Mock).mockResolvedValue(schedule);
      (scheduleRepo.save as jest.Mock).mockResolvedValue({
        ...schedule,
        isActive: false,
      });

      const result = await service.updateSchedule('schedule-uuid-1', dto);

      expect(result.isActive).toBe(false);
    });

    it('유형 변경 시 cron 표현식과 다음 실행 시각을 갱신해야 한다', async () => {
      const dto = new UpdateScheduleDto();
      dto.type = 'monthly';

      const schedule = createTestSchedule();
      (scheduleRepo.findOne as jest.Mock).mockResolvedValue(schedule);
      (scheduleRepo.save as jest.Mock).mockImplementation(async (s) => s);

      const result = await service.updateSchedule('schedule-uuid-1', dto);

      expect(result.type).toBe('monthly');
      expect(result.cronExpression).toBe('0 9 1 * *');
    });

    it('존재하지 않는 스케줄 수정 시 NotFoundException을 발생시켜야 한다', async () => {
      (scheduleRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateSchedule('non-existent', new UpdateScheduleDto()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelSchedule', () => {
    it('스케줄을 삭제해야 한다', async () => {
      const schedule = createTestSchedule();
      (scheduleRepo.findOne as jest.Mock).mockResolvedValue(schedule);
      (scheduleRepo.remove as jest.Mock).mockResolvedValue(schedule);

      await service.cancelSchedule('schedule-uuid-1');

      expect(scheduleRepo.remove).toHaveBeenCalledWith(schedule);
    });

    it('존재하지 않는 스케줄 삭제 시 NotFoundException을 발생시켜야 한다', async () => {
      (scheduleRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.cancelSchedule('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getSchedules', () => {
    it('지갑 주소별 스케줄 목록을 조회해야 한다', async () => {
      const schedules = [createTestSchedule()];
      (scheduleRepo.find as jest.Mock).mockResolvedValue(schedules);

      const result = await service.getSchedules(
        '0x1234567890abcdef1234567890abcdef12345678',
      );

      expect(result).toHaveLength(1);
      expect(scheduleRepo.find).toHaveBeenCalledWith({
        where: {
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        },
        order: { createdAt: 'DESC' },
      });
    });
  });

  // ========== 정기 리포트 cron 실행 ==========

  describe('processScheduledReports', () => {
    it('실행 시점이 도래한 스케줄에 대해 리포트를 생성해야 한다', async () => {
      const schedule = createTestSchedule();
      schedule.nextRunAt = new Date('2020-01-01T00:00:00Z'); // 과거 시각 (실행 대상)

      (scheduleRepo.find as jest.Mock).mockResolvedValue([schedule]);
      (snapshotService.getSnapshots as jest.Mock).mockResolvedValue([]);
      (reportRepo.findOne as jest.Mock).mockResolvedValue(null);

      const savedReport = createTestReport();
      (reportRepo.create as jest.Mock).mockReturnValue(savedReport);
      (reportRepo.save as jest.Mock).mockResolvedValue(savedReport);
      (scheduleRepo.save as jest.Mock).mockImplementation(async (s) => s);

      await service.processScheduledReports();

      // 리포트 생성 및 스케줄 갱신 확인
      expect(reportRepo.create).toHaveBeenCalledTimes(1);
      expect(scheduleRepo.save).toHaveBeenCalledTimes(1);
    });

    it('실행 대상 스케줄이 없으면 아무 작업도 하지 않아야 한다', async () => {
      (scheduleRepo.find as jest.Mock).mockResolvedValue([]);

      await service.processScheduledReports();

      expect(reportRepo.create).not.toHaveBeenCalled();
    });

    it('리포트 생성 실패 시 다른 스케줄에 영향을 주지 않아야 한다', async () => {
      const schedule1 = createTestSchedule();
      schedule1.id = 'schedule-1';
      schedule1.nextRunAt = new Date('2020-01-01');

      const schedule2 = createTestSchedule();
      schedule2.id = 'schedule-2';
      schedule2.walletAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      schedule2.nextRunAt = new Date('2020-01-01');

      (scheduleRepo.find as jest.Mock).mockResolvedValue([
        schedule1,
        schedule2,
      ]);

      // 첫 번째 스케줄에서 오류 발생
      let callCount = 0;
      (snapshotService.getSnapshots as jest.Mock).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('DB 연결 오류');
        }
        return [];
      });
      (reportRepo.findOne as jest.Mock).mockResolvedValue(null);

      const savedReport = createTestReport();
      (reportRepo.create as jest.Mock).mockReturnValue(savedReport);
      (reportRepo.save as jest.Mock).mockResolvedValue(savedReport);
      (scheduleRepo.save as jest.Mock).mockImplementation(async (s) => s);

      // 오류가 전파되지 않아야 한다
      await expect(
        service.processScheduledReports(),
      ).resolves.not.toThrow();
    });
  });

  // ========== 데이터 내보내기 ==========

  describe('exportData', () => {
    it('CSV 포맷으로 데이터를 내보내야 한다', async () => {
      const snapshot = createTestSnapshot();
      (snapshotService.getSnapshots as jest.Mock).mockResolvedValue([snapshot]);

      const result = await service.exportData(
        '0x1234567890abcdef1234567890abcdef12345678',
        'csv',
      );

      expect(result.contentType).toBe('text/csv; charset=utf-8');
      expect(result.filename).toContain('bitscope-portfolio-');
      expect(result.filename).toContain('.csv');
      expect(result.buffer).toBeInstanceOf(Buffer);

      const csvContent = result.buffer.toString('utf-8');
      expect(csvContent).toContain('Symbol,Exchange,Balance');
      expect(csvContent).toContain('BTC');
      expect(csvContent).toContain('ETH');
    });

    it('JSON 포맷으로 데이터를 내보내야 한다', async () => {
      const snapshot = createTestSnapshot();
      (snapshotService.getSnapshots as jest.Mock).mockResolvedValue([snapshot]);

      const result = await service.exportData(
        '0x1234567890abcdef1234567890abcdef12345678',
        'json',
      );

      expect(result.contentType).toBe('application/json; charset=utf-8');
      expect(result.filename).toContain('.json');

      const jsonContent = JSON.parse(result.buffer.toString('utf-8'));
      expect(jsonContent).toHaveProperty('holdings');
      expect(jsonContent).toHaveProperty('totalEvaluation');
    });

    it('PDF 포맷으로 데이터를 내보내야 한다', async () => {
      const snapshot = createTestSnapshot();
      (snapshotService.getSnapshots as jest.Mock).mockResolvedValue([snapshot]);

      const result = await service.exportData(
        '0x1234567890abcdef1234567890abcdef12345678',
        'pdf',
      );

      expect(result.contentType).toBe('application/pdf');
      expect(result.filename).toContain('.pdf');
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it('스냅샷이 없어도 빈 데이터를 내보내야 한다', async () => {
      (snapshotService.getSnapshots as jest.Mock).mockResolvedValue([]);

      const result = await service.exportData(
        '0x1234567890abcdef1234567890abcdef12345678',
        'csv',
      );

      expect(result.buffer).toBeInstanceOf(Buffer);
      const csvContent = result.buffer.toString('utf-8');
      expect(csvContent).toContain('Symbol,Exchange,Balance');
    });

    it('지원하지 않는 포맷이면 예외를 발생시켜야 한다', async () => {
      (snapshotService.getSnapshots as jest.Mock).mockResolvedValue([]);

      await expect(
        service.exportData(
          '0x1234567890abcdef1234567890abcdef12345678',
          'xml' as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('exportTransactionHistory', () => {
    it('거래 내역을 CSV로 내보내야 한다', async () => {
      const snapshot = createTestSnapshot();
      (snapshotService.getSnapshots as jest.Mock).mockResolvedValue([snapshot]);

      const result = await service.exportTransactionHistory(
        '0x1234567890abcdef1234567890abcdef12345678',
      );

      expect(result.contentType).toBe('text/csv; charset=utf-8');
      expect(result.filename).toContain('bitscope-transactions-');

      const csvContent = result.buffer.toString('utf-8');
      expect(csvContent).toContain('Timestamp,Symbol,Exchange');
      expect(csvContent).toContain('BTC');
    });
  });

  // ========== 내부 유틸리티 메서드 ==========

  describe('calculateReportPeriod', () => {
    it('daily 유형은 24시간 기간을 산출해야 한다', () => {
      const { periodStart, periodEnd } = service.calculateReportPeriod('daily');

      const diffMs = periodEnd.getTime() - periodStart.getTime();
      expect(diffMs).toBe(24 * 60 * 60 * 1000);
    });

    it('weekly 유형은 7일 기간을 산출해야 한다', () => {
      const { periodStart, periodEnd } =
        service.calculateReportPeriod('weekly');

      const diffMs = periodEnd.getTime() - periodStart.getTime();
      expect(diffMs).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('monthly 유형은 30일 기간을 산출해야 한다', () => {
      const { periodStart, periodEnd } =
        service.calculateReportPeriod('monthly');

      const diffMs = periodEnd.getTime() - periodStart.getTime();
      expect(diffMs).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it('custom 유형은 사용자 지정 기간을 사용해야 한다', () => {
      const customStart = new Date('2026-01-01');
      const customEnd = new Date('2026-01-15');

      const { periodStart, periodEnd } = service.calculateReportPeriod(
        'custom',
        customStart,
        customEnd,
      );

      expect(periodStart).toEqual(customStart);
      expect(periodEnd).toEqual(customEnd);
    });

    it('custom 유형에서 기간 미지정 시 예외를 발생시켜야 한다', () => {
      expect(() => service.calculateReportPeriod('custom')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('buildReportSummary', () => {
    it('스냅샷 기반 요약 정보를 생성해야 한다', () => {
      const snapshot = createTestSnapshot();
      const summary = service.buildReportSummary(snapshot, null);

      expect(summary).toHaveProperty('totalEvaluation');
      expect(summary).toHaveProperty('evaluationChange');
      expect(summary).toHaveProperty('topGainers');
      expect(summary).toHaveProperty('topLosers');
      expect(summary).toHaveProperty('newCoins');
    });

    it('이전 리포트 대비 변동 사항을 계산해야 한다', () => {
      const snapshot = createTestSnapshot();
      const previousReport = createTestReport();

      const summary = service.buildReportSummary(snapshot, previousReport);

      // 현재 10000000, 이전 9500000 -> 변동 500000
      expect(summary.evaluationChange).toBe(500000);
      expect(summary.evaluationChangeRate).toBeGreaterThan(0);
    });

    it('수익 상위 코인을 올바르게 산출해야 한다', () => {
      const snapshot = createTestSnapshot();
      const summary = service.buildReportSummary(snapshot, null) as Record<string, unknown>;

      const topGainers = summary.topGainers as { symbol: string; rate: number }[];
      // BTC: avgBuyPrice=50000000, currentPrice=55000000 -> +10%
      expect(topGainers.length).toBeGreaterThan(0);
      expect(topGainers[0]!.symbol).toBe('BTC');
      expect(topGainers[0]!.rate).toBe(10);
    });

    it('손실 상위 코인을 올바르게 산출해야 한다', () => {
      const snapshot = createTestSnapshot();
      const summary = service.buildReportSummary(snapshot, null) as Record<string, unknown>;

      const topLosers = summary.topLosers as { symbol: string; rate: number }[];
      // ETH: avgBuyPrice=3000000, currentPrice=2800000 -> -6.67%
      expect(topLosers.length).toBeGreaterThan(0);
      expect(topLosers[0]!.symbol).toBe('ETH');
      expect(topLosers[0]!.rate).toBeLessThan(0);
    });

    it('스냅샷이 없으면 기본값을 반환해야 한다', () => {
      const summary = service.buildReportSummary(null, null) as Record<string, unknown>;

      expect(summary.totalEvaluation).toBe(0);
      expect(summary.evaluationChange).toBe(0);
      expect((summary.newCoins as string[]).length).toBe(0);
    });
  });

  describe('buildReportData', () => {
    it('스냅샷 엔티티를 리포트 데이터 객체로 변환해야 한다', () => {
      const snapshot = createTestSnapshot();
      const data = service.buildReportData(snapshot);

      expect(data).toHaveProperty('walletAddress', snapshot.walletAddress);
      expect(data).toHaveProperty('totalEvaluation', 10000000);
      expect(data).toHaveProperty('holdings');
      expect((data.holdings as unknown[]).length).toBe(2);
    });
  });

  describe('calculateNextRunTime', () => {
    it('daily cron에 대해 다음 날 오전 9시를 반환해야 한다', () => {
      const nextRun = service.calculateNextRunTime('0 9 * * *');
      expect(nextRun.getHours()).toBe(9);
      expect(nextRun.getMinutes()).toBe(0);
    });

    it('weekly cron에 대해 다음 월요일 오전 9시를 반환해야 한다', () => {
      const nextRun = service.calculateNextRunTime('0 9 * * 1');
      expect(nextRun.getDay()).toBe(1); // 월요일
      expect(nextRun.getHours()).toBe(9);
    });

    it('monthly cron에 대해 다음 달 1일 오전 9시를 반환해야 한다', () => {
      const nextRun = service.calculateNextRunTime('0 9 1 * *');
      expect(nextRun.getDate()).toBe(1);
      expect(nextRun.getHours()).toBe(9);
    });

    it('알 수 없는 cron 표현식에 대해 24시간 뒤를 반환해야 한다', () => {
      const now = Date.now();
      const nextRun = service.calculateNextRunTime('0 0 */6 * * *');
      const diffMs = nextRun.getTime() - now;

      // 대략 24시간 (약간의 실행 시간 차이 허용)
      expect(diffMs).toBeGreaterThan(23 * 60 * 60 * 1000);
      expect(diffMs).toBeLessThan(25 * 60 * 60 * 1000);
    });
  });
});
