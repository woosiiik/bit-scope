/**
 * OKX 거래소 요청 서명 모듈 (OkxSigner)
 *
 * OKX API v5 인증 방식에 따라 HMAC-SHA256 + Base64 서명을 생성하고,
 * 서명된 요청을 구성한다.
 *
 * OKX 인증 방식:
 * - OK-ACCESS-KEY 헤더: API Key
 * - OK-ACCESS-SIGN 헤더: HMAC-SHA256 서명 (Base64 인코딩)
 * - OK-ACCESS-TIMESTAMP 헤더: ISO 8601 UTC 타임스탬프 (예: "2024-01-01T00:00:00.000Z")
 * - OK-ACCESS-PASSPHRASE 헤더: Passphrase
 * - 서명 문자열: timestamp + method + requestPath + body
 *
 * Passphrase 처리:
 * - OKX는 API Key 외에 Passphrase가 추가로 필요하다.
 * - 기존 ApiKeyPair 타입 변경을 최소화하기 위해
 *   secretKey 필드에 "실제SecretKey|||passphrase" 형식으로 합쳐서 저장한다.
 * - 서명 시 "|||" 구분자로 분리하여 실제 secretKey와 passphrase를 추출한다.
 *
 * 보안 원칙:
 * - API Key(Secret Key/Passphrase)는 절대 브라우저 밖으로 전송되지 않는다.
 * - ISO 8601 타임스탬프 기반으로 서명하여 서명된 요청이 일회성이 되도록 한다.
 *
 * @see https://www.okx.com/docs-v5/en/#overview-rest-authentication
 */

import CryptoJS from 'crypto-js';
import type {
  ApiKeyPair,
  ApiKeyValidationResult,
  ExchangeType,
  SignedRequest,
  SignRequestParams,
} from '@bitscope/shared';
import { OKX_CONFIG, OKX_ENDPOINTS } from '@bitscope/shared';

/** OKX secretKey 내 passphrase 구분자 */
const PASSPHRASE_SEPARATOR = '|||';

/**
 * secretKey 필드에서 실제 Secret Key와 Passphrase를 분리한다.
 *
 * secretKey에 "|||" 구분자가 포함되어 있으면 분리하고,
 * 없으면 passphrase를 빈 문자열로 처리한다.
 *
 * @param combinedSecretKey "실제SecretKey|||passphrase" 형식의 문자열
 * @returns 분리된 { secretKey, passphrase }
 */
export function splitSecretKeyAndPassphrase(combinedSecretKey: string): {
  secretKey: string;
  passphrase: string;
} {
  const separatorIndex = combinedSecretKey.indexOf(PASSPHRASE_SEPARATOR);
  if (separatorIndex === -1) {
    return { secretKey: combinedSecretKey, passphrase: '' };
  }
  return {
    secretKey: combinedSecretKey.substring(0, separatorIndex),
    passphrase: combinedSecretKey.substring(separatorIndex + PASSPHRASE_SEPARATOR.length),
  };
}

/**
 * 현재 시각의 ISO 8601 UTC 타임스탬프를 반환한다.
 *
 * OKX API는 바이낸스/바이빗과 달리 ISO 8601 UTC 형식의 타임스탬프를 요구한다.
 * 예: "2024-01-01T00:00:00.000Z"
 *
 * @returns ISO 8601 UTC 타임스탬프 문자열
 */
export function generateTimestamp(): string {
  return new Date().toISOString();
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
 * HMAC-SHA256 서명을 생성하고 Base64로 인코딩한다.
 *
 * OKX는 바이낸스/바이빗과 달리 서명 결과를 Base64로 인코딩한다.
 * 서명 문자열: timestamp + method + requestPath + body
 *
 * @param preSignString 서명 대상 문자열
 * @param secretKey OKX API Secret Key (실제 키, passphrase가 분리된 상태)
 * @returns HMAC-SHA256 서명 (Base64 인코딩)
 */
export function createSignature(preSignString: string, secretKey: string): string {
  const hash = CryptoJS.HmacSHA256(preSignString, secretKey);
  return CryptoJS.enc.Base64.stringify(hash);
}

/**
 * OKX 거래소 API 요청에 대한 서명을 생성한다.
 *
 * 요청 파라미터를 기반으로 HMAC-SHA256 + Base64 서명을 생성하고,
 * OK-ACCESS-KEY, OK-ACCESS-SIGN, OK-ACCESS-TIMESTAMP, OK-ACCESS-PASSPHRASE 헤더를
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
    throw new Error('OKX API Key가 필요합니다.');
  }
  if (!apiKey.secretKey) {
    throw new Error('OKX Secret Key가 필요합니다.');
  }

  // secretKey에서 실제 Secret Key와 Passphrase를 분리
  const { secretKey: realSecretKey, passphrase } = splitSecretKeyAndPassphrase(apiKey.secretKey);

  if (!passphrase) {
    throw new Error('OKX Passphrase가 필요합니다. Secret Key를 "secretKey|||passphrase" 형식으로 입력해주세요.');
  }

  const timestamp = generateTimestamp();

  // requestPath 구성 (endpoint + queryString)
  // OKX 공식 문서: GET 요청 시 query parameter는 requestPath에 포함된다.
  let requestPath = endpoint;
  if (queryParams && Object.keys(queryParams).length > 0) {
    const qs = buildQueryString(queryParams);
    requestPath = `${endpoint}?${qs}`;
  }

  // body 문자열 구성 (POST/DELETE 요청 시 body가 있을 수 있음)
  let bodyString = '';
  if (method !== 'GET' && body) {
    bodyString = JSON.stringify(body);
  }

  // 서명 문자열: timestamp + METHOD + requestPath + body
  // OKX 공식 문서: method는 대문자 (GET, POST)
  const preSignString = timestamp + method.toUpperCase() + requestPath + bodyString;

  // HMAC-SHA256 + Base64 서명 생성
  const signature = createSignature(preSignString, realSecretKey);

  // URL 구성
  const baseUrl = OKX_CONFIG.restBaseUrl;
  const url = `${baseUrl}${requestPath}`;

  // 헤더 구성
  const headers: Record<string, string> = {
    'OK-ACCESS-KEY': apiKey.accessKey,
    'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': passphrase,
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
 * OKX API Key의 유효성을 검증한다.
 *
 * 잔고 조회 API(/api/v5/account/balance)를 호출하여
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
      endpoint: OKX_ENDPOINTS.balance,
      apiKey,
    });

    // Next.js Route Handler를 통해 프록시 호출
    const response = await fetch('/api/exchange/okx/balance', {
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
        errorMessage: '잘못된 API 키입니다. API Key, Secret Key, Passphrase를 확인해주세요.',
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
    const message = error instanceof Error ? error.message : '알 수 없는 오류';

    // Passphrase 누락 등 입력값 오류는 INVALID_KEY로 분류
    if (message.includes('Passphrase') || message.includes('API Key') || message.includes('Secret Key')) {
      return {
        isValid: false,
        isReadOnly: false,
        errorMessage: message,
        errorCode: 'INVALID_KEY',
      };
    }

    return {
      isValid: false,
      isReadOnly: false,
      errorMessage: `네트워크 오류가 발생했습니다: ${message}`,
      errorCode: 'NETWORK_ERROR',
    };
  }
}

/**
 * OKX 거래소 식별자를 반환한다.
 *
 * @returns 'okx'
 */
export function getExchangeType(): ExchangeType {
  return 'okx';
}
