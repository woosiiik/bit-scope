/**
 * 스냅샷 API 클라이언트 (SnapshotClient)
 *
 * NestJS 백엔드의 포트폴리오 스냅샷 API와 통신하는 클라이언트이다.
 * 대시보드에서 포트폴리오 조회가 완료되면 비동기로 스냅샷을 전송하여
 * DB에 이력을 축적한다.
 *
 * 핵심 원칙:
 * - 스냅샷 전송 실패는 사용자 경험에 영향을 미치지 않는다 (백그라운드 처리).
 * - 전송 실패 시 SnapshotQueue에 큐잉하여 다음 접속 시 재시도한다.
 * - NestJS 백엔드는 port 4000에서 운영되며, nginx를 통해 프록시된다.
 *
 * @see 요구사항 4.9 (클라이언트가 포트폴리오 스냅샷을 NestJS에 전송)
 * @see 요구사항 12.12 (NestJS가 스냅샷 데이터를 DB에 저장)
 * @see 요구사항 12.14, 12.15 (클라이언트 접속 시 스냅샷 축적)
 */

import type {
  PortfolioSnapshot,
  SnapshotHolding,
  AggregatedPortfolio,
} from '@bitscope/shared';
import { getApiBaseUrl } from './api-url';

// ===== 상수 =====

/** 스냅샷 API 경로 */
const SNAPSHOT_API_PATH = '/snapshots';

/** 스냅샷 전송 타임아웃 (밀리초) */
const SNAPSHOT_SEND_TIMEOUT_MS = 10_000;

// ===== 스냅샷 전송 요청 타입 =====

/** 스냅샷 전송 요청 바디 (NestJS CreateSnapshotDto 형태에 맞춤) */
export interface CreateSnapshotRequest {
  /** 사용자 지갑 주소 */
  walletAddress: string;
  /** 총 평가금액 (KRW) */
  totalEvaluation: number;
  /** 총 투자금액 (KRW) */
  totalInvestment: number;
  /** 총 손익 (KRW) */
  totalProfitLoss: number;
  /** 수익률 (%) */
  profitLossRate: number;
  /** 보유 코인 상세 목록 */
  holdings: {
    symbol: string;
    exchange: string;
    balance: number;
    avgBuyPrice: number;
    currentPrice: number;
    evaluation: number;
  }[];
}

// ===== 스냅샷 전송 함수 =====

/**
 * 포트폴리오 스냅샷을 NestJS 백엔드에 전송한다.
 *
 * POST /snapshots 엔드포인트에 스냅샷 데이터를 전송하여 DB에 저장한다.
 * 타임아웃(10초) 및 네트워크 오류 시 예외를 throw하며,
 * 호출 측에서 SnapshotQueue를 통해 큐잉 및 재시도를 처리한다.
 *
 * @param walletAddress 사용자 지갑 주소
 * @param snapshot 포트폴리오 스냅샷 데이터
 * @throws {Error} 전송 실패 시
 *
 * @see 요구사항 4.9 (대시보드 접속 시 스냅샷 전송)
 */
export async function sendSnapshot(
  walletAddress: string,
  snapshot: PortfolioSnapshot,
): Promise<void> {
  const url = `${getApiBaseUrl()}${SNAPSHOT_API_PATH}`;

  const body: CreateSnapshotRequest = {
    walletAddress,
    totalEvaluation: snapshot.totalEvaluation,
    totalInvestment: snapshot.totalInvestment,
    totalProfitLoss: snapshot.totalProfitLoss,
    profitLossRate: snapshot.profitLossRate,
    holdings: snapshot.holdings.map((h) => ({
      symbol: h.symbol,
      exchange: h.exchange,
      balance: h.balance,
      avgBuyPrice: h.avgBuyPrice,
      currentPrice: h.currentPrice,
      evaluation: h.evaluation,
    })),
  };

  // AbortController를 사용한 타임아웃 처리
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SNAPSHOT_SEND_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(
        `스냅샷 전송 실패: HTTP ${response.status} - ${errorText}`,
      );
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('스냅샷 전송 타임아웃 (10초 초과)');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ===== AggregatedPortfolio → PortfolioSnapshot 변환 =====

/**
 * AggregatedPortfolio를 PortfolioSnapshot으로 변환한다.
 *
 * 대시보드에서 조회된 통합 포트폴리오 데이터를
 * NestJS 백엔드에 전송하기 위한 스냅샷 형태로 변환한다.
 *
 * @param walletAddress 사용자 지갑 주소
 * @param portfolio 통합 포트폴리오 데이터
 * @returns 포트폴리오 스냅샷
 */
export function createSnapshotFromPortfolio(
  walletAddress: string,
  portfolio: AggregatedPortfolio,
): PortfolioSnapshot {
  // 거래소별 개별 holdings를 SnapshotHolding 형태로 변환
  const holdings: SnapshotHolding[] = [];

  for (const exchangePortfolio of portfolio.portfolios) {
    // 오류/로딩 상태인 거래소는 제외
    if (exchangePortfolio.status !== 'connected') continue;

    for (const holding of exchangePortfolio.holdings) {
      holdings.push({
        symbol: holding.symbol,
        exchange: holding.exchange,
        balance: holding.balance,
        avgBuyPrice: holding.avgBuyPrice,
        currentPrice: holding.currentPrice,
        evaluation: holding.evaluationAmount,
      });
    }
  }

  return {
    walletAddress,
    timestamp: new Date(),
    totalEvaluation: portfolio.totalEvaluation,
    totalInvestment: portfolio.totalInvestment,
    totalProfitLoss: portfolio.totalProfitLoss,
    profitLossRate: portfolio.profitLossRate,
    holdings,
  };
}

/**
 * 두 스냅샷이 실질적으로 동일한 데이터인지 비교한다.
 *
 * 동일한 데이터의 중복 전송을 방지하기 위해 사용한다.
 * 총 평가금액과 보유 코인 수가 동일하면 같은 데이터로 간주한다.
 *
 * @param a 비교할 첫 번째 스냅샷
 * @param b 비교할 두 번째 스냅샷
 * @returns 동일 여부
 */
export function isSnapshotEqual(
  a: PortfolioSnapshot | null,
  b: PortfolioSnapshot | null,
): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;

  // 총 평가금액이 다르면 다른 스냅샷
  if (Math.abs(a.totalEvaluation - b.totalEvaluation) > 1) return false;

  // 총 투자금액이 다르면 다른 스냅샷
  if (Math.abs(a.totalInvestment - b.totalInvestment) > 1) return false;

  // 보유 코인 수가 다르면 다른 스냅샷
  if (a.holdings.length !== b.holdings.length) return false;

  return true;
}
