/**
 * PriceGateway - Socket.IO WebSocket 게이트웨이
 *
 * 클라이언트에 실시간 시세 데이터를 브로드캐스트한다.
 * 클라이언트별 심볼 구독/구독해제를 관리하고,
 * PriceMonitorService의 시세 업데이트 이벤트를 수신하여 해당 심볼을
 * 구독 중인 클라이언트에게 전달한다.
 *
 * @see 설계 문서 3.3.2 WebSocketGateway
 * @see 요구사항 12.10, 5.2
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';

import type { PriceUpdate } from '@bitscope/shared';
import type { AlertNotification } from '@bitscope/shared';

import { PRICE_EVENTS } from './price-monitor.service';

/** 클라이언트가 구독 요청에 보내는 데이터 */
export interface SubscribePayload {
  /** 구독할 심볼 목록 (예: ["BTC", "ETH"]) */
  symbols: string[];
}

/** 클라이언트가 구독 해제 요청에 보내는 데이터 */
export interface UnsubscribePayload {
  /** 구독 해제할 심볼 목록 */
  symbols: string[];
}

/** Socket.IO 이벤트 이름 상수 */
export const WS_EVENTS = {
  /** 클라이언트 -> 서버: 심볼 구독 */
  SUBSCRIBE: 'subscribe',
  /** 클라이언트 -> 서버: 심볼 구독 해제 */
  UNSUBSCRIBE: 'unsubscribe',
  /** 서버 -> 클라이언트: 시세 업데이트 */
  PRICE_UPDATE: 'price_update',
  /** 서버 -> 클라이언트: 알림 */
  ALERT: 'alert',
} as const;

/**
 * Socket.IO 게이트웨이
 *
 * Socket.IO 서버를 /price 네임스페이스에 생성하고,
 * 심볼별 Room을 사용하여 클라이언트에게 선택적 브로드캐스트를 수행한다.
 *
 * - 각 심볼은 "symbol:{SYMBOL}" 형태의 Room으로 관리 (예: "symbol:BTC")
 * - 클라이언트가 subscribe 이벤트로 심볼을 구독하면 해당 Room에 join
 * - 시세 업데이트 시 해당 심볼 Room에만 브로드캐스트
 */
@WebSocketGateway({
  namespace: 'price',
  cors: {
    origin: [
      'http://localhost:3500',
      'http://localhost:3000',
      ...(process.env.CORS_ORIGINS?.split(',') || []),
    ],
    credentials: true,
  },
})
export class PriceGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(PriceGateway.name);

  @WebSocketServer()
  server!: Server;

  /** 접속 중인 클라이언트 수 */
  private connectedClients = 0;

  /**
   * 게이트웨이 초기화 시 호출된다.
   */
  afterInit(_server: Server): void {
    this.logger.log('PriceGateway 초기화 완료 (namespace: /price)');
  }

  /**
   * 새 클라이언트가 연결될 때 호출된다.
   */
  handleConnection(client: Socket): void {
    this.connectedClients++;
    this.logger.log(
      `클라이언트 연결: ${client.id} (총 ${this.connectedClients}명)`,
    );
  }

  /**
   * 클라이언트가 연결을 해제할 때 호출된다.
   *
   * Socket.IO가 Room에서 자동으로 제거해주므로 별도 정리가 필요 없다.
   */
  handleDisconnect(client: Socket): void {
    this.connectedClients = Math.max(0, this.connectedClients - 1);
    this.logger.log(
      `클라이언트 연결 해제: ${client.id} (총 ${this.connectedClients}명)`,
    );
  }

  /**
   * 클라이언트의 심볼 구독 요청을 처리한다.
   *
   * 클라이언트를 해당 심볼의 Room에 join시킨다.
   * 이후 해당 심볼의 시세 업데이트가 클라이언트에게 전달된다.
   */
  @SubscribeMessage(WS_EVENTS.SUBSCRIBE)
  handleSubscription(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribePayload,
  ): { event: string; data: { subscribed: string[] } } {
    const symbols = payload?.symbols;

    if (!Array.isArray(symbols) || symbols.length === 0) {
      this.logger.warn(
        `잘못된 구독 요청: ${client.id} - symbols가 비어있거나 배열이 아닙니다.`,
      );
      return {
        event: WS_EVENTS.SUBSCRIBE,
        data: { subscribed: [] },
      };
    }

    // 유효한 심볼만 필터링 (비어있지 않은 문자열)
    const validSymbols = symbols.filter(
      (s) => typeof s === 'string' && s.trim().length > 0,
    );

    for (const symbol of validSymbols) {
      const roomName = this.getSymbolRoom(symbol);
      client.join(roomName);
    }

    this.logger.log(
      `클라이언트 ${client.id} 심볼 구독: [${validSymbols.join(', ')}]`,
    );

    return {
      event: WS_EVENTS.SUBSCRIBE,
      data: { subscribed: validSymbols },
    };
  }

  /**
   * 클라이언트의 심볼 구독 해제 요청을 처리한다.
   *
   * 클라이언트를 해당 심볼의 Room에서 leave시킨다.
   */
  @SubscribeMessage(WS_EVENTS.UNSUBSCRIBE)
  handleUnsubscription(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: UnsubscribePayload,
  ): { event: string; data: { unsubscribed: string[] } } {
    const symbols = payload?.symbols;

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return {
        event: WS_EVENTS.UNSUBSCRIBE,
        data: { unsubscribed: [] },
      };
    }

    const validSymbols = symbols.filter(
      (s) => typeof s === 'string' && s.trim().length > 0,
    );

    for (const symbol of validSymbols) {
      const roomName = this.getSymbolRoom(symbol);
      client.leave(roomName);
    }

    this.logger.log(
      `클라이언트 ${client.id} 심볼 구독 해제: [${validSymbols.join(', ')}]`,
    );

    return {
      event: WS_EVENTS.UNSUBSCRIBE,
      data: { unsubscribed: validSymbols },
    };
  }

  /**
   * PriceMonitorService의 시세 업데이트 이벤트를 수신하여
   * 해당 심볼을 구독 중인 클라이언트에게 브로드캐스트한다.
   *
   * EventEmitter2의 @OnEvent 데코레이터를 사용하여
   * PRICE_EVENTS.PRICE_UPDATE 이벤트를 구독한다.
   */
  @OnEvent(PRICE_EVENTS.PRICE_UPDATE)
  handlePriceUpdate(update: PriceUpdate): void {
    if (!this.server) return;

    const roomName = this.getSymbolRoom(update.symbol);

    // 해당 심볼의 Room에 있는 클라이언트에게만 브로드캐스트
    this.server.to(roomName).emit(WS_EVENTS.PRICE_UPDATE, update);
  }

  /**
   * 특정 사용자(지갑 주소)에게 알림을 전송한다.
   *
   * 사용자별 Room을 사용하여 개인화된 알림을 전달한다.
   * AlertService에서 호출한다.
   *
   * @param walletAddress 대상 사용자의 지갑 주소
   * @param notification 알림 데이터
   */
  broadcastAlert(walletAddress: string, notification: AlertNotification): void {
    if (!this.server) return;

    const userRoom = this.getUserRoom(walletAddress);
    this.server.to(userRoom).emit(WS_EVENTS.ALERT, notification);

    this.logger.log(
      `알림 전송: ${walletAddress.substring(0, 10)}... - ${notification.message}`,
    );
  }

  /**
   * 현재 연결된 클라이언트 수를 반환한다.
   */
  getConnectedClientsCount(): number {
    return this.connectedClients;
  }

  /**
   * 심볼 기반 Room 이름을 생성한다.
   */
  private getSymbolRoom(symbol: string): string {
    return `symbol:${symbol.toUpperCase()}`;
  }

  /**
   * 사용자(지갑 주소) 기반 Room 이름을 생성한다.
   */
  private getUserRoom(walletAddress: string): string {
    return `user:${walletAddress.toLowerCase()}`;
  }
}
