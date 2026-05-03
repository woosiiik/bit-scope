/**
 * ReportController 단위 테스트
 *
 * 모의 ReportService를 사용하여
 * REST API 엔드포인트의 요청 처리 로직을 검증한다.
 */

import { Test, TestingModule } from '@nestjs/testing';

import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { ReportEntity } from './entities/report.entity';
import { ReportScheduleEntity } from './entities/report-schedule.entity';
import { CreateReportDto } from './dto/create-report.dto';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';

/** 테스트용 리포트 엔티티 생성 */
function createTestReport(): ReportEntity {
  const report = new ReportEntity();
  report.id = 'report-uuid-1';
  report.walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
  report.type = 'weekly';
  report.generatedAt = new Date('2026-01-08T09:00:00Z');
  report.periodStart = new Date('2026-01-01T00:00:00Z');
  report.periodEnd = new Date('2026-01-08T00:00:00Z');
  report.summary = { totalEvaluation: 10000000 };
  report.data = { walletAddress: '0x1234', holdings: [] };
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

describe('ReportController', () => {
  let controller: ReportController;
  let reportService: jest.Mocked<Partial<ReportService>>;

  beforeEach(async () => {
    reportService = {
      generateReport: jest.fn(),
      getReport: jest.fn(),
      getReportHistory: jest.fn(),
      createSchedule: jest.fn(),
      updateSchedule: jest.fn(),
      cancelSchedule: jest.fn(),
      getSchedules: jest.fn(),
      exportData: jest.fn(),
      exportTransactionHistory: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportController],
      providers: [
        {
          provide: ReportService,
          useValue: reportService,
        },
      ],
    }).compile();

    controller = module.get<ReportController>(ReportController);
  });

  it('컨트롤러 인스턴스가 정의되어 있어야 한다', () => {
    expect(controller).toBeDefined();
  });

  // ========== 리포트 생성 및 조회 ==========

  describe('createReport', () => {
    it('리포트 생성 요청을 처리해야 한다', async () => {
      const dto = new CreateReportDto();
      dto.walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
      dto.type = 'weekly';

      const report = createTestReport();
      (reportService.generateReport as jest.Mock).mockResolvedValue(report);

      const result = await controller.createReport(dto);

      expect(result.id).toBe('report-uuid-1');
      expect(reportService.generateReport).toHaveBeenCalledWith(dto);
    });
  });

  describe('getReportHistory', () => {
    it('리포트 이력 조회 요청을 처리해야 한다', async () => {
      const reports = [createTestReport()];
      (reportService.getReportHistory as jest.Mock).mockResolvedValue(reports);

      const result = await controller.getReportHistory(
        '0x1234567890abcdef1234567890abcdef12345678',
        {},
      );

      expect(result).toHaveLength(1);
      expect(reportService.getReportHistory).toHaveBeenCalledWith(
        '0x1234567890abcdef1234567890abcdef12345678',
        undefined,
        20,
      );
    });

    it('유형 필터와 limit을 전달해야 한다', async () => {
      (reportService.getReportHistory as jest.Mock).mockResolvedValue([]);

      await controller.getReportHistory(
        '0x1234567890abcdef1234567890abcdef12345678',
        { type: 'weekly', limit: '5' },
      );

      expect(reportService.getReportHistory).toHaveBeenCalledWith(
        '0x1234567890abcdef1234567890abcdef12345678',
        'weekly',
        5,
      );
    });

    it('잘못된 limit 값에 기본값 20을 사용해야 한다', async () => {
      (reportService.getReportHistory as jest.Mock).mockResolvedValue([]);

      await controller.getReportHistory(
        '0x1234567890abcdef1234567890abcdef12345678',
        { limit: 'abc' },
      );

      expect(reportService.getReportHistory).toHaveBeenCalledWith(
        '0x1234567890abcdef1234567890abcdef12345678',
        undefined,
        20,
      );
    });
  });

  describe('getReport', () => {
    it('특정 리포트 조회 요청을 처리해야 한다', async () => {
      const report = createTestReport();
      (reportService.getReport as jest.Mock).mockResolvedValue(report);

      const result = await controller.getReport('report-uuid-1');

      expect(result.id).toBe('report-uuid-1');
      expect(reportService.getReport).toHaveBeenCalledWith('report-uuid-1');
    });
  });

  // ========== 정기 리포트 스케줄 ==========

  describe('createSchedule', () => {
    it('스케줄 생성 요청을 처리해야 한다', async () => {
      const dto = new CreateScheduleDto();
      dto.walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
      dto.type = 'weekly';

      const schedule = createTestSchedule();
      (reportService.createSchedule as jest.Mock).mockResolvedValue(schedule);

      const result = await controller.createSchedule(dto);

      expect(result.type).toBe('weekly');
      expect(reportService.createSchedule).toHaveBeenCalledWith(dto);
    });
  });

  describe('getSchedules', () => {
    it('스케줄 목록 조회 요청을 처리해야 한다', async () => {
      const schedules = [createTestSchedule()];
      (reportService.getSchedules as jest.Mock).mockResolvedValue(schedules);

      const result = await controller.getSchedules(
        '0x1234567890abcdef1234567890abcdef12345678',
      );

      expect(result).toHaveLength(1);
    });
  });

  describe('updateSchedule', () => {
    it('스케줄 수정 요청을 처리해야 한다', async () => {
      const dto = new UpdateScheduleDto();
      dto.isActive = false;

      const updated = createTestSchedule();
      updated.isActive = false;
      (reportService.updateSchedule as jest.Mock).mockResolvedValue(updated);

      const result = await controller.updateSchedule('schedule-uuid-1', dto);

      expect(result.isActive).toBe(false);
      expect(reportService.updateSchedule).toHaveBeenCalledWith(
        'schedule-uuid-1',
        dto,
      );
    });
  });

  describe('cancelSchedule', () => {
    it('스케줄 삭제 요청을 처리해야 한다', async () => {
      (reportService.cancelSchedule as jest.Mock).mockResolvedValue(undefined);

      await controller.cancelSchedule('schedule-uuid-1');

      expect(reportService.cancelSchedule).toHaveBeenCalledWith(
        'schedule-uuid-1',
      );
    });
  });

  // ========== 데이터 내보내기 ==========

  describe('exportData', () => {
    it('CSV 내보내기 요청을 처리해야 한다', async () => {
      const exportResult = {
        buffer: Buffer.from('test,data'),
        contentType: 'text/csv; charset=utf-8',
        filename: 'test.csv',
      };
      (reportService.exportData as jest.Mock).mockResolvedValue(exportResult);

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };

      await controller.exportData(
        '0x1234567890abcdef1234567890abcdef12345678',
        { format: 'csv' },
        mockRes as any,
      );

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/csv; charset=utf-8',
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('attachment'),
      );
      expect(mockRes.send).toHaveBeenCalledWith(exportResult.buffer);
    });
  });

  describe('exportTransactions', () => {
    it('거래 내역 내보내기 요청을 처리해야 한다', async () => {
      const exportResult = {
        buffer: Buffer.from('transaction,data'),
        contentType: 'text/csv; charset=utf-8',
        filename: 'transactions.csv',
      };
      (reportService.exportTransactionHistory as jest.Mock).mockResolvedValue(
        exportResult,
      );

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };

      await controller.exportTransactions(
        '0x1234567890abcdef1234567890abcdef12345678',
        undefined,
        undefined,
        mockRes as any,
      );

      expect(mockRes.send).toHaveBeenCalledWith(exportResult.buffer);
    });
  });
});
