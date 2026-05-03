/**
 * 바이빗 거래소 요청 서명 모듈 (BybitSigner)
 *
 * 바이빗 API v5 인증 방식에 따라 HMAC-SHA256 서명을 생성하고,
 * 서명된 요청을 구성한다.
 *
 * 바이빗 인증 방식:
 * - X-BAPI-API-KEY 헤더: API Key
 * - X-BAPI-TIMESTAMP 헤더: 타임스탬프 (밀리초)
 * - X-BAPI-SIGN 헤더: HMAC-SHA256 서명
 * - X-BAPI-RECV-WINDOW 헤더: 수신 윈도우 (기본 5000)
 * - 서명 문자열: timestamp + apiKey + recvWindow + queryString (GET) 또는 body (POST)
 *
 * 보안 원칙:
 * - API Key(Secret Key)는 절대 브라우저 밖으로 전송되지 않는다.
 * - timestamp 기반으로 서명하여 서명된 요청이 일회성이 되도록 한다.
 *
 * @see https://bybit-exchange.github.io/docs/v5/guide
 */

import CryptoJS from 'crypto-js';
import type {
  ApiKeyPair,
  ApiKeyValidationResult,
  ExchangeType,
  SignedRequest,
  SignRequestParams,
} from '@bitscope/shared';
import { BYBIT_CONFIG, BYBIT_ENDPOINTS } from '@bitscope/shared';

/** recvWindow 기본값 (밀리초) */
const DEFAULT_RECV_WINDOW = '5000';

/**
 * 현재 시각의 epoch 밀리초 타임스탬프를 반환한다.
 *
 * @returns 현재 시각의 epoch 밀리초
 */
export function generateTimestamp(): number {
  return Date.now();
}

/**
 * query parameter 객체를 querystring 형태로 변환한다.
 *
 * @param params query parameter 객체
 * @returns URL 인코딩된 querystring
 */
export function buildQueryString(params: Record<string, string>): string {
  const entries = Object.entries(params);
  if (entries.length === 0) {
    return '';
  }

  return entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

/**
 * HMAC-SHA256 서명을 생성한다.
 *
 * 바이빗 API v5에서는 timestamp + apiKey + recvWindow + params 문자열을
 * HMAC-SHA256으로 서명한다.
 *
 * @param signString 서명 대상 문자열 (timestamp + apiKey + recvWindow + params)
 * @param secretKey 바이빗 API Secret Key
 * @returns HMAC-SHA256 서명 (hex, 소문자)
 */
export function createSignature(signString: string, secretKey: string): string {
  return CryptoJS.HmacSHA256(signString, secretKey).toString(CryptoJS.enc.Hex);
}

/**
 * 바이빗 거래소 API 요청에 대한 서명을 생성한다.
 *
 * 요청 파라미터를 기반으로 HMAC-SHA256 서명을 생성하고,
 * X-BAPI-API-KEY, X-BAPI-TIMESTAMP, X-BAPI-SIGN, X-BAPI-RECV-WINDOW 헤더를
 * 포함하여 서명된 요청 객체를 반환한다.
 *
 * @param params 서명 요청 파라미터 (method, endpoint, queryParams, body, apiKey)
 * @returns 서명이 포함된 요청 객체
 * @throws API Key가 빈 문자열인 경우
 * @throws Secret Key가 빈 문자열인 경우
 */
export function signRequest(params: SignRequestParams): SignedRequest {
  const { method, endpoint, queryParams, body, apiKey } = params;

  if (!apiKey.accessKey) {
    throw new Error('바이빗 API Key가 필요합니다.');
  }
  if (!apiKey.secretKey) {
    throw new Error('바이빗 Secret Key가 필요합니다.');
  }

  const timestamp = String(generateTimestamp());
  const recvWindow = DEFAULT_RECV_WINDOW;

  // GET 요청: queryString, POST 요청: body JSON 문자열
  let paramString = '';
  if (method === 'GET' && queryParams && Object.keys(queryParams).length > 0) {
    paramString = buildQueryString(queryParams);
  } else if (method === 'POST' && body) {
    paramString = JSON.stringify(body);
  }

  // 서명 문자열: timestamp + apiKey + recvWindow + paramString
  const signString = timestamp + apiKey.accessKey + recvWindow + paramString;

  // HMAC-SHA256 서명 생성
  const signature = createSignature(signString, apiKey.secretKey);

  // URL 구성
  const baseUrl = BYBIT_CONFIG.restBaseUrl;
  let url = `${baseUrl}${endpoint}`;
  if (method === 'GET' && paramString) {
    url = `${url}?${paramString}`;
  }

  // 헤더 구성
  const headers: Record<string, string> = {
    'X-BAPI-API-KEY': apiKey.accessKey,
    'X-BAPI-TIMESTAMP': timestamp,
    'X-BAPI-SIGN': signature,
    'X-BAPI-RECV-WINDOW': recvWindow,
    'Content-Type': 'application/json',
  };

  const signedRequest: SignedRequest = {
    url,
    method,
    headers,
  };

  // POST 요청인 경우 body 추가
  if (method === 'POST' && body) {
    signedRequest.body = JSON.stringify(body);
  }

  return signedRequest;
}

/**
 * 바이빗 API Key의 유효성을 검증한다.
 *
 * 지갑 잔고 조회 API(/v5/account/wallet-balance?accountType=UNIFIED)를 호출하여
 * API Key가 유효한지 확인한다.
 * Next.js Route Handler를 통해 릴레이되는 서명된 요청을 생성하고,
 * 실제 거래소 API 호출은 프록시를 통해 수행된다.
 *
 * @param apiKey 검증할 API Key 쌍
 * @returns API Key 유효성 검증 결과
 */
export async function validateApiKey(apiKey: ApiKeyPair): Promise<ApiKeyValidationResult> {
  try {
    // 잔고 조회 요청 서명 생성 (accountType=UNIFIED 필수)
    const signed = signRequest({
      method: 'GET',
      endpoint: BYBIT_ENDPOINTS.balance,
      queryParams: {
        accountType: 'UNIFIED',
      },
      apiKey,
    });

    // Next.js Route Handler를 통해 프록시 호출
    const response = await fetch('/api/exchange/bybit/balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signedRequest: signed,
      }),
    });

    if (response.ok) {
      return {
        isValid: true,
        isReadOnly: true,
      };
    }

    // HTTP 오류 응답 처리
    const errorData = await response.json().catch(() => null);
    const errorMessage = errorData?.error?.message || errorData?.message || `HTTP ${response.status}`;

    if (response.status === 401) {
      return {
        isValid: false,
        isReadOnly: false,
        errorMessage: '잘못된 API 키입니다. API Key와 Secret Key를 확인해주세요.',
        errorCode: 'INVALID_KEY',
      };
    }

    if (response.status === 403) {
      return {
        isValid: false,
        isReadOnly: false,
        errorMessage: 'API 키 권한이 부족합니다. Read-Only 권한의 API 키로 재발급해주세요.',
        errorCode: 'INSUFFICIENT_PERMISSION',
      };
    }

    return {
      isValid: false,
      isReadOnly: false,
      errorMessage: `API 키 검증에 실패했습니다: ${errorMessage}`,
      errorCode: 'UNKNOWN',
    };
  } catch (error) {
    return {
      isValid: false,
      isReadOnly: false,
      errorMessage: `네트워크 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
      errorCode: 'NETWORK_ERROR',
    };
  }
}

/**
 * 바이빗 거래소 식별자를 반환한다.
 *
 * @returns 'bybit'
 */
export function getExchangeType(): ExchangeType {
  return 'bybit';
}
