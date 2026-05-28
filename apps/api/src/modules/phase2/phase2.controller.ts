import { Controller, Get, Query, Logger } from '@nestjs/common';
import { FundingHeatmapService } from './funding-heatmap.service';
import { OIChangesService } from './oi-changes.service';
import { NormalizedCVDService } from './normalized-cvd.service';
import { BasisService } from './basis.service';

@Controller('phase2')
export class Phase2Controller {
  private readonly logger = new Logger(Phase2Controller.name);

  constructor(
    private readonly fundingHeatmap: FundingHeatmapService,
    private readonly oiChanges: OIChangesService,
    private readonly normalizedCVD: NormalizedCVDService,
    private readonly basis: BasisService,
  ) {}

  @Get('funding-heatmap')
  async getFundingHeatmap(@Query('period') period?: string) {
    try {
      const data = await this.fundingHeatmap.getHeatmapData(period ?? '1d');
      return { success: true, ...data, timestamp: Date.now() };
    } catch (err) {
      this.logger.error(`funding-heatmap 실패: ${err instanceof Error ? err.message : String(err)}`);
      return { success: false, error: { message: 'Funding heatmap 조회 실패' } };
    }
  }

  @Get('oi-changes')
  async getOIChanges(@Query('period') period?: string) {
    try {
      const result = await this.oiChanges.getOIChanges(period ?? '1d');
      return { success: true, ...result, timestamp: Date.now() };
    } catch (err) {
      this.logger.error(`oi-changes 실패: ${err instanceof Error ? err.message : String(err)}`);
      return { success: false, error: { message: 'OI Changes 조회 실패' } };
    }
  }

  @Get('normalized-cvd')
  async getNormalizedCVD(@Query('period') period?: string) {
    try {
      const result = await this.normalizedCVD.getNormalizedCVD(period ?? '1d');
      return { success: true, ...result, timestamp: Date.now() };
    } catch (err) {
      this.logger.error(`normalized-cvd 실패: ${err instanceof Error ? err.message : String(err)}`);
      return { success: false, error: { message: 'Normalized CVD 조회 실패' } };
    }
  }

  @Get('basis')
  async getBasis(@Query('symbol') symbol?: string, @Query('period') period?: string) {
    try {
      const result = await this.basis.getBasisTimeSeries(symbol ?? 'BTC', period ?? '1d');
      return { success: true, symbol: symbol ?? 'BTC', ...result, timestamp: Date.now() };
    } catch (err) {
      this.logger.error(`basis 실패: ${err instanceof Error ? err.message : String(err)}`);
      return { success: false, error: { message: 'Basis 조회 실패' } };
    }
  }
}
