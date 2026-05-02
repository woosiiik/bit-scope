/**
 * 거래소 응답 정규화 모듈 (ResponseNormalizer)
 *
 * ExchangeType에 따라 적절한 거래소별 정규화 함수를 디스패치하여
 * 상이한 거래소 API 응답을 통일된 내부 데이터 모델로 변환한다.
 *
 * 각 거래소의 응답 형식이 완전히 다르므로(업비트: 배열, 빗썸: { status, data },
 * 코인원: { result, ... }), 이 모듈이 어댑터 역할을 하여 클라이언트 코드가
 * 거래소별 차이를 의식하지 않고 통일된 인터페이스로 데이터를 처리할 수 있도록 한다.
 *
 * @see 요구사항 12.4 (응답 데이터 통일된 내부 데이터 모델 정규화)
 * @see 설계 문서 3.2.3 ResponseNormalizer
 */

import type { ExchangeType } from '@bitscope/shared';
import type {
  NormalizedBalance,
  NormalizedTicker,
  NormalizedOrderbook,
  NormalizedOrderHistory,
} from './types';

import {
  normalizeUpbitBalance,
  normalizeUpbitTicker,
  normalizeUpbitOrderbook,
  normalizeUpbitOrderHistory,
} from './upbit';

import {
  normalizeBithumbBalance,
  normalizeBithumbTicker,
  normalizeBithumbOrderbook,
  normalizeBithumbOrderHistory,
} from './bithumb';

import {
  normalizeCoinoneBalance,
  normalizeCoinoneTicker,
  normalizeCoinoneOrderbook,
  normalizeCoinoneOrderHistory,
} from './coinone';

// 타입 re-export
export type {
  NormalizedBalance,
  NormalizedTicker,
  NormalizedOrderbook,
  NormalizedOrderHistory,
  OrderHistoryItem,
} from './types';

/**
 * 거래소별 잔고 조회 응답을 정규화한다.
 *
 * ExchangeType에 따라 적절한 거래소별 정규화 함수를 호출하여
 * 통일된 NormalizedBalance 형태로 변환한다.
 *
 * @param exchange 거래소 식별자
 * @param rawResponse 거래소 API 원본 응답
 * @returns 정규화된 잔고 데이터
 * @throws {Error} 지원하지 않는 거래소인 경우
 */
export function normalizeBalance(
  exchange: ExchangeType,
  rawResponse: unknown,
): NormalizedBalance {
  switch (exchange) {
    case 'upbit':
      return normalizeUpbitBalance(rawResponse);
    case 'bithumb':
      return normalizeBithumbBalance(rawResponse);
    case 'coinone':
      return normalizeCoinoneBalance(rawResponse);
    default:
      throw new Error(`지원하지 않는 거래소입니다: ${exchange}`);
  }
}

/**
 * 거래소별 시세(Ticker) 조회 응답을 정규화한다.
 *
 * ExchangeType에 따라 적절한 거래소별 정규화 함수를 호출하여
 * 통일된 NormalizedTicker 형태로 변환한다.
 *
 * @param exchange 거래소 식별자
 * @param rawResponse 거래소 API 원본 응답
 * @param symbol 조회 대상 코인 심볼 (빗썸 단일 코인 조회 시 필요)
 * @returns 정규화된 시세 데이터
 * @throws {Error} 지원하지 않는 거래소인 경우
 */
export function normalizeTicker(
  exchange: ExchangeType,
  rawResponse: unknown,
  symbol?: string,
): NormalizedTicker {
  switch (exchange) {
    case 'upbit':
      return normalizeUpbitTicker(rawResponse);
    case 'bithumb':
      return normalizeBithumbTicker(rawResponse, symbol);
    case 'coinone':
      return normalizeCoinoneTicker(rawResponse);
    default:
      throw new Error(`지원하지 않는 거래소입니다: ${exchange}`);
  }
}

/**
 * 거래소별 호가(Orderbook) 조회 응답을 정규화한다.
 *
 * ExchangeType에 따라 적절한 거래소별 정규화 함수를 호출하여
 * 통일된 NormalizedOrderbook 형태로 변환한다.
 *
 * @param exchange 거래소 식별자
 * @param rawResponse 거래소 API 원본 응답
 * @returns 정규화된 호가 데이터
 * @throws {Error} 지원하지 않는 거래소인 경우
 */
export function normalizeOrderbook(
  exchange: ExchangeType,
  rawResponse: unknown,
): NormalizedOrderbook {
  switch (exchange) {
    case 'upbit':
      return normalizeUpbitOrderbook(rawResponse);
    case 'bithumb':
      return normalizeBithumbOrderbook(rawResponse);
    case 'coinone':
      return normalizeCoinoneOrderbook(rawResponse);
    default:
      throw new Error(`지원하지 않는 거래소입니다: ${exchange}`);
  }
}

/**
 * 거래소별 주문 내역 조회 응답을 정규화한다.
 *
 * ExchangeType에 따라 적절한 거래소별 정규화 함수를 호출하여
 * 통일된 NormalizedOrderHistory 형태로 변환한다.
 *
 * @param exchange 거래소 식별자
 * @param rawResponse 거래소 API 원본 응답
 * @returns 정규화된 주문 내역 데이터
 * @throws {Error} 지원하지 않는 거래소인 경우
 */
export function normalizeOrderHistory(
  exchange: ExchangeType,
  rawResponse: unknown,
): NormalizedOrderHistory {
  switch (exchange) {
    case 'upbit':
      return normalizeUpbitOrderHistory(rawResponse);
    case 'bithumb':
      return normalizeBithumbOrderHistory(rawResponse);
    case 'coinone':
      return normalizeCoinoneOrderHistory(rawResponse);
    default:
      throw new Error(`지원하지 않는 거래소입니다: ${exchange}`);
  }
}
