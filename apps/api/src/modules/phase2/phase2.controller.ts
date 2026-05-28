import { Controller, Get, Query, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { FundingHeatmapService } from './funding-heatmap.service';
import { OIChangesService } from './oi-changes.service';
import { NormalizedCVDService } from './normalized-cvd.service';
import { BasisService } from './basis.service';

const VALID_PERIODS = ['1d', '1w', '1m'];

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
    const p = VALID_PERIODS.includes(period ?? '') ? period! : '1d';
    try {
      const data = await this.fundingHeatmap.getHeatmapData(p);
      return { success: true, ...data, timestamp: Date.now() };
    } catch (err) {
      this.logger.error(`funding-heatmap 실패: ${err instanceof Error ? err.message : String(err)}`);
      throw new HttpException({ success: false, error: { message: 'Funding heatmap 조회 실패' } }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('oi-changes')
  async getOIChanges(@Query('period') period?: string) {
    const p = VALID_PERIODS.includes(period ?? '') ? period! : '1d';
    try {
      const result = await this.oiChanges.getOIChanges(p);
      return { success: true, ...result, timestamp: Date.now() };
    } catch (err) {
      this.logger.error(`oi-changes 실패: ${err instanceof Error ? err.message : String(err)}`);
      throw new HttpException({ success: false, error: { message: 'OI Changes 조회 실패' } }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('normalized-cvd')
  async getNormalizedCVD(@Query('period') period?: string) {
    const p = VALID_PERIODS.includes(period ?? '') ? period! : '1d';
    try {
      const result = await this.normalizedCVD.getNormalizedCVD(p);
      return { success: true, ...result, timestamp: Date.now() };
    } catch (err) {
      this.logger.error(`normalized-cvd 실패: ${err instanceof Error ? err.message : String(err)}`);
      throw new HttpException({ success: false, error: { message: 'Normalized CVD 조회 실패' } }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('basis')
  async getBasis(@Query('symbol') symbol?: string, @Query('period') period?: string) {
    const p = VALID_PERIODS.includes(period ?? '') ? period! : '1d';
    const sym = symbol?.toUpperCase() ?? 'BTC';
    try {
      const result = await this.basis.getBasisTimeSeries(sym, p);
      return { success: true, symbol: sym, ...result, timestamp: Date.now() };
    } catch (err) {
      this.logger.error(`basis 실패: ${err instanceof Error ? err.message : String(err)}`);
      throw new HttpException({ success: false, error: { message: 'Basis 조회 실패' } }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
