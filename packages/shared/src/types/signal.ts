/**
 * 롱/숏 시그널 공유 타입 정의
 */

/** 시그널 방향 */
export type SignalDirection = 'LONG' | 'SHORT';

/** 코인별 최신 시그널 */
export interface CoinLatestSignal {
  coinSymbol: string;
  direction: SignalDirection;
  signalType: string;
  sectionName: string | null;
  signalAt: string;
}

/** 시그널 항목 */
export interface SignalItem {
  id: number;
  coinSymbol: string;
  direction: SignalDirection;
  signalType: string;
  sectionName: string | null;
  signalAt: string;
}

/** 시그널 목록 응답 */
export interface SignalListResponse {
  items: SignalItem[];
  total: number;
  page: number;
  limit: number;
}

/** 비밀번호 검증 요청 */
export interface VerifyPasswordRequest {
  password: string;
}

/** 비밀번호 검증 응답 */
export interface VerifyPasswordResponse {
  success: boolean;
  token?: string;
  error?: string;
}
