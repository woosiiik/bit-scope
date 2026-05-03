/**
 * 바이낸스 거래소 요청 서명 모듈 (BinanceSigner)
 *
 * 바이낸스 API 인증 방식에 따라 HMAC-SHA256 서명을 생성하고,
 * 서명된 요청을 구성한다. timestamp와 signature를 쿼리 파라미터에 추가하고,
 * X-MBX-APIKEY 헤더에 Access Key를 포함한다.
 *
 * 바이낸스 인증 방식:
 * - X-MBX-APIKEY 헤더: Access Key
 * - 쿼리 파라미터: timestamp (epoch 밀리초) + signature (HMAC-SHA256)
 * - signature = HMAC-SHA256(queryString, secretKey)
 *
 * 보안 원칙:
 * - API Key(Secret Key)는 절대 브라우저 밖으로 전송되지 않는다.
 * - timestamp 기반으로 서명하여 서명된 요청이 일회성이 되도록 한다.
 *
 * @see https://binance-docs.github.io/apidocs/spot/en/#signed-trade-and-user_data-endpoint-security
 */

import CryptoJS from 'crypto-js';
import type {
  ApiKeyPair,
  ApiKeyValidationResult,
  ExchangeType,
  SignedRequest,
  SignRequestParams,
} from '@bitscope/shared';
import { BINANCE_CONFIG, BINANCE_ENDPOINTS } from '@bitscope/shared';

/** 바이낸스 Futures 엔드포인트 경로 목록 (fapi.binance.com 도메인 사용) */
const FUTURES_ENDPOINTS = [
  BINANCE_ENDPOINTS.futures,
].filter(Boolean) as string[];

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
 * 바이낸스 API에서는 쿼리 스트링 전체를 HMAC-SHA256으로 서명하고,
 * 결과를 hex 인코딩하여 signature 쿼리 파라미터에 추가한다.
 *
 * @param queryString 서명 대상 쿼리 스트링
 * @param secretKey 바이낸스 API Secret Key
 * @returns HMAC-SHA256 서명 (hex, 소문자)
 */
export function createSignature(queryString: string, secretKey: string): string {
  return CryptoJS.HmacSHA256(queryString, secretKey).toString(CryptoJS.enc.Hex);
}

/**
 * 바이낸스 거래소 API 요청에 대한 서명을 생성한다.
 *
 * 요청 파라미터를 기반으로 HMAC-SHA256 서명을 생성하고,
 * X-MBX-APIKEY 헤더와 timestamp + signature 쿼리 파라미터를 포함하여
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
    throw new Error('바이낸스 API Key가 필요합니다.');
  }
  if (!apiKey.secretKey) {
    throw new Error('바이낸스 Secret Key가 필요합니다.');
  }

  // timestamp 추가
  const timestamp = generateTimestamp();
  const allParams: Record<string, string> = {
    ...(queryParams || {}),
    timestamp: String(timestamp),
  };

  // 쿼리 스트링 구성 (signature 제외)
  const queryString = buildQueryString(allParams);

  // totalParams = queryString + bodyString (바이낸스 공식 문서 기준)
  // POST 요청 시 body를 queryString 뒤에 이어붙여 서명 대상으로 사용한다.
  let bodyString = '';
  if (method === 'POST' && body) {
    bodyString = buildQueryString(
      Object.fromEntries(
        Object.entries(body).map(([k, v]) => [k, String(v)])
      )
    );
  }
  const totalParams = bodyString ? `${queryString}${bodyString}` : queryString;

  // HMAC-SHA256 서명 생성
  const signature = createSignature(totalParams, apiKey.secretKey);

  // URL 구성: Futures 엔드포인트는 fapi.binance.com 도메인을 사용한다
  const isFuturesEndpoint = FUTURES_ENDPOINTS.includes(endpoint);
  const baseUrl = isFuturesEndpoint && BINANCE_CONFIG.futuresBaseUrl
    ? BINANCE_CONFIG.futuresBaseUrl
    : BINANCE_CONFIG.restBaseUrl;
  const url = `${baseUrl}${endpoint}?${queryString}&signature=${signature}`;

  // 헤더 구성
  const headers: Record<string, string> = {
    'X-MBX-APIKEY': apiKey.accessKey,
  };

  if (method === 'POST') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  const signedRequest: SignedRequest = {
    url,
    method,
    headers,
  };

  // POST 요청인 경우 body 추가 (form-urlencoded 형식)
  if (method === 'POST' && bodyString) {
    signedRequest.body = `${bodyString}&signature=${signature}`;
  }

  return signedRequest;
}

/**
 * 바이낸스 API Key의 유효성을 검증한다.
 *
 * 계정 정보 조회 API(/api/v3/account)를 호출하여 API Key가 유효한지 확인한다.
 * Next.js Route Handler를 통해 릴레이되는 서명된 요청을 생성하고,
 * 실제 거래소 API 호출은 프록시를 통해 수행된다.
 *
 * @param apiKey 검증할 API Key 쌍
 * @returns API Key 유효성 검증 결과
 */
export async function validateApiKey(apiKey: ApiKeyPair): Promise<ApiKeyValidationResult> {
  try {
    // 계정 조회 요청 서명 생성
    const signed = signRequest({
      method: 'GET',
      endpoint: BINANCE_ENDPOINTS.balance,
      apiKey,
    });

    // Next.js Route Handler를 통해 프록시 호출
    const response = await fetch('/api/exchange/binance/balance', {
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
 * 바이낸스 거래소 식별자를 반환한다.
 *
 * @returns 'binance'
 */
export function getExchangeType(): ExchangeType {
  return 'binance';
}
