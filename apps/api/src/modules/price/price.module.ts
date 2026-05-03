/**
 * 시세 모니터링 모듈
 *
 * 거래소 WebSocket/REST 클라이언트, PriceMonitorService, PriceGateway를
 * 하나의 모듈로 캡슐화한다.
 *
 * - UpbitWsClient: 업비트 WebSocket 시세 수신
 * - BithumbWsClient: 빗썸 WebSocket 시세 수신
 * - CoinonePollingClient: 코인원 REST 폴링 시세 수신
 * - PriceMonitorService: 내부 가격 맵 관리, 시세 이벤트 발행
 * - PriceGateway: Socket.IO를 통한 클라이언트 실시간 시세 브로드캐스트
 *
 * @see 요구사항 12.9, 12.10, 5.2
 */

import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { UpbitWsClient } from './exchange-ws/upbit-ws.client';
import { BithumbWsClient } from './exchange-ws/bithumb-ws.client';
import { CoinonePollingClient } from './exchange-ws/coinone-polling.client';
import { BinancePollingClient } from './exchange-ws/binance-polling.client';
import { PriceMonitorService } from './price-monitor.service';
import { PriceGateway } from './price.gateway';

@Module({
  imports: [
    // EventEmitter2를 사용하여 서비스 간 이벤트 기반 통신을 지원한다.
    // PriceMonitorService -> PriceGateway/AlertService로 시세 업데이트를 전달한다.
    EventEmitterModule.forRoot(),
  ],
  providers: [
    // 거래소별 시세 수신 클라이언트
    UpbitWsClient,
    BithumbWsClient,
    CoinonePollingClient,
    // 바이낸스 시세 수신 클라이언트 (김치 프리미엄 비교용)
    BinancePollingClient,
    // 시세 통합 관리 서비스
    PriceMonitorService,
    // Socket.IO 게이트웨이
    PriceGateway,
  ],
  exports: [
    PriceMonitorService,
    PriceGateway,
  ],
})
export class PriceModule {}
