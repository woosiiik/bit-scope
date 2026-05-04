/**
 * 코인원 거래소 요청 서명 모듈 (CoinoneSigner)
 *
 * 코인원 API 인증 방식에 따라 HMAC-SHA512 서명을 생성하고,
 * 서명된 요청을 구성한다. 요청 body를 JSON 직렬화한 후
 * Base64 인코딩하여 payload를 구성하고, Secret Key로 HMAC-SHA512
 * 서명을 생성한다.
 *
 * 코인원 인증 방식:
 * - X-COINONE-PAYLOAD 헤더: Base64(JSON({ access_token, nonce, ...body }))
 * - X-COINONE-SIGNATURE 헤더: HMAC-SHA512(payload, secretKey) (Hex 인코딩)
 * - Content-Type: application/json
 *
 * 보안 원칙:
 * - API Key(Secret Key)는 절대 브라우저 밖으로 전송되지 않는다.
 * - nonce/timestamp 기반으로 서명하여 서명된 요청이 일회성이 되도록 한다.
 *
 * @see 요구사항 12.1, 8.17
 * @see https://docs.coinone.co.kr/reference/authentication
 */

import CryptoJS from 'crypto-js';
import type {
  ApiKeyPair,
  ApiKeyValidationResult,
  ExchangeType,
  SignedRequest,
  SignRequestParams,
} from '@bitscope/shared';
import { COINONE_CONFIG, COINONE_ENDPOINTS } from '@bitscope/shared';
import { generateUUID } from '@/lib/utils';

/**
 * UUID v4 형식의 nonce를 생성한다.
 *
 * 요청마다 고유한 nonce를 생성하여 서명된 요청의 재사용을 방지한다.
 *
 * @returns UUID v4 형식의 nonce 문자열
 */
export function generateRequestNonce(): string {
  return generateUUID();
}

/**
 * 현재 시각의 epoch 밀리초 타임스탬프를 반환한다.
 *
 * @returns 현재 시각의 epoch 밀리초
 */
export function generateTimestamp(): number {
  return Date.now();
}

/**
 * query parameter 객체를 URL 인코딩된 querystring 형태로 변환한다.
 *
 * GET 요청에서 URL에 query parameter를 포함할 때 사용한다.
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
 * 코인원 API 요청의 payload 객체를 구성한다.
 *
 * access_token과 nonce를 기본으로 포함하며,
 * 추가 body 파라미터가 있으면 함께 병합한다.
 *
 * @param accessKey 코인원 API Access Token
 * @param nonce 요청 고유 nonce
 * @param body 추가 요청 body 파라미터 (선택)
 * @returns payload 객체
 */
export function buildPayloadObject(
  accessKey: string,
  nonce: string,
  body?: Record<string, unknown>
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    access_token: accessKey,
    nonce,
  };

  if (body && Object.keys(body).length > 0) {
    for (const [key, value] of Object.entries(body)) {
      payload[key] = value;
    }
  }

  return payload;
}

/**
 * payload 객체를 Base64 인코딩한 문자열로 변환한다.
 *
 * 코인원 API에서 X-COINONE-PAYLOAD 헤더에 사용하는 형식으로,
 * JSON 직렬화 후 Base64 인코딩을 수행한다.
 *
 * @param payloadObj payload 객체
 * @returns Base64 인코딩된 payload 문자열
 */
export function encodePayload(payloadObj: Record<string, unknown>): string {
  const jsonString = JSON.stringify(payloadObj);
  return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(jsonString));
}

/**
 * HMAC-SHA512 서명을 생성한다.
 *
 * Base64 인코딩된 payload 문자열을 Secret Key로 HMAC-SHA512 서명하고,
 * Hex 인코딩(소문자)으로 반환한다.
 *
 * @param encodedPayload Base64 인코딩된 payload 문자열
 * @param secretKey 코인원 API Secret Key
 * @returns HMAC-SHA512 서명 (Hex 인코딩, 소문자)
 */
export function createHmacSignature(
  encodedPayload: string,
  secretKey: string
): string {
  const hmac = CryptoJS.HmacSHA512(encodedPayload, secretKey);
  return hmac.toString(CryptoJS.enc.Hex);
}

/**
 * 코인원 거래소 API 요청에 대한 서명을 생성한다.
 *
 * 요청 파라미터를 기반으로 payload를 구성하고 Base64 인코딩한 후,
 * HMAC-SHA512 서명을 생성하여 X-COINONE-PAYLOAD, X-COINONE-SIGNATURE
 * 헤더에 포함한 서명된 요청 객체를 반환한다.
 *
 * 코인원 API 특성:
 * - 인증이 필요한 API는 모두 POST 방식이다.
 * - payload에 access_token과 nonce를 필수로 포함한다.
 * - GET 요청의 경우 query parameter를 URL에 포함한다.
 *
 * @param params 서명 요청 파라미터 (method, endpoint, queryParams, body, apiKey)
 * @returns 서명이 포함된 요청 객체
 * @throws Access Key가 빈 문자열인 경우
 * @throws Secret Key가 빈 문자열인 경우
 */
export function signRequest(params: SignRequestParams): SignedRequest {
  const { method, endpoint, queryParams, body, apiKey } = params;

  if (!apiKey.accessKey) {
    throw new Error('코인원 Access Key가 필요합니다.');
  }
  if (!apiKey.secretKey) {
    throw new Error('코인원 Secret Key가 필요합니다.');
  }

  // nonce 생성
  const nonce = generateRequestNonce();

  // URL 구성
  const baseUrl = COINONE_CONFIG.restBaseUrl;
  let url = `${baseUrl}${endpoint}`;

  // GET 요청의 경우 query parameter를 URL에 포함
  if (queryParams && Object.keys(queryParams).length > 0 && method === 'GET') {
    const queryString = buildQueryString(queryParams);
    url = `${url}?${queryString}`;
  }

  // 코인원 POST 요청에서 queryParams가 전달된 경우 body에 병합한다.
  // 코인원 private API는 POST만 지원하므로 파라미터를 body에 포함해야 한다.
  const mergedBody: Record<string, unknown> = { ...(body || {}) };
  if (method === 'POST' && queryParams && Object.keys(queryParams).length > 0) {
    for (const [key, value] of Object.entries(queryParams)) {
      mergedBody[key] = value;
    }
  }

  // payload 객체 구성 (access_token + nonce + body)
  const payloadBody = Object.keys(mergedBody).length > 0 ? mergedBody : body;
  const payloadObj = buildPayloadObject(apiKey.accessKey, nonce, payloadBody);

  // payload를 Base64 인코딩
  const encodedPayload = encodePayload(payloadObj);

  // HMAC-SHA512 서명 생성
  const signature = createHmacSignature(encodedPayload, apiKey.secretKey);

  // 서명된 요청 헤더 구성
  const headers: Record<string, string> = {
    'X-COINONE-PAYLOAD': encodedPayload,
    'X-COINONE-SIGNATURE': signature,
    'Content-Type': 'application/json',
  };

  const signedRequest: SignedRequest = {
    url,
    method,
    headers,
  };

  // POST 요청의 body 설정
  if (method === 'POST' || method === 'DELETE') {
    const bodyContent = Object.keys(mergedBody).length > 0 ? mergedBody : body;
    if (bodyContent && Object.keys(bodyContent).length > 0) {
      signedRequest.body = JSON.stringify(bodyContent);
    }
  }

  return signedRequest;
}

/**
 * 코인원 API Key의 유효성을 검증한다.
 *
 * 잔고 조회 API(/v2.1/account/balance/all)를 호출하여 API Key가 유효한지 확인한다.
 * 이 함수는 Next.js Route Handler를 통해 릴레이되는 서명된 요청을 생성하고,
 * 실제 거래소 API 호출은 프록시를 통해 수행된다.
 *
 * Read-Only 권한 검증:
 * - 코인원의 경우 balance 조회가 성공하면 기본적으로 조회 권한이 있는 것이다.
 * - 주문/출금 권한은 별도 확인이 필요하지만, 이 서비스에서는 Read-Only만 사용한다.
 *
 * @param apiKey 검증할 API Key 쌍
 * @returns API Key 유효성 검증 결과
 */
export async function validateApiKey(apiKey: ApiKeyPair): Promise<ApiKeyValidationResult> {
  try {
    // 잔고 조회 요청 서명 생성
    const signed = signRequest({
      method: 'POST',
      endpoint: COINONE_ENDPOINTS.balance,
      apiKey,
    });

    // Next.js Route Handler를 통해 프록시 호출
    const response = await fetch('/api/exchange/coinone/balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signedRequest: signed,
      }),
    });

    if (response.ok) {
      const data = await response.json().catch(() => null);

      // Route Handler의 응답 구조: { success, data, error }
      // data.data는 정규화된 잔고 데이터이다.
      if (data && data.success === false) {
        // Route Handler가 오류를 반환한 경우
        const errorCode = data.error?.code;
        const errorMsg = data.error?.message;
        return mapCoinoneErrorToResult(errorCode, errorMsg);
      }

      // 정규화된 잔고 데이터가 있으면 API 키가 유효한 것이다
      if (data && data.success && data.data) {
        return {
          isValid: true,
          isReadOnly: true,
        };
      }

      // 예상치 못한 응답 형식
      return {
        isValid: false,
        isReadOnly: false,
        errorMessage: 'API 키 검증에 실패했습니다: 예상치 못한 응답 형식',
        errorCode: 'UNKNOWN',
      };
    }

    // HTTP 오류 응답 처리
    const errorData = await response.json().catch(() => null);
    const errorMessage = errorData?.error?.message || errorData?.message || `HTTP ${response.status}`;

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
 * 코인원 API 오류 코드를 API Key 유효성 검증 결과로 매핑한다.
 *
 * 코인원 API는 HTTP 200으로 응답하면서 result 필드로 오류를 전달하는 경우가 있다.
 * 주요 오류 코드 (https://docs.coinone.co.kr/docs/error-code):
 * - "4": Blocked user access (차단된 사용자)
 * - "8": Token parameter required
 * - "12": Invalid access token
 * - "21": API registration needed
 * - "40": Unauthorized API permissions
 * - "120": Missing payload (V2)
 * - "121": Invalid payload (V2)
 * - "122": Missing signature (V2)
 * - "123": Invalid signature (V2)
 * - "130-133": Nonce validation failures (V2)
 * - "151": V1 token incompatible with V2
 *
 * @param errorCode 코인원 API 오류 코드
 * @param errorMessage 코인원 API 오류 메시지
 * @returns API Key 유효성 검증 결과
 */
function mapCoinoneErrorToResult(errorCode?: string, errorMessage?: string): ApiKeyValidationResult {
  switch (errorCode) {
    // 잘못된 API 키 관련 오류
    case '8':   // Token parameter required
    case '12':  // Invalid access token
    case '121': // Invalid payload (V2)
    case '123': // Invalid signature (V2)
    case '151': // V1 token incompatible with V2
      return {
        isValid: false,
        isReadOnly: false,
        errorMessage: '잘못된 API 키입니다. Access Key와 Secret Key를 확인해주세요.',
        errorCode: 'INVALID_KEY',
      };

    // 권한 부족 관련 오류
    case '4':   // Blocked user access
    case '21':  // API registration needed
    case '40':  // Unauthorized API permissions
      return {
        isValid: false,
        isReadOnly: false,
        errorMessage: 'API 키 권한이 부족합니다. Read-Only 권한의 API 키로 재발급해주세요.',
        errorCode: 'INSUFFICIENT_PERMISSION',
      };

    // 서명/페이로드 형식 관련 오류 (클라이언트 구현 이슈)
    case '120': // Missing payload
    case '122': // Missing signature
    case '130': // Nonce validation failure
    case '131': // Nonce validation failure
    case '132': // Nonce validation failure
    case '133': // Nonce validation failure
      return {
        isValid: false,
        isReadOnly: false,
        errorMessage: '서명 생성에 문제가 있습니다. 앱을 새로고침 후 다시 시도해주세요.',
        errorCode: 'INVALID_KEY',
      };

    default:
      return {
        isValid: false,
        isReadOnly: false,
        errorMessage: `코인원 API 오류 (${errorCode || 'unknown'}): ${errorMessage || '알 수 없는 오류'}`,
        errorCode: 'UNKNOWN',
      };
  }
}

/**
 * 코인원 거래소 식별자를 반환한다.
 *
 * @returns 'coinone'
 */
export function getExchangeType(): ExchangeType {
  return 'coinone';
}
