import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** 헬스 체크 엔드포인트 */
  @Get()
  getHealth(): { status: string; service: string } {
    return this.appService.getHealth();
  }
}
