/**
 * Gate.io 거래소 요청 서명 모듈 (GateSigner)
 *
 * Gate.io API v4 인증 방식에 따라 HMAC-SHA512 서명을 생성하고,
 * 서명된 요청을 구성한다.
 *
 * Gate.io 인증 방식:
 * - KEY 헤더: API Key
 * - SIGN 헤더: HMAC-SHA512 서명 (hex)
 * - Timestamp 헤더: Unix timestamp (초)
 * - 서명 문자열: method + '\n' + path + '\n' + queryString + '\n' + SHA512(body) + '\n' + timestamp
 *
 * 보안 원칙:
 * - API Key(Secret Key)는 절대 브라우저 밖으로 전송되지 않는다.
 * - timestamp 기반으로 서명하여 서명된 요청이 일회성이 되도록 한다.
 *
 * @see https://www.gate.io/docs/developers/apiv4/en/#authentication
 */

import CryptoJS from 'crypto-js';
import type {
  ApiKeyPair,
  ApiKeyValidationResult,
  ExchangeType,
  SignedRequest,
  SignRequestParams,
} from '@bitscope/shared';
import { GATE_CONFIG, GATE_ENDPOINTS } from '@bitscope/shared';

/**
 * 현재 시각의 Unix 타임스탬프(초)를 반환한다.
 *
 * Gate.io API는 초 단위의 Unix 타임스탬프를 요구한다.
 *
 * @returns 현재 시각의 Unix 타임스탬프 (초)
 */
export function generateTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * query parameter 객체를 querystring 형태로 변환한다.
 *
 * Gate.io 공식 문서: "Request query string without URL encode"
 * 서명 대상 문자열에는 URL 인코딩 없이 원본 값을 사용한다.
 *
 * @param params query parameter 객체
 * @returns URL 인코딩되지 않은 querystring
 */
export function buildQueryString(params: Record<string, string>): string {
  const entries = Object.entries(params);
  if (entries.length === 0) {
    return '';
  }

  return entries
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

/**
 * 문자열의 SHA-512 해시를 생성한다.
 *
 * Gate.io는 서명 문자열에 body의 SHA-512 해시를 포함한다.
 *
 * @param data 해시할 문자열
 * @returns SHA-512 해시 (hex, 소문자)
 */
export function sha512(data: string): string {
  return CryptoJS.SHA512(data).toString(CryptoJS.enc.Hex);
}

/**
 * HMAC-SHA512 서명을 생성한다.
 *
 * Gate.io는 서명 결과를 hex 인코딩한다.
 * 서명 문자열: method + '\n' + path + '\n' + queryString + '\n' + SHA512(body) + '\n' + timestamp
 *
 * @param signString 서명 대상 문자열
 * @param secretKey Gate.io API Secret Key
 * @returns HMAC-SHA512 서명 (hex, 소문자)
 */
export function createSignature(signString: string, secretKey: string): string {
  return CryptoJS.HmacSHA512(signString, secretKey).toString(CryptoJS.enc.Hex);
}

/**
 * Gate.io 거래소 API 요청에 대한 서명을 생성한다.
 *
 * 요청 파라미터를 기반으로 HMAC-SHA512 서명을 생성하고,
 * KEY, SIGN, Timestamp 헤더를 포함하여 서명된 요청 객체를 반환한다.
 *
 * @param params 서명 요청 파라미터 (method, endpoint, queryParams, body, apiKey)
 * @returns 서명이 포함된 요청 객체
 * @throws API Key가 빈 문자열인 경우
 * @throws Secret Key가 빈 문자열인 경우
 */
export function signRequest(params: SignRequestParams): SignedRequest {
  const { method, endpoint, queryParams, body, apiKey } = params;

  if (!apiKey.accessKey) {
    throw new Error('Gate.io API Key가 필요합니다.');
  }
  if (!apiKey.secretKey) {
    throw new Error('Gate.io Secret Key가 필요합니다.');
  }

  const timestamp = String(generateTimestamp());

  // queryString 구성
  let queryString = '';
  if (queryParams && Object.keys(queryParams).length > 0) {
    queryString = buildQueryString(queryParams);
  }

  // body 문자열 및 body 해시 구성 (POST/DELETE 등 body가 있을 수 있음)
  let bodyString = '';
  if (method !== 'GET' && body) {
    bodyString = JSON.stringify(body);
  }
  const bodyHash = sha512(bodyString);

  // 서명 문자열: METHOD + '\n' + path + '\n' + queryString + '\n' + SHA512(body) + '\n' + timestamp
  // Gate.io 공식 문서: method는 대문자 (GET, POST, DELETE 등)
  const signString = `${method}\n${endpoint}\n${queryString}\n${bodyHash}\n${timestamp}`;

  // HMAC-SHA512 서명 생성
  const signature = createSignature(signString, apiKey.secretKey);

  // URL 구성
  const baseUrl = GATE_CONFIG.restBaseUrl;
  let url = `${baseUrl}${endpoint}`;
  if (queryString) {
    url = `${url}?${queryString}`;
  }

  // 헤더 구성
  const headers: Record<string, string> = {
    'KEY': apiKey.accessKey,
    'SIGN': signature,
    'Timestamp': timestamp,
    'Content-Type': 'application/json',
  };

  const signedRequest: SignedRequest = {
    url,
    method,
    headers,
  };

  // body가 있으면 추가 (POST, DELETE 등)
  if (bodyString) {
    signedRequest.body = bodyString;
  }

  return signedRequest;
}

/**
 * Gate.io API Key의 유효성을 검증한다.
 *
 * 잔고 조회 API(/api/v4/spot/accounts)를 호출하여
 * API Key가 유효한지 확인한다.
 * Next.js Route Handler를 통해 릴레이되는 서명된 요청을 생성하고,
 * 실제 거래소 API 호출은 프록시를 통해 수행된다.
 *
 * @param apiKey 검증할 API Key 쌍
 * @returns API Key 유효성 검증 결과
 */
export async function validateApiKey(apiKey: ApiKeyPair): Promise<ApiKeyValidationResult> {
  try {
    // 잔고 조회 요청 서명 생성
    const signed = signRequest({
      method: 'GET',
      endpoint: GATE_ENDPOINTS.balance,
      apiKey,
    });

    // Next.js Route Handler를 통해 프록시 호출
    const response = await fetch('/api/exchange/gate/balance', {
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
 * Gate.io 거래소 식별자를 반환한다.
 *
 * @returns 'gate'
 */
export function getExchangeType(): ExchangeType {
  return 'gate';
}
