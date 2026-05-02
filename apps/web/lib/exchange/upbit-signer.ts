/**
 * 업비트 거래소 요청 서명 모듈 (UpbitSigner)
 *
 * 업비트 API 인증 방식에 따라 JWT(HS256) 토큰을 생성하고,
 * 서명된 요청을 구성한다. query parameter가 있는 경우
 * SHA-512 해시를 query_hash로 포함하여 요청 무결성을 보장한다.
 *
 * 업비트 인증 방식:
 * - JWT 헤더: { "alg": "HS256", "typ": "JWT" }
 * - JWT 페이로드: { "access_key": "...", "nonce": "UUID", "timestamp": epoch_ms }
 * - query parameter가 있으면: { ..., "query_hash": SHA512(queryString), "query_hash_alg": "SHA512" }
 *
 * 보안 원칙:
 * - API Key(Secret Key)는 절대 브라우저 밖으로 전송되지 않는다.
 * - nonce/timestamp 기반으로 서명하여 서명된 요청이 일회성이 되도록 한다.
 *
 * @see 요구사항 12.1, 8.17
 * @see https://docs.upbit.com/docs/create-authorization-token
 */

import CryptoJS from 'crypto-js';
import type {
  ApiKeyPair,
  ApiKeyValidationResult,
  ExchangeType,
  SignedRequest,
  SignRequestParams,
} from '@bitscope/shared';
import { UPBIT_CONFIG, UPBIT_ENDPOINTS } from '@bitscope/shared';

/**
 * Base64URL 인코딩을 수행한다.
 *
 * 표준 Base64 인코딩 결과에서 JWT 표준에 맞게
 * '+' -> '-', '/' -> '_' 로 치환하고, 패딩('=')을 제거한다.
 *
 * @param wordArray crypto-js WordArray 또는 문자열
 * @returns Base64URL 인코딩된 문자열
 */
function base64UrlEncode(input: string): string {
  const base64 = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(input));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * UUID v4 형식의 nonce를 생성한다.
 *
 * 요청마다 고유한 nonce를 생성하여 서명된 요청의 재사용을 방지한다.
 *
 * @returns UUID v4 형식의 nonce 문자열
 */
function generateRequestNonce(): string {
  return crypto.randomUUID();
}

/**
 * query parameter 객체를 querystring 형태로 변환한다.
 *
 * 업비트 API에서 query_hash 계산 시 사용하는 형식으로
 * key=value 쌍을 '&'로 연결한다.
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
 * querystring의 SHA-512 해시를 계산한다.
 *
 * 업비트 API에서 query parameter가 있는 요청에 대해
 * 요청 무결성을 검증하기 위해 query_hash를 생성한다.
 *
 * @param queryString querystring 문자열
 * @returns SHA-512 해시 결과 (hex, 소문자)
 */
export function hashQueryString(queryString: string): string {
  return CryptoJS.SHA512(queryString).toString(CryptoJS.enc.Hex);
}

/**
 * 업비트 API 인증용 JWT 페이로드를 생성한다.
 *
 * query parameter가 없는 경우:
 *   { access_key, nonce, timestamp }
 *
 * query parameter가 있는 경우:
 *   { access_key, nonce, timestamp, query_hash, query_hash_alg: "SHA512" }
 *
 * @param accessKey 업비트 API Access Key
 * @param queryString query parameter 문자열 (선택)
 * @returns JWT 페이로드 객체
 */
export function buildJwtPayload(
  accessKey: string,
  queryString?: string
): Record<string, string | number> {
  const nonce = generateRequestNonce();
  const timestamp = Date.now();

  const payload: Record<string, string | number> = {
    access_key: accessKey,
    nonce,
    timestamp,
  };

  if (queryString) {
    payload.query_hash = hashQueryString(queryString);
    payload.query_hash_alg = 'SHA512';
  }

  return payload;
}

/**
 * JWT 토큰을 생성한다 (HS256 알고리즘).
 *
 * crypto-js의 HmacSHA256을 사용하여 브라우저 환경에서
 * JWT 서명을 수행한다. HTTPS 없이도 동작 가능하다.
 *
 * JWT 구조: header.payload.signature
 * - header: { "alg": "HS256", "typ": "JWT" }
 * - payload: 업비트 API 인증 정보
 * - signature: HMAC-SHA256(header.payload, secretKey)
 *
 * @param payload JWT 페이로드 객체
 * @param secretKey 업비트 API Secret Key (HMAC 서명 키)
 * @returns 완성된 JWT 토큰 문자열
 */
export function createJwtToken(
  payload: Record<string, string | number>,
  secretKey: string
): string {
  // JWT 헤더
  const header = { alg: 'HS256', typ: 'JWT' };

  // 헤더와 페이로드를 Base64URL 인코딩
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  // 서명 대상 문자열
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // HMAC-SHA256 서명
  const signature = CryptoJS.HmacSHA256(signingInput, secretKey);
  const encodedSignature = CryptoJS.enc.Base64.stringify(signature)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${signingInput}.${encodedSignature}`;
}

/**
 * 업비트 거래소 API 요청에 대한 서명을 생성한다.
 *
 * 요청 파라미터를 기반으로 JWT 토큰을 생성하고,
 * Authorization 헤더에 "Bearer {JWT}" 형식으로 포함하여
 * 서명된 요청 객체를 반환한다.
 *
 * @param params 서명 요청 파라미터 (method, endpoint, queryParams, body, apiKey)
 * @returns 서명이 포함된 요청 객체
 * @throws Access Key가 빈 문자열인 경우
 * @throws Secret Key가 빈 문자열인 경우
 */
export function signRequest(params: SignRequestParams): SignedRequest {
  const { method, endpoint, queryParams, body, apiKey } = params;

  if (!apiKey.accessKey) {
    throw new Error('업비트 Access Key가 필요합니다.');
  }
  if (!apiKey.secretKey) {
    throw new Error('업비트 Secret Key가 필요합니다.');
  }

  // querystring 구성
  let queryString = '';
  if (queryParams && Object.keys(queryParams).length > 0) {
    queryString = buildQueryString(queryParams);
  } else if (body && Object.keys(body).length > 0) {
    // POST/DELETE 요청의 body를 querystring으로 변환하여 해시에 포함
    const bodyParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(body)) {
      bodyParams[key] = String(value);
    }
    queryString = buildQueryString(bodyParams);
  }

  // JWT 페이로드 생성 (querystring이 있으면 query_hash 포함)
  const jwtPayload = buildJwtPayload(
    apiKey.accessKey,
    queryString || undefined
  );

  // JWT 토큰 생성
  const token = createJwtToken(jwtPayload, apiKey.secretKey);

  // URL 구성
  const baseUrl = UPBIT_CONFIG.restBaseUrl;
  let url = `${baseUrl}${endpoint}`;
  if (queryString && (method === 'GET' || method === 'DELETE')) {
    url = `${url}?${queryString}`;
  }

  // 서명된 요청 객체 구성
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const signedRequest: SignedRequest = {
    url,
    method,
    headers,
  };

  // POST/DELETE 요청의 body 설정
  if (body && (method === 'POST' || method === 'DELETE')) {
    signedRequest.body = JSON.stringify(body);
  }

  return signedRequest;
}

/**
 * 업비트 API Key의 유효성을 검증한다.
 *
 * 잔고 조회 API(/v1/accounts)를 호출하여 API Key가 유효한지 확인한다.
 * 이 함수는 Next.js Route Handler를 통해 릴레이되는 서명된 요청을 생성하고,
 * 실제 거래소 API 호출은 프록시를 통해 수행된다.
 *
 * Read-Only 권한 검증:
 * - 업비트의 경우 accounts 조회가 성공하면 기본적으로 조회 권한이 있는 것이다.
 * - 주문/출금 권한은 별도 확인이 필요하지만, 이 서비스에서는 Read-Only만 사용한다.
 *
 * @param apiKey 검증할 API Key 쌍
 * @returns API Key 유효성 검증 결과
 */
export async function validateApiKey(apiKey: ApiKeyPair): Promise<ApiKeyValidationResult> {
  try {
    // 잔고 조회 요청 서명 생성
    const signed = signRequest({
      method: 'GET',
      endpoint: UPBIT_ENDPOINTS.balance,
      apiKey,
    });

    // Next.js Route Handler를 통해 프록시 호출
    const response = await fetch('/api/exchange/upbit/balance', {
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
    const errorMessage = errorData?.message || `HTTP ${response.status}`;

    if (response.status === 401) {
      return {
        isValid: false,
        isReadOnly: false,
        errorMessage: '잘못된 API 키입니다. Access Key와 Secret Key를 확인해주세요.',
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
 * 업비트 거래소 식별자를 반환한다.
 *
 * @returns 'upbit'
 */
export function getExchangeType(): ExchangeType {
  return 'upbit';
}
