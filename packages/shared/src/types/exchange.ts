/**
 * 거래소 관련 공유 타입 정의
 *
 * 지원하는 거래소 식별자, API Key 쌍, 암호화된 API Key,
 * 거래소 API 요청 서명 관련 타입을 포함한다.
 */

/** 지원하는 거래소 식별자 */
export type ExchangeType = 'upbit' | 'bithumb' | 'coinone' | 'binance' | 'bybit' | 'okx' | 'gate' | 'bitget' | 'hyperliquid';

/** 마켓 통화 단위 */
export type Currency = 'KRW' | 'BTC' | 'USDT' | 'USDC';

/** 거래소 API Key 쌍 (평문) */
export interface ApiKeyPair {
  accessKey: string;
  secretKey: string;
}

/** AES 암호화된 API Key */
export interface EncryptedApiKey {
  /** AES 암호화된 Access Key */
  encryptedAccessKey: string;
  /** AES 암호화된 Secret Key */
  encryptedSecretKey: string;
  /** AES 초기화 벡터 */
  iv: string;
}

/** 거래소 API 요청 서명에 필요한 파라미터 */
export interface SignRequestParams {
  method: 'GET' | 'POST' | 'DELETE';
  endpoint: string;
  queryParams?: Record<string, string>;
  body?: Record<string, unknown>;
  apiKey: ApiKeyPair;
}

/** 서명이 완료된 거래소 API 요청 */
export interface SignedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

/** API Key 유효성 검증 결과 */
export interface ApiKeyValidationResult {
  isValid: boolean;
  /** Read-Only 권한인지 여부 */
  isReadOnly: boolean;
  /** 검증 실패 시 오류 메시지 */
  errorMessage?: string;
  /** 오류 코드 (잘못된 키, 권한 부족, 네트워크 오류 등) */
  errorCode?: 'INVALID_KEY' | 'INSUFFICIENT_PERMISSION' | 'NETWORK_ERROR' | 'UNKNOWN';
}
