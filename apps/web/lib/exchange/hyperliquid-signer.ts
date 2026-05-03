/**
 * 하이퍼리퀴드 요청 서명 모듈 (HyperliquidSigner)
 *
 * 하이퍼리퀴드는 다른 거래소와 완전히 다른 방식으로 동작한다:
 * - API Key가 불필요하다. 지갑 주소만으로 잔고 조회가 가능하다.
 * - 모든 조회 요청은 POST /info에 type 파라미터로 구분된다.
 * - 서명이 불필요하다 (조회는 공개 API).
 * - 자산은 USDC 기준이다.
 *
 * 기존 ExchangeSigner 인터페이스와의 호환을 위해
 * signRequest에서 apiKey.accessKey를 지갑 주소로 사용하여
 * POST 요청을 구성한다. 실제 서명은 수행하지 않는다.
 *
 * @see 하이퍼리퀴드 API 문서: https://hyperliquid.gitbook.io/
 */

import type {
  ApiKeyPair,
  ApiKeyValidationResult,
  ExchangeType,
  SignedRequest,
  SignRequestParams,
} from '@bitscope/shared';
import { HYPERLIQUID_CONFIG } from '@bitscope/shared';

/**
 * 하이퍼리퀴드 API 요청을 구성한다.
 *
 * 하이퍼리퀴드는 서명이 불필요하므로 요청 body만 구성한다.
 * apiKey.accessKey에 저장된 지갑 주소를 사용하여
 * POST /info 요청을 생성한다.
 *
 * @param params 요청 파라미터 (apiKey.accessKey = 지갑 주소)
 * @returns 구성된 요청 (서명 없음)
 */
export function signRequest(params: SignRequestParams): SignedRequest {
  const walletAddress = params.apiKey.accessKey;

  if (!walletAddress) {
    throw new Error('하이퍼리퀴드 요청에 지갑 주소가 필요합니다.');
  }

  // 하이퍼리퀴드의 잔고 조회는 clearinghouseState 타입을 사용한다
  // Route Handler에서 clearinghouseState와 spotClearinghouseState를 모두 호출하므로
  // 여기서는 기본 요청만 구성한다
  const body = JSON.stringify({
    type: 'clearinghouseState',
    user: walletAddress,
  });

  return {
    url: `${HYPERLIQUID_CONFIG.restBaseUrl}/info`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  };
}

/**
 * 하이퍼리퀴드 계정 유효성을 검증한다.
 *
 * 하이퍼리퀴드는 API Key가 없으므로 지갑 주소로
 * clearinghouseState를 조회하여 계정 존재 여부를 확인한다.
 * 조회가 성공하면 유효한 계정으로 판단한다.
 * 하이퍼리퀴드는 항상 Read-Only이다 (조회만 가능).
 *
 * @param apiKey API Key 쌍 (accessKey = 지갑 주소, secretKey = 'none')
 * @returns 유효성 검증 결과
 */
export async function validateApiKey(apiKey: ApiKeyPair): Promise<ApiKeyValidationResult> {
  const walletAddress = apiKey.accessKey;

  if (!walletAddress || !walletAddress.startsWith('0x')) {
    return {
      isValid: false,
      isReadOnly: true,
      errorMessage: '유효한 지갑 주소가 필요합니다.',
      errorCode: 'INVALID_KEY',
    };
  }

  try {
    const response = await fetch(`${HYPERLIQUID_CONFIG.restBaseUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'clearinghouseState',
        user: walletAddress,
      }),
      signal: AbortSignal.timeout(HYPERLIQUID_CONFIG.timeoutMs),
    });

    if (!response.ok) {
      return {
        isValid: false,
        isReadOnly: true,
        errorMessage: '하이퍼리퀴드 API 호출에 실패했습니다.',
        errorCode: 'NETWORK_ERROR',
      };
    }

    // 응답이 성공하면 유효한 계정 (잔고가 0이어도 유효)
    return {
      isValid: true,
      isReadOnly: true,
    };
  } catch {
    return {
      isValid: false,
      isReadOnly: true,
      errorMessage: '하이퍼리퀴드 API에 연결할 수 없습니다.',
      errorCode: 'NETWORK_ERROR',
    };
  }
}

/**
 * 거래소 식별자를 반환한다.
 *
 * @returns 'hyperliquid'
 */
export function getExchangeType(): ExchangeType {
  return 'hyperliquid';
}
