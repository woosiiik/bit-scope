/**
 * 시그널 API 컨트롤러
 *
 * 히든 메뉴 인증 및 시그널 데이터 조회 엔드포인트를 제공한다.
 */

import { Controller, Get, Post, Body, Query, Headers, Param, ForbiddenException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { SignalAuthService } from './services/signal-auth.service';
import { SignalService } from './services/signal.service';
import { TelegramUserService } from './services/telegram-user.service';

@Controller('signal')
export class SignalController {
  constructor(
    private readonly authService: SignalAuthService,
    private readonly signalService: SignalService,
    private readonly telegramService: TelegramUserService,
  ) {}

  /**
   * 히든 메뉴 비밀번호 검증
   */
  @Post('auth/verify')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async verifyPassword(@Body() body: { password: string }) {
    const result = await this.authService.verifyPassword(body.password);
    return { success: true, data: result };
  }

  /**
   * 코인별 최신 시그널 조회
   */
  @Get('latest')
  async getLatestSignals(
    @Headers('x-signal-token') token: string,
  ) {
    this.validateToken(token);
    const data = await this.signalService.getLatestByCoins();
    return { success: true, data };
  }

  /**
   * 시그널 목록 조회 (페이지네이션)
   */
  @Get('list')
  async getSignalList(
    @Headers('x-signal-token') token: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.validateToken(token);
    const parsedPage = Math.max(parseInt(page ?? '1', 10) || 1, 1);
    const parsedLimit = Math.min(parseInt(limit ?? '50', 10) || 50, 100);
    const data = await this.signalService.getSignalList(parsedPage, parsedLimit);
    return { success: true, data };
  }

  /**
   * 특정 코인의 시그널 이력 조회
   */
  @Get('coin/:symbol')
  async getSignalsByCoin(
    @Headers('x-signal-token') token: string,
    @Param('symbol') symbol: string,
  ) {
    this.validateToken(token);
    const data = await this.signalService.getSignalsByCoin(symbol.replace('-', '/'));
    return { success: true, data };
  }

  /**
   * Telegram 연결 상태 확인
   */
  @Get('status')
  async getStatus(
    @Headers('x-signal-token') token: string,
  ) {
    this.validateToken(token);
    return {
      success: true,
      data: { telegramConnected: this.telegramService.isConnected() },
    };
  }

  private validateToken(token: string): void {
    if (!token || !this.authService.validateToken(token)) {
      throw new ForbiddenException('유효하지 않은 인증 토큰입니다.');
    }
  }
}
