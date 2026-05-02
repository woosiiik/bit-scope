/**
 * 빗썸 거래소 요청 서명 모듈 (BithumbSigner)
 *
 * 빗썸 API 인증 방식에 따라 HMAC-SHA512 서명을 생성하고,
 * 서명된 요청을 구성한다. endpoint, query parameter, nonce,
 * timestamp를 조합하여 HMAC-SHA512 서명을 생성한다.
 *
 * 빗썸 인증 방식:
 * - Api-Key 헤더: Access Key
 * - Api-Sign 헤더: HMAC-SHA512(endpoint + chr(0) + queryString + chr(0) + nonce, secretKey) (Base64 인코딩)
 * - Api-Nonce 헤더: UUID nonce (밀리초 정밀도의 타임스탬프 혼합)
 * - Api-Timestamp 헤더: 현재 시각 (epoch 밀리초)
 *
 * 보안 원칙:
 * - API Key(Secret Key)는 절대 브라우저 밖으로 전송되지 않는다.
 * - nonce/timestamp 기반으로 서명하여 서명된 요청이 일회성이 되도록 한다.
 *
 * @see 요구사항 12.1, 8.17
 * @see https://apidocs.bithumb.com/docs/api_info
 */

import CryptoJS from 'crypto-js';
import type {
  ApiKeyPair,
  ApiKeyValidationResult,
  ExchangeType,
  SignedRequest,
  SignRequestParams,
} from '@bitscope/shared';
import { BITHUMB_CONFIG, BITHUMB_ENDPOINTS } from '@bitscope/shared';

/**
 * 요청마다 고유한 nonce를 생성한다.
 *
 * 밀리초 정밀도의 타임스탬프를 사용하여 요청 순서를 보장하고,
 * 서명된 요청의 재사용을 방지한다.
 *
 * @returns 밀리초 정밀도의 nonce 문자열
 */
export function generateRequestNonce(): string {
  return crypto.randomUUID();
}

/**
 * 현재 시각의 epoch 밀리초 타임스탬프를 반환한다.
 *
 * @returns 현재 시각의 epoch 밀리초 문자열
 */
export function generateTimestamp(): number {
  return Date.now();
}

/**
 * query parameter 객체를 URL 인코딩된 querystring 형태로 변환한다.
 *
 * 빗썸 API에서 HMAC 서명 계산 시 사용하는 형식으로
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
 * HMAC-SHA512 서명을 생성한다.
 *
 * 빗썸 API 인증에 사용되는 서명 문자열을 구성하고,
 * Secret Key로 HMAC-SHA512 서명을 생성한 후
 * Base64로 인코딩하여 반환한다.
 *
 * 서명 대상 문자열 형식:
 *   endpoint + chr(0) + queryString + chr(0) + nonce
 *
 * @param endpoint API 엔드포인트 경로 (예: "/info/balance")
 * @param queryString URL 인코딩된 query parameter 문자열
 * @param nonce 고유 nonce 값
 * @param secretKey 빗썸 API Secret Key
 * @returns HMAC-SHA512 서명 (Hex 인코딩 후 Base64 인코딩)
 */
export function createHmacSignature(
  endpoint: string,
  queryString: string,
  nonce: string,
  secretKey: string
): string {
  // 서명 대상 문자열 구성: endpoint + chr(0) + queryString + chr(0) + nonce
  const hmacData = `${endpoint}${String.fromCharCode(0)}${queryString}${String.fromCharCode(0)}${nonce}`;

  // HMAC-SHA512 서명 생성
  const hmacSignature = CryptoJS.HmacSHA512(hmacData, secretKey);

  // Hex 인코딩 후 Base64 인코딩
  const hexSignature = hmacSignature.toString(CryptoJS.enc.Hex);
  const base64Signature = CryptoJS.enc.Base64.stringify(
    CryptoJS.enc.Utf8.parse(hexSignature)
  );

  return base64Signature;
}

/**
 * body 객체를 빗썸 API POST 요청에 적합한 querystring 형태로 변환한다.
 *
 * POST 요청의 body를 URL 인코딩된 form data 형식으로 변환한다.
 *
 * @param body 요청 body 객체
 * @returns URL 인코딩된 querystring 형태의 문자열
 */
export function buildBodyQueryString(body: Record<string, unknown>): string {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    params[key] = String(value);
  }
  return buildQueryString(params);
}

/**
 * 빗썸 거래소 API 요청에 대한 서명을 생성한다.
 *
 * 요청 파라미터를 기반으로 HMAC-SHA512 서명을 생성하고,
 * Api-Key, Api-Sign, Api-Nonce, Api-Timestamp 헤더에 포함하여
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
    throw new Error('빗썸 Access Key가 필요합니다.');
  }
  if (!apiKey.secretKey) {
    throw new Error('빗썸 Secret Key가 필요합니다.');
  }

  // querystring 구성
  let queryString = '';
  if (method === 'POST' && body && Object.keys(body).length > 0) {
    // POST 요청의 body를 querystring으로 변환하여 서명에 포함
    queryString = buildBodyQueryString(body);
  } else if (queryParams && Object.keys(queryParams).length > 0) {
    queryString = buildQueryString(queryParams);
  }

  // nonce 및 timestamp 생성
  const nonce = generateRequestNonce();
  const timestamp = generateTimestamp();

  // HMAC-SHA512 서명 생성
  const signature = createHmacSignature(
    endpoint,
    queryString,
    nonce,
    apiKey.secretKey
  );

  // URL 구성
  const baseUrl = BITHUMB_CONFIG.restBaseUrl;
  let url = `${baseUrl}${endpoint}`;
  if (queryString && method === 'GET') {
    url = `${url}?${queryString}`;
  }

  // 서명된 요청 헤더 구성
  const headers: Record<string, string> = {
    'Api-Key': apiKey.accessKey,
    'Api-Sign': signature,
    'Api-Nonce': nonce,
    'Api-Timestamp': String(timestamp),
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  const signedRequest: SignedRequest = {
    url,
    method,
    headers,
  };

  // POST 요청의 body 설정 (URL 인코딩된 form data)
  if (body && method === 'POST') {
    signedRequest.body = queryString;
  }

  return signedRequest;
}

/**
 * 빗썸 API Key의 유효성을 검증한다.
 *
 * 잔고 조회 API(/info/balance)를 호출하여 API Key가 유효한지 확인한다.
 * 이 함수는 Next.js Route Handler를 통해 릴레이되는 서명된 요청을 생성하고,
 * 실제 거래소 API 호출은 프록시를 통해 수행된다.
 *
 * Read-Only 권한 검증:
 * - 빗썸의 경우 balance 조회가 성공하면 기본적으로 조회 권한이 있는 것이다.
 * - 주문/출금 권한은 별도 확인이 필요하지만, 이 서비스에서는 Read-Only만 사용한다.
 *
 * @param apiKey 검증할 API Key 쌍
 * @returns API Key 유효성 검증 결과
 */
export async function validateApiKey(apiKey: ApiKeyPair): Promise<ApiKeyValidationResult> {
  try {
    // 잔고 조회 요청 서명 생성
    // 빗썸 잔고 조회는 POST 방식이며 order_currency, payment_currency 파라미터가 필요하다
    const signed = signRequest({
      method: 'POST',
      endpoint: BITHUMB_ENDPOINTS.balance,
      body: {
        order_currency: 'BTC',
        payment_currency: 'KRW',
      },
      apiKey,
    });

    // Next.js Route Handler를 통해 프록시 호출
    const response = await fetch('/api/exchange/bithumb/balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signedRequest: signed,
      }),
    });

    if (response.ok) {
      const data = await response.json().catch(() => null);

      // 빗썸 API는 HTTP 200이어도 status 필드로 오류를 전달할 수 있다
      if (data && data.status === '0000') {
        return {
          isValid: true,
          isReadOnly: true,
        };
      }

      // status가 '0000'이 아닌 경우 빗썸 API 레벨 오류
      if (data && data.status) {
        return mapBithumbErrorToResult(data.status, data.message);
      }

      // 정규화된 응답이 성공이면 유효한 것으로 판정
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
 * 빗썸 API 오류 상태 코드를 API Key 유효성 검증 결과로 매핑한다.
 *
 * 빗썸 API는 HTTP 200으로 응답하면서 status 필드로 오류를 전달하는 경우가 있다.
 * 주요 오류 코드:
 * - "5100": Bad Request (잘못된 요청)
 * - "5200": Not Member (미등록 회원)
 * - "5300": Invalid Apikey (잘못된 API Key)
 * - "5302": Api Key Not Existed (존재하지 않는 API Key)
 * - "5400": Database Fail (DB 오류)
 * - "5500": Invalid Parameter (잘못된 파라미터)
 * - "5600": Custom Notice (사용자 정의 알림)
 * - "5900": Unknown Error (알 수 없는 오류)
 *
 * @param status 빗썸 API 상태 코드
 * @param message 빗썸 API 오류 메시지
 * @returns API Key 유효성 검증 결과
 */
function mapBithumbErrorToResult(status: string, message?: string): ApiKeyValidationResult {
  switch (status) {
    case '5300':
    case '5302':
      return {
        isValid: false,
        isReadOnly: false,
        errorMessage: '잘못된 API 키입니다. Access Key와 Secret Key를 확인해주세요.',
        errorCode: 'INVALID_KEY',
      };

    case '5200':
      return {
        isValid: false,
        isReadOnly: false,
        errorMessage: 'API 키 권한이 부족합니다. Read-Only 권한의 API 키로 재발급해주세요.',
        errorCode: 'INSUFFICIENT_PERMISSION',
      };

    default:
      return {
        isValid: false,
        isReadOnly: false,
        errorMessage: `빗썸 API 오류 (${status}): ${message || '알 수 없는 오류'}`,
        errorCode: 'UNKNOWN',
      };
  }
}

/**
 * 빗썸 거래소 식별자를 반환한다.
 *
 * @returns 'bithumb'
 */
export function getExchangeType(): ExchangeType {
  return 'bithumb';
}
