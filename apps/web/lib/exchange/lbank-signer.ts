/**
 * LBank 거래소 요청 서명 모듈 (LBankSigner)
 *
 * LBank API v2 인증 방식에 따라 HmacSHA256 서명을 생성하고,
 * 서명된 요청을 구성한다.
 *
 * LBank 인증 방식:
 * - 파라미터를 알파벳순 정렬 → URL 인코딩 → MD5 해시 → 대문자 변환 → HmacSHA256 서명
 * - 모든 Private API는 POST + application/x-www-form-urlencoded
 * - 헤더에 timestamp, signature_method, echostr(30~40자 랜덤) 포함
 * - Secret Key 32자 이하: HmacSHA256 (지원)
 * - Secret Key 32자 초과: RSA (미지원 - 오류 반환)
 *
 * @see https://github.com/LBank-exchange/lbank-official-api-docs
 */

import CryptoJS from 'crypto-js';
import type {
  ApiKeyPair,
  ApiKeyValidationResult,
  ExchangeType,
  SignedRequest,
  SignRequestParams,
} from '@bitscope/shared';
import { LBANK_CONFIG, LBANK_ENDPOINTS } from '@bitscope/shared';

/** echostr에 사용할 영숫자 문자셋 */
const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * 30~40자 길이의 영숫자 랜덤 문자열을 생성한다.
 *
 * LBank API는 echostr 길이가 30~40자여야 한다 (에러코드 10031).
 * CCXT 구현에서는 uuid22 + uuid16 조합으로 38자를 생성한다.
 *
 * @returns 38자 영숫자 랜덤 문자열
 */
export function generateEchostr(): string {
  let result = '';
  for (let i = 0; i < 38; i++) {
    result += ALPHANUMERIC.charAt(Math.floor(Math.random() * ALPHANUMERIC.length));
  }
  return result;
}

/**
 * 현재 시각의 밀리초 타임스탬프를 문자열로 반환한다.
 *
 * @returns 밀리초 타임스탬프 문자열
 */
export function generateTimestamp(): string {
  return Date.now().toString();
}

/**
 * 파라미터를 알파벳순(키 이름 기준)으로 정렬 후 URL 인코딩된 쿼리스트링으로 변환한다.
 *
 * @param params key-value 파라미터 객체
 * @returns 알파벳순 정렬된 URL 인코딩 쿼리스트링
 */
export function buildSortedQueryString(params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  return sortedKeys
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key]!)}`)
    .join('&');
}

/**
 * 문자열의 MD5 해시를 생성하고 대문자로 변환한다.
 *
 * @param data 해시할 문자열
 * @returns MD5 해시 (대문자 hex)
 */
export function computeMD5Hash(data: string): string {
  return CryptoJS.MD5(data).toString(CryptoJS.enc.Hex).toUpperCase();
}

/**
 * HmacSHA256 서명을 생성한다.
 *
 * @param preparedStr MD5 해시 후 대문자 변환된 문자열
 * @param secretKey LBank API Secret Key
 * @returns HmacSHA256 서명 (hex, 소문자)
 */
export function createHmacSignature(preparedStr: string, secretKey: string): string {
  return CryptoJS.HmacSHA256(preparedStr, secretKey).toString(CryptoJS.enc.Hex);
}

/**
 * LBank 거래소 API 요청에 대한 서명을 생성한다.
 *
 * 1. 파라미터에 api_key 추가
 * 2. timestamp, echostr, signature_method 생성
 * 3. 모든 파라미터를 알파벳순 정렬 후 URL 인코딩
 * 4. MD5 해시 → 대문자 변환
 * 5. Secret Key로 HmacSHA256 서명
 * 6. Body: 원래 파라미터 + api_key + sign (URL 인코딩)
 * 7. Headers: Content-Type, timestamp, signature_method, echostr
 *
 * @param params 서명 요청 파라미터
 * @returns 서명이 포함된 요청 객체
 * @throws API Key가 빈 문자열인 경우
 * @throws Secret Key가 빈 문자열인 경우
 * @throws Secret Key가 32자를 초과하는 경우 (RSA 미지원)
 */
export function signRequest(params: SignRequestParams): SignedRequest {
  const { endpoint, queryParams, body, apiKey } = params;

  if (!apiKey.accessKey) {
    throw new Error('LBank API Key가 필요합니다.');
  }
  if (!apiKey.secretKey) {
    throw new Error('LBank Secret Key가 필요합니다.');
  }
  if (apiKey.secretKey.length > 32) {
    throw new Error('RSA 키는 현재 지원하지 않습니다. HmacSHA256 키(32자 이하)를 사용해주세요.');
  }

  const timestamp = generateTimestamp();
  const echostr = generateEchostr();
  const signatureMethod = 'HmacSHA256';

  // 요청 파라미터 구성 (queryParams와 body를 합침)
  const requestParams: Record<string, string> = {};
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      requestParams[key] = value;
    }
  }
  if (body) {
    for (const [key, value] of Object.entries(body)) {
      requestParams[key] = String(value);
    }
  }

  // 서명 대상에 포함할 모든 파라미터 (요청 파라미터 + api_key + echostr + signature_method + timestamp)
  const allParams: Record<string, string> = {
    ...requestParams,
    api_key: apiKey.accessKey,
    echostr,
    signature_method: signatureMethod,
    timestamp,
  };

  // 알파벳순 정렬 후 URL 인코딩 쿼리스트링 생성
  const sortedQueryString = buildSortedQueryString(allParams);

  // MD5 해시 → 대문자 변환
  const md5Hash = computeMD5Hash(sortedQueryString);

  // HmacSHA256 서명
  const sign = createHmacSignature(md5Hash, apiKey.secretKey);

  // Body 구성: 요청 파라미터 + api_key + sign (알파벳순 정렬, URL 인코딩)
  const bodyParams: Record<string, string> = {
    ...requestParams,
    api_key: apiKey.accessKey,
    sign,
  };
  const bodyString = buildSortedQueryString(bodyParams);

  // URL 구성
  const url = `${LBANK_CONFIG.restBaseUrl}${endpoint}`;

  return {
    url,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'timestamp': timestamp,
      'signature_method': signatureMethod,
      'echostr': echostr,
    },
    body: bodyString,
  };
}

/**
 * LBank API Key의 유효성을 검증한다.
 *
 * 잔고 조회 API를 호출하여 API Key가 유효한지 확인한다.
 * Next.js Route Handler를 통해 릴레이되는 서명된 요청을 생성하고,
 * 실제 거래소 API 호출은 프록시를 통해 수행된다.
 *
 * @param apiKey 검증할 API Key 쌍
 * @returns API Key 유효성 검증 결과
 */
export async function validateApiKey(apiKey: ApiKeyPair): Promise<ApiKeyValidationResult> {
  // RSA 키 미지원 검증
  if (apiKey.secretKey.length > 32) {
    return {
      isValid: false,
      isReadOnly: false,
      errorMessage: 'RSA 키는 현재 지원하지 않습니다. HmacSHA256 키(32자 이하)를 사용해주세요.',
      errorCode: 'INVALID_KEY',
    };
  }

  try {
    const signed = signRequest({
      method: 'POST',
      endpoint: LBANK_ENDPOINTS.balance,
      apiKey,
    });

    const response = await fetch('/api/exchange/lbank/balance', {
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
 * LBank 거래소 식별자를 반환한다.
 *
 * @returns 'lbank'
 */
export function getExchangeType(): ExchangeType {
  return 'lbank';
}
