/**
 * 스냅샷 동기화 훅 (useSnapshotSync)
 *
 * 대시보드에서 포트폴리오 조회가 완료되면 NestJS 백엔드에
 * 포트폴리오 스냅샷을 비동기적으로 전송한다.
 *
 * 핵심 원칙:
 * - 스냅샷 전송은 백그라운드에서 처리하며 사용자 경험에 영향을 미치지 않는다.
 * - 전송 실패 시 SnapshotQueue에 큐잉하여 다음 접속 시 재시도한다.
 * - 동일 데이터의 중복 전송을 방지한다.
 * - 최소 전송 간격(60초)을 두어 불필요한 API 호출을 줄인다.
 *
 * @see 요구사항 4.9 (클라이언트가 포트폴리오 스냅샷을 NestJS에 전송)
 * @see 요구사항 12.14, 12.15 (클라이언트 접속 시 스냅샷 축적)
 * @see 설계 문서 6.1 (스냅샷 저장 실패 시 로컬 큐잉)
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { AggregatedPortfolio, PortfolioSnapshot } from '@bitscope/shared';
import {
  sendSnapshot,
  createSnapshotFromPortfolio,
  isSnapshotEqual,
} from '@/lib/snapshot-client';
import { SnapshotQueue } from '@/lib/error-recovery';

// ===== 상수 =====

/** 스냅샷 전송 최소 간격 (밀리초). 기본값: 60초 */
const MIN_SEND_INTERVAL_MS = 60_000;

// ===== 싱글톤 SnapshotQueue 인스턴스 =====

/**
 * 전역 SnapshotQueue 인스턴스.
 *
 * 브라우저 환경에서만 초기화되며, localStorage에 큐 데이터를
 * 유지하여 브라우저 재시작 후에도 큐잉된 스냅샷을 재시도한다.
 */
let snapshotQueueInstance: SnapshotQueue | null = null;

/**
 * 전역 SnapshotQueue 인스턴스를 반환한다.
 * 브라우저 환경이 아닌 경우 null을 반환한다.
 */
function getSnapshotQueue(): SnapshotQueue | null {
  if (typeof window === 'undefined') return null;

  if (!snapshotQueueInstance) {
    snapshotQueueInstance = new SnapshotQueue();
  }
  return snapshotQueueInstance;
}

// ===== 훅 타입 =====

/** useSnapshotSync 훅 옵션 */
export interface UseSnapshotSyncOptions {
  /** 사용자 지갑 주소 */
  walletAddress: string;
  /** 통합 포트폴리오 데이터 (null이면 아직 데이터가 없는 상태) */
  aggregatedPortfolio: AggregatedPortfolio | null;
  /** 훅 활성화 여부 (기본: true) */
  enabled?: boolean;
}

/** useSnapshotSync 반환 타입 */
export interface UseSnapshotSyncReturn {
  /** 큐에 대기 중인 스냅샷 수 */
  pendingQueueCount: number;
  /** 마지막 전송 성공 시각 */
  lastSentAt: Date | null;
  /** 현재 전송 중 여부 */
  isSending: boolean;
  /** 수동으로 스냅샷을 즉시 전송한다 (최소 간격 무시) */
  sendNow: () => Promise<void>;
}

/**
 * 스냅샷 동기화 훅
 *
 * 포트폴리오 데이터가 업데이트될 때마다 NestJS 백엔드에
 * 비동기적으로 스냅샷을 전송한다.
 *
 * @param options 훅 옵션
 * @returns 스냅샷 동기화 상태 및 액션
 *
 * @example
 * ```tsx
 * function Dashboard() {
 *   const { aggregatedPortfolio } = usePortfolioStore();
 *   const { pendingQueueCount } = useSnapshotSync({
 *     walletAddress: '0x1234...',
 *     aggregatedPortfolio,
 *   });
 *   // pendingQueueCount > 0 이면 대기 중인 스냅샷이 있음
 * }
 * ```
 */
export function useSnapshotSync(
  options: UseSnapshotSyncOptions,
): UseSnapshotSyncReturn {
  const { walletAddress, aggregatedPortfolio, enabled = true } = options;

  // 마지막 전송 시각
  const lastSentAtRef = useRef<Date | null>(null);
  // 마지막 전송된 스냅샷 (중복 방지용)
  const lastSentSnapshotRef = useRef<PortfolioSnapshot | null>(null);
  // 전송 중 여부
  const isSendingRef = useRef(false);
  // 큐 대기 수 (렌더링에 직접 사용하지 않으므로 ref로 관리)
  const pendingCountRef = useRef(0);

  /**
   * 스냅샷을 NestJS 백엔드에 전송하는 내부 함수.
   *
   * 전송 실패 시 SnapshotQueue에 큐잉한다.
   */
  const sendSnapshotInternal = useCallback(
    async (snapshot: PortfolioSnapshot) => {
      if (isSendingRef.current) return;
      isSendingRef.current = true;

      try {
        await sendSnapshot(walletAddress, snapshot);
        lastSentAtRef.current = new Date();
        lastSentSnapshotRef.current = snapshot;
      } catch {
        // 전송 실패 시 큐에 추가 (사용자에게는 알리지 않음)
        const queue = getSnapshotQueue();
        if (queue) {
          queue.enqueue(walletAddress, snapshot);
          pendingCountRef.current = queue.getStatus().pendingCount;
        }
      } finally {
        isSendingRef.current = false;
      }
    },
    [walletAddress],
  );

  /**
   * 큐에 대기 중인 스냅샷들을 일괄 전송(flush)한다.
   */
  const flushQueue = useCallback(async () => {
    const queue = getSnapshotQueue();
    if (!queue) return;

    const pending = queue.getPendingItems();
    if (pending.length === 0) return;

    await queue.flush(async (addr, snap) => {
      await sendSnapshot(addr, snap);
    });

    pendingCountRef.current = queue.getStatus().pendingCount;
  }, []);

  // 포트폴리오 데이터가 업데이트될 때 스냅샷 전송
  useEffect(() => {
    if (!enabled || !walletAddress || !aggregatedPortfolio) return;

    // 실질적인 데이터가 없는 경우 (모든 거래소가 오류/로딩 상태)
    const hasValidData = aggregatedPortfolio.portfolios.some(
      (p) => p.status === 'connected' && p.holdings.length > 0,
    );
    if (!hasValidData) return;

    // 최소 전송 간격 확인
    const now = Date.now();
    if (
      lastSentAtRef.current &&
      now - lastSentAtRef.current.getTime() < MIN_SEND_INTERVAL_MS
    ) {
      return;
    }

    // 스냅샷 생성
    const snapshot = createSnapshotFromPortfolio(walletAddress, aggregatedPortfolio);

    // 중복 전송 방지: 이전 스냅샷과 동일한 데이터이면 건너뛴다
    if (isSnapshotEqual(lastSentSnapshotRef.current, snapshot)) {
      return;
    }

    // 비동기 전송 (에러 발생해도 무시 - 내부에서 큐잉 처리)
    sendSnapshotInternal(snapshot);
  }, [enabled, walletAddress, aggregatedPortfolio, sendSnapshotInternal]);

  // 초기 마운트 시 큐에 대기 중인 스냅샷을 flush
  useEffect(() => {
    if (!enabled || !walletAddress) return;

    // 약간의 지연 후 큐 flush (대시보드 초기 로딩에 영향 주지 않도록)
    const timeoutId = setTimeout(() => {
      flushQueue();
    }, 5_000);

    return () => clearTimeout(timeoutId);
  }, [enabled, walletAddress, flushQueue]);

  // 수동 전송 함수
  const sendNow = useCallback(async () => {
    if (!walletAddress || !aggregatedPortfolio) return;

    const snapshot = createSnapshotFromPortfolio(walletAddress, aggregatedPortfolio);
    await sendSnapshotInternal(snapshot);
  }, [walletAddress, aggregatedPortfolio, sendSnapshotInternal]);

  return {
    pendingQueueCount: pendingCountRef.current,
    lastSentAt: lastSentAtRef.current,
    isSending: isSendingRef.current,
    sendNow,
  };
}
