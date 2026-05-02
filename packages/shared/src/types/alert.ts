/**
 * 알림 관련 공유 타입 정의
 *
 * 가격 알림 조건, 알림 설정, 알림 이력,
 * 알림 발송 관련 타입을 포함한다.
 */

import type { ExchangeType } from './exchange';

/** 알림 조건 유형 */
export type AlertCondition =
  | 'above'          // 가격이 목표가 이상
  | 'below'          // 가격이 목표가 이하
  | 'premium_above'  // 김프가 임계값 이상
  | 'premium_below'; // 김프가 임계값 이하

/** 알림 설정 */
export interface AlertConfig {
  /** 코인 심볼 */
  symbol: string;
  /** 대상 거래소 (null이면 모든 거래소) */
  exchange?: ExchangeType;
  /** 알림 조건 */
  condition: AlertCondition;
  /** 목표 가격 또는 프리미엄 비율 (%) */
  targetValue: number;
  /** 활성 상태 여부 */
  isActive: boolean;
}

/** 알림 엔티티 */
export interface Alert {
  /** 알림 고유 ID (UUID) */
  id: string;
  /** 사용자 지갑 주소 */
  walletAddress: string;
  /** 알림 설정 */
  config: AlertConfig;
  /** 생성 일시 */
  createdAt: Date;
  /** 수정 일시 */
  updatedAt: Date;
}

/** 알림 발생 이력 */
export interface AlertHistory {
  /** 이력 고유 ID (UUID) */
  id: string;
  /** 알림 ID (FK) */
  alertId: string;
  /** 알림 발생 시각 */
  triggeredAt: Date;
  /** 알림 발생 시점의 값 (가격 또는 프리미엄 비율) */
  triggeredValue: number;
  /** 알림 메시지 */
  message: string;
}

/** 발생한 알림 (WebSocket 전달용) */
export interface TriggeredAlert {
  /** 알림 설정 */
  alert: Alert;
  /** 발생 시점의 값 */
  triggeredValue: number;
  /** 알림 메시지 */
  message: string;
  /** 발생 시각 */
  triggeredAt: Date;
}

/** 알림 알림 (클라이언트 수신용) */
export interface AlertNotification {
  /** 알림 ID */
  alertId: string;
  /** 코인 심볼 */
  symbol: string;
  /** 알림 조건 */
  condition: AlertCondition;
  /** 목표값 */
  targetValue: number;
  /** 발생 시점의 실제 값 */
  triggeredValue: number;
  /** 표시할 메시지 */
  message: string;
  /** 발생 시각 */
  triggeredAt: Date;
}
