/**
 * 거래소 요청 서명 팩토리 (ExchangeSignerFactory)
 *
 * 거래소별 인증 방식에 따른 요청 서명 생성을 통합 관리한다.
 * ExchangeType에 따라 적절한 Signer 인스턴스를 반환하는 팩토리 패턴을 구현하며,
 * 향후 새로운 거래소 추가 시 기존 코드 변경 없이 새로운 어댑터만 추가하면 된다.
 *
 * 지원 거래소:
 * - 업비트 (upbit): JWT(HS256) 토큰 기반 인증
 * - 빗썸 (bithumb): HMAC-SHA512 서명 기반 인증
 * - 코인원 (coinone): HMAC-SHA512 서명 + Base64 payload 기반 인증
 *
 * 보안 원칙:
 * - API Key(Secret Key)는 절대 브라우저 밖으로 전송되지 않는다.
 * - 모든 서명은 클라이언트(브라우저)에서 수행되며, 서버에는 서명된 요청만 전달된다.
 *
 * @see 요구사항 NF2.1 (거래소 어댑터 패턴)
 * @see 설계 문서 3.1.3 ExchangeSignerFactory
 */

import type {
  ApiKeyPair,
  ApiKeyValidationResult,
  ExchangeType,
  SignedRequest,
  SignRequestParams,
} from '@bitscope/shared';
import { SUPPORTED_EXCHANGES } from '@bitscope/shared';

import * as UpbitSigner from './upbit-signer';
import * as BithumbSigner from './bithumb-signer';
import * as CoinoneSigner from './coinone-signer';

/**
 * 거래소 요청 서명기 인터페이스
 *
 * 각 거래소별 서명 모듈이 구현해야 하는 공통 인터페이스를 정의한다.
 * 요청 서명 생성, API Key 유효성 검증, 거래소 식별자 반환 기능을 제공한다.
 */
export interface ExchangeSigner {
  /** 거래소 API 요청에 대한 서명을 생성한다. */
  signRequest(params: SignRequestParams): SignedRequest;
  /** API Key의 유효성을 검증한다. (거래소 API 호출을 통한 실제 검증) */
  validateApiKey(apiKey: ApiKeyPair): Promise<ApiKeyValidationResult>;
  /** 거래소 식별자를 반환한다. */
  getExchangeType(): ExchangeType;
}

/**
 * 업비트 서명기 어댑터
 *
 * upbit-signer 모듈의 함수들을 ExchangeSigner 인터페이스로 래핑한다.
 */
const upbitSigner: ExchangeSigner = {
  signRequest: UpbitSigner.signRequest,
  validateApiKey: UpbitSigner.validateApiKey,
  getExchangeType: UpbitSigner.getExchangeType,
};

/**
 * 빗썸 서명기 어댑터
 *
 * bithumb-signer 모듈의 함수들을 ExchangeSigner 인터페이스로 래핑한다.
 */
const bithumbSigner: ExchangeSigner = {
  signRequest: BithumbSigner.signRequest,
  validateApiKey: BithumbSigner.validateApiKey,
  getExchangeType: BithumbSigner.getExchangeType,
};

/**
 * 코인원 서명기 어댑터
 *
 * coinone-signer 모듈의 함수들을 ExchangeSigner 인터페이스로 래핑한다.
 */
const coinoneSigner: ExchangeSigner = {
  signRequest: CoinoneSigner.signRequest,
  validateApiKey: CoinoneSigner.validateApiKey,
  getExchangeType: CoinoneSigner.getExchangeType,
};

/**
 * 거래소 서명기 레지스트리
 *
 * ExchangeType을 키로 사용하여 해당 거래소의 서명기 인스턴스를 보관한다.
 * 새로운 거래소를 추가할 때는 이 맵에 서명기 인스턴스를 등록하면 된다.
 */
const signerRegistry: Record<ExchangeType, ExchangeSigner> = {
  upbit: upbitSigner,
  bithumb: bithumbSigner,
  coinone: coinoneSigner,
};

/**
 * 지정된 거래소 타입에 적합한 서명기 인스턴스를 생성(반환)한다.
 *
 * 팩토리 패턴으로 ExchangeType에 따라 적절한 ExchangeSigner 인스턴스를 반환한다.
 * 지원하지 않는 거래소 타입이 전달되면 오류를 발생시킨다.
 *
 * @param exchange 거래소 식별자 ('upbit' | 'bithumb' | 'coinone')
 * @returns 해당 거래소의 ExchangeSigner 인스턴스
 * @throws 지원하지 않는 거래소 타입인 경우
 *
 * @example
 * ```typescript
 * const signer = createSigner('upbit');
 * const signed = signer.signRequest({
 *   method: 'GET',
 *   endpoint: '/v1/accounts',
 *   apiKey: { accessKey: '...', secretKey: '...' },
 * });
 * ```
 */
export function createSigner(exchange: ExchangeType): ExchangeSigner {
  const signer = signerRegistry[exchange];

  if (!signer) {
    throw new Error(
      `지원하지 않는 거래소입니다: ${exchange}. 지원 거래소: ${SUPPORTED_EXCHANGES.join(', ')}`
    );
  }

  return signer;
}

/**
 * 지원하는 모든 거래소의 서명기 목록을 반환한다.
 *
 * 모든 등록된 거래소에 대한 서명기 인스턴스를 배열로 반환한다.
 * 여러 거래소에 대한 일괄 작업(예: 전체 거래소 API Key 검증)에 유용하다.
 *
 * @returns 모든 거래소 서명기 인스턴스 배열
 */
export function getAllSigners(): ExchangeSigner[] {
  return SUPPORTED_EXCHANGES.map((exchange) => signerRegistry[exchange]);
}

/**
 * 지정된 거래소가 지원되는지 확인한다.
 *
 * @param exchange 확인할 거래소 식별자
 * @returns 지원 여부
 */
export function isSupportedExchange(exchange: string): exchange is ExchangeType {
  return exchange in signerRegistry;
}
