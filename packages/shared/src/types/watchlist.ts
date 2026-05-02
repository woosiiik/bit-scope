/**
 * 워치리스트(관심 코인) 관련 공유 타입 정의
 */

import type { AlertConfig } from './alert';

/** 워치리스트 항목 */
export interface WatchlistItem {
  /** 코인 심볼 */
  symbol: string;
  /** 추가 일시 */
  addedAt: Date;
  /** 해당 코인에 설정된 알림 목록 */
  alertConfigs: AlertConfig[];
}
