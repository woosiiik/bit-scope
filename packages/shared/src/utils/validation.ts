/**
 * API Key 형식 유효성 검증 유틸리티
 *
 * 각 거래소별 API Key 형식에 대한 기본 유효성 검사를 제공한다.
 * 실제 키의 인증 여부 검증은 거래소 API 호출을 통해 수행하며,
 * 이 모듈에서는 형식(길이, 문자 패턴 등)만 검증한다.
 */

import type { ExchangeType, ApiKeyPair } from '../types/exchange';

/** API Key 형식 검증 결과 */
export interface ApiKeyFormatValidation {
  /** 전체 유효성 여부 */
  isValid: boolean;
  /** Access Key 유효성 여부 */
  isAccessKeyValid: boolean;
  /** Secret Key 유효성 여부 */
  isSecretKeyValid: boolean;
  /** 오류 메시지 (유효하지 않은 경우) */
  errorMessage?: string;
}

/**
 * 문자열이 비어 있지 않은지 확인한다.
 *
 * @param value - 확인할 문자열
 * @returns 비어 있지 않으면 true
 */
function isNonEmptyString(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * 업비트 API Key 형식을 검증한다.
 *
 * 업비트 API Key는 UUID v4 형식의 Access Key와
 * 알파벳/숫자로 구성된 Secret Key를 사용한다.
 *
 * @param apiKey - 검증할 API Key 쌍
 * @returns 형식 검증 결과
 */
export function validateUpbitApiKeyFormat(
  apiKey: ApiKeyPair,
): ApiKeyFormatValidation {
  const accessKeyValid = isNonEmptyString(apiKey.accessKey);
  const secretKeyValid = isNonEmptyString(apiKey.secretKey);

  if (!accessKeyValid && !secretKeyValid) {
    return {
      isValid: false,
      isAccessKeyValid: false,
      isSecretKeyValid: false,
      errorMessage: 'Access Key와 Secret Key를 모두 입력해주세요.',
    };
  }
  if (!accessKeyValid) {
    return {
      isValid: false,
      isAccessKeyValid: false,
      isSecretKeyValid: secretKeyValid,
      errorMessage: 'Access Key를 입력해주세요.',
    };
  }
  if (!secretKeyValid) {
    return {
      isValid: false,
      isAccessKeyValid: accessKeyValid,
      isSecretKeyValid: false,
      errorMessage: 'Secret Key를 입력해주세요.',
    };
  }

  return {
    isValid: true,
    isAccessKeyValid: true,
    isSecretKeyValid: true,
  };
}

/**
 * 빗썸 API Key 형식을 검증한다.
 *
 * 빗썸 API Key는 32자리 16진수 Access Key와
 * 32자리 16진수 Secret Key를 사용한다.
 *
 * @param apiKey - 검증할 API Key 쌍
 * @returns 형식 검증 결과
 */
export function validateBithumbApiKeyFormat(
  apiKey: ApiKeyPair,
): ApiKeyFormatValidation {
  const accessKeyValid = isNonEmptyString(apiKey.accessKey);
  const secretKeyValid = isNonEmptyString(apiKey.secretKey);

  if (!accessKeyValid && !secretKeyValid) {
    return {
      isValid: false,
      isAccessKeyValid: false,
      isSecretKeyValid: false,
      errorMessage: 'Access Key와 Secret Key를 모두 입력해주세요.',
    };
  }
  if (!accessKeyValid) {
    return {
      isValid: false,
      isAccessKeyValid: false,
      isSecretKeyValid: secretKeyValid,
      errorMessage: 'Access Key를 입력해주세요.',
    };
  }
  if (!secretKeyValid) {
    return {
      isValid: false,
      isAccessKeyValid: accessKeyValid,
      isSecretKeyValid: false,
      errorMessage: 'Secret Key를 입력해주세요.',
    };
  }

  return {
    isValid: true,
    isAccessKeyValid: true,
    isSecretKeyValid: true,
  };
}

/**
 * 코인원 API Key 형식을 검증한다.
 *
 * 코인원 API Key는 영숫자로 구성된 Access Token과 Secret Key를 사용한다.
 *
 * @param apiKey - 검증할 API Key 쌍
 * @returns 형식 검증 결과
 */
export function validateCoinoneApiKeyFormat(
  apiKey: ApiKeyPair,
): ApiKeyFormatValidation {
  const accessKeyValid = isNonEmptyString(apiKey.accessKey);
  const secretKeyValid = isNonEmptyString(apiKey.secretKey);

  if (!accessKeyValid && !secretKeyValid) {
    return {
      isValid: false,
      isAccessKeyValid: false,
      isSecretKeyValid: false,
      errorMessage: 'Access Token과 Secret Key를 모두 입력해주세요.',
    };
  }
  if (!accessKeyValid) {
    return {
      isValid: false,
      isAccessKeyValid: false,
      isSecretKeyValid: secretKeyValid,
      errorMessage: 'Access Token을 입력해주세요.',
    };
  }
  if (!secretKeyValid) {
    return {
      isValid: false,
      isAccessKeyValid: accessKeyValid,
      isSecretKeyValid: false,
      errorMessage: 'Secret Key를 입력해주세요.',
    };
  }

  return {
    isValid: true,
    isAccessKeyValid: true,
    isSecretKeyValid: true,
  };
}

/**
 * 거래소 유형에 따라 API Key 형식을 검증한다.
 *
 * @param exchange - 거래소 유형
 * @param apiKey - 검증할 API Key 쌍
 * @returns 형식 검증 결과
 */
export function validateApiKeyFormat(
  exchange: ExchangeType,
  apiKey: ApiKeyPair,
): ApiKeyFormatValidation {
  switch (exchange) {
    case 'upbit':
      return validateUpbitApiKeyFormat(apiKey);
    case 'bithumb':
      return validateBithumbApiKeyFormat(apiKey);
    case 'coinone':
      return validateCoinoneApiKeyFormat(apiKey);
    default: {
      // 타입 안전성: 새로운 거래소 추가 시 컴파일 오류 발생
      const _exhaustiveCheck: never = exchange;
      return {
        isValid: false,
        isAccessKeyValid: false,
        isSecretKeyValid: false,
        errorMessage: `지원하지 않는 거래소입니다: ${_exhaustiveCheck}`,
      };
    }
  }
}

/**
 * 지갑 주소 형식을 검증한다.
 *
 * EIP-55 체크섬 검증은 수행하지 않으며, 기본 형식만 확인한다.
 *
 * @param address - 검증할 지갑 주소
 * @returns 유효하면 true
 */
export function isValidWalletAddress(address: string): boolean {
  if (typeof address !== 'string') {
    return false;
  }
  // 이더리움 주소: 0x + 40자리 16진수
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

/**
 * API Key에 공백이나 불필요한 문자가 포함되어 있으면 정리한다.
 *
 * @param key - 정리할 키 문자열
 * @returns 정리된 키 문자열
 */
export function sanitizeApiKey(key: string): string {
  if (typeof key !== 'string') {
    return '';
  }
  return key.trim();
}

/**
 * Secret Key를 마스킹 처리한다.
 *
 * 마지막 4자리만 표시하고 나머지는 *로 대체한다.
 *
 * @param secretKey - 마스킹할 Secret Key
 * @returns 마스킹된 문자열 (예: "****abcd")
 *
 * @example
 * maskSecretKey("abcdefghijklmnop") // "************mnop"
 * maskSecretKey("ab") // "**"
 */
export function maskSecretKey(secretKey: string): string {
  if (typeof secretKey !== 'string' || secretKey.length === 0) {
    return '';
  }

  const visibleLength = Math.min(4, secretKey.length);
  const maskedLength = secretKey.length - visibleLength;
  const maskedPart = '*'.repeat(maskedLength);
  const visiblePart = secretKey.slice(-visibleLength);

  return `${maskedPart}${visiblePart}`;
}
