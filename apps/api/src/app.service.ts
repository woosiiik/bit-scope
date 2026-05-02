import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  /** 서비스 헬스 체크 */
  getHealth(): { status: string; service: string } {
    return {
      status: 'ok',
      service: 'BitScope API',
    };
  }
}
