/**
 * 텔레그램 컨트롤러
 *
 * 텔레그램 봇 웹훅 수신, 연결 상태 조회, 연결 해제,
 * 인증 코드 생성 등의 REST API 엔드포인트를 제공한다.
 *
 * POST /telegram/webhook       - 텔레그램 봇 웹훅 수신 (텔레그램이 호출)
 * GET  /telegram/status/:addr  - 연결 상태 조회
 * DELETE /telegram/connection/:addr - 연결 해제
 * GET  /telegram/connect-link/:addr - 인증 코드 생성 및 봇 연결 링크
 * POST /telegram/test/:addr    - 테스트 알림 전송
 */

import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { TelegramService } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(private readonly telegramService: TelegramService) {}

  /**
   * POST /telegram/webhook
   *
   * 텔레그램 봇 웹훅을 수신한다.
   * 텔레그램 서버에서 봇으로 전송된 메시지를 처리한다.
   * 항상 200 OK를 반환하여 텔레그램이 재전송하지 않도록 한다.
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() update: Record<string, unknown>): Promise<{ ok: true }> {
    this.logger.log('텔레그램 웹훅 수신');

    try {
      await this.telegramService.handleWebhook(update);
    } catch (error) {
      this.logger.error(
        `웹훅 처리 오류: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // 텔레그램에 항상 200 OK를 반환
    return { ok: true };
  }

  /**
   * GET /telegram/status/:walletAddress
   *
   * 특정 지갑 주소의 텔레그램 연결 상태를 조회한다.
   */
  @Get('status/:walletAddress')
  async getStatus(
    @Param('walletAddress') walletAddress: string,
  ): Promise<{
    connected: boolean;
    username: string | null;
    isActive: boolean;
    enabled: boolean;
  }> {
    this.logger.log(`텔레그램 연결 상태 조회 - wallet: ${walletAddress}`);

    const enabled = this.telegramService.isEnabled();
    const connection = await this.telegramService.getConnection(walletAddress);

    if (!connection) {
      return {
        connected: false,
        username: null,
        isActive: false,
        enabled,
      };
    }

    return {
      connected: true,
      username: connection.username,
      isActive: connection.isActive,
      enabled,
    };
  }

  /**
   * DELETE /telegram/connection/:walletAddress
   *
   * 텔레그램 연결을 해제한다.
   */
  @Delete('connection/:walletAddress')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnect(
    @Param('walletAddress') walletAddress: string,
  ): Promise<void> {
    this.logger.log(`텔레그램 연결 해제 요청 - wallet: ${walletAddress}`);

    const result = await this.telegramService.disconnect(walletAddress);
    if (!result) {
      throw new NotFoundException('텔레그램 연결 정보를 찾을 수 없습니다.');
    }
  }

  /**
   * GET /telegram/connect-link/:walletAddress
   *
   * 인증 코드를 생성하고 텔레그램 봇 연결 링크를 반환한다.
   * 인증 코드는 5분간 유효하다.
   */
  @Get('connect-link/:walletAddress')
  getConnectLink(
    @Param('walletAddress') walletAddress: string,
  ): {
    verificationCode: string;
    botLink: string | null;
    botUsername: string | null;
    expiresInSeconds: number;
  } {
    this.logger.log(`텔레그램 연결 링크 요청 - wallet: ${walletAddress}`);

    const verificationCode =
      this.telegramService.generateVerificationCode(walletAddress);
    const botLink = this.telegramService.getBotLink();

    return {
      verificationCode,
      botLink,
      botUsername: botLink
        ? botLink.replace('https://t.me/', '')
        : null,
      expiresInSeconds: 300,
    };
  }

  /**
   * POST /telegram/test/:walletAddress
   *
   * 테스트 알림 메시지를 전송한다.
   */
  @Post('test/:walletAddress')
  @HttpCode(HttpStatus.OK)
  async sendTestMessage(
    @Param('walletAddress') walletAddress: string,
  ): Promise<{ sent: boolean }> {
    this.logger.log(`텔레그램 테스트 알림 요청 - wallet: ${walletAddress}`);

    const connection = await this.telegramService.getConnection(walletAddress);
    if (!connection || !connection.isActive) {
      throw new NotFoundException('텔레그램 연결 정보를 찾을 수 없습니다.');
    }

    const sent = await this.telegramService.sendMessage(
      connection.chatId,
      '<b>BitScope 테스트 알림</b>\n\n' +
        '텔레그램 알림이 정상적으로 연결되었습니다.\n' +
        '이제 가격/김프 알림을 텔레그램으로 수신할 수 있습니다.',
    );

    return { sent };
  }
}
