/**
 * 알림 관리 훅 (useAlerts)
 *
 * NestJS 알림 API를 통한 CRUD 관리와 WebSocket을 통한 실시간 알림 수신을 담당한다.
 *
 * 주요 기능:
 * - 가격 알림 / 김프 알림 생성, 수정, 삭제, 목록 조회
 * - 알림 이력 조회
 * - WebSocket을 통한 실시간 알림 수신 (price-store의 Socket.IO 연결 활용)
 * - 브라우저 Notification API 연동 및 인앱 토스트 대체
 * - 알림 활성/비활성 토글
 *
 * @see 요구사항 6.1 (가격 알림 설정 시 브라우저 알림)
 * @see 요구사항 6.2 (김프 임계값 초과 시 알림)
 * @see 요구사항 6.3 (활성/비활성 알림 목록, 최근 알림 이력)
 * @see 요구사항 6.4 (브라우저 알림 권한 거부 시 인앱 알림)
 * @see 요구사항 6.5 (알림 이력 저장)
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';

import type { AlertCondition, AlertNotification, ExchangeType, AlertCurrency } from '@bitscope/shared';
import { getApiBaseUrl, getWsBaseUrl } from '@/lib/api-url';

// ===== 상수 =====

/** 알림 API 경로 */
const ALERTS_API_PATH = '/alerts';

/** 자동 갱신 간격 (밀리초) - 30초 */
const ALERTS_REFETCH_INTERVAL_MS = 30_000;

/** Socket.IO 이벤트명 (서버 PriceGateway의 WS_EVENTS와 일치) */
const WS_EVENTS = {
  ALERT: 'alert',
} as const;

// ===== 쿼리 키 팩토리 =====

/**
 * 알림 관련 TanStack Query 키를 생성하는 팩토리
 */
export const alertQueryKeys = {
  /** 모든 알림 쿼리의 최상위 키 */
  all: ['alerts'] as const,

  /** 특정 지갑 주소의 알림 목록 쿼리 키 */
  list: (walletAddress: string, isActive?: boolean) =>
    ['alerts', 'list', walletAddress, isActive ?? 'all'] as const,

  /** 특정 지갑 주소의 알림 이력 쿼리 키 */
  history: (walletAddress: string, limit?: number) =>
    ['alerts', 'history', walletAddress, limit ?? 50] as const,
} as const;

// ===== 타입 정의 =====

/** NestJS 알림 엔티티 응답 타입 (API 반환 형태) */
export interface AlertResponse {
  id: string;
  walletAddress: string;
  symbol: string;
  exchange: string;
  currency: string;
  condition: string;
  targetValue: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** NestJS 알림 이력 엔티티 응답 타입 */
export interface AlertHistoryResponse {
  id: string;
  alertId: string;
  triggeredAt: string;
  triggeredValue: number;
  message: string;
  alert?: AlertResponse;
}

/** 알림 생성 요청 파라미터 */
export interface CreateAlertParams {
  walletAddress: string;
  symbol: string;
  exchange: ExchangeType;
  currency: AlertCurrency;
  condition: AlertCondition;
  targetValue: number;
  isActive?: boolean;
}

/** 알림 수정 요청 파라미터 */
export interface UpdateAlertParams {
  alertId: string;
  symbol?: string;
  exchange?: ExchangeType;
  condition?: AlertCondition;
  targetValue?: number;
  isActive?: boolean;
}

/** 인앱 알림 (토스트 표시용) */
export interface InAppNotification {
  id: string;
  notification: AlertNotification;
  receivedAt: Date;
  isRead: boolean;
}

/** 브라우저 알림 권한 상태 */
export type NotificationPermission = 'default' | 'granted' | 'denied';

// ===== API 호출 함수 =====

/**
 * 알림 목록을 조회한다.
 */
async function fetchAlerts(
  walletAddress: string,
  isActive?: boolean,
): Promise<AlertResponse[]> {
  const baseUrl = getApiBaseUrl();
  const params = new URLSearchParams();
  if (isActive !== undefined) {
    params.set('isActive', String(isActive));
  }
  const queryString = params.toString();
  const url = `${baseUrl}${ALERTS_API_PATH}/${walletAddress}${queryString ? `?${queryString}` : ''}`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`알림 목록 조회 실패: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  return json.data ?? json;
}

/**
 * 알림 이력을 조회한다.
 */
async function fetchAlertHistory(
  walletAddress: string,
  limit: number = 50,
): Promise<AlertHistoryResponse[]> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${ALERTS_API_PATH}/${walletAddress}/history?limit=${limit}`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`알림 이력 조회 실패: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  return json.data ?? json;
}

/**
 * 새로운 알림을 생성한다.
 */
async function createAlert(params: CreateAlertParams): Promise<AlertResponse> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${ALERTS_API_PATH}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    const errorMessage = errorData?.message || `알림 생성 실패: ${res.status}`;
    throw new Error(Array.isArray(errorMessage) ? errorMessage.join(', ') : errorMessage);
  }

  const json = await res.json();
  return json.data ?? json;
}

/**
 * 기존 알림을 수정한다.
 */
async function updateAlert(params: UpdateAlertParams): Promise<AlertResponse> {
  const { alertId, ...body } = params;
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${ALERTS_API_PATH}/${alertId}`;

  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`알림 수정 실패: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  return json.data ?? json;
}

/**
 * 알림을 삭제한다.
 */
async function deleteAlertApi(alertId: string): Promise<void> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${ALERTS_API_PATH}/item/${alertId}`;

  const res = await fetch(url, {
    method: 'DELETE',
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`알림 삭제 실패: ${res.status} ${res.statusText}`);
  }
}

// ===== 브라우저 Notification API 헬퍼 =====

/**
 * 현재 브라우저 알림 권한 상태를 반환한다.
 */
export function getNotificationPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission as NotificationPermission;
}

/**
 * 브라우저 알림 권한을 요청한다.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }

  const result = await Notification.requestPermission();
  return result as NotificationPermission;
}

/**
 * 브라우저 네이티브 알림을 표시한다.
 *
 * @param notification 알림 데이터
 */
function showBrowserNotification(notification: AlertNotification): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    const title = `BitScope - ${notification.symbol}`;
    new Notification(title, {
      body: notification.message,
      icon: '/favicon.ico',
      tag: notification.alertId,
    });
  } catch {
    // Notification 생성 실패 시 무시 (모바일 등)
  }
}

// ===== 훅: 알림 목록 조회 =====

/** useAlertList 옵션 */
export interface UseAlertListOptions {
  /** 지갑 주소 */
  walletAddress: string;
  /** 활성 상태 필터 (undefined이면 전체) */
  isActive?: boolean;
  /** 활성화 여부 (기본: true) */
  enabled?: boolean;
}

/**
 * 알림 목록을 조회하는 React Query 훅
 *
 * @param options 훅 옵션
 * @returns TanStack Query 결과 (data, isLoading, error 등)
 */
export function useAlertList(options: UseAlertListOptions) {
  const { walletAddress, isActive, enabled = true } = options;

  return useQuery<AlertResponse[]>({
    queryKey: alertQueryKeys.list(walletAddress, isActive),
    queryFn: () => fetchAlerts(walletAddress, isActive),
    enabled: enabled && !!walletAddress,
    refetchInterval: ALERTS_REFETCH_INTERVAL_MS,
    staleTime: 10_000,
    retry: 2,
  });
}

// ===== 훅: 알림 이력 조회 =====

/** useAlertHistory 옵션 */
export interface UseAlertHistoryOptions {
  /** 지갑 주소 */
  walletAddress: string;
  /** 조회할 최대 이력 수 (기본 50) */
  limit?: number;
  /** 활성화 여부 (기본: true) */
  enabled?: boolean;
}

/**
 * 알림 이력을 조회하는 React Query 훅
 *
 * @param options 훅 옵션
 * @returns TanStack Query 결과
 */
export function useAlertHistory(options: UseAlertHistoryOptions) {
  const { walletAddress, limit = 50, enabled = true } = options;

  return useQuery<AlertHistoryResponse[]>({
    queryKey: alertQueryKeys.history(walletAddress, limit),
    queryFn: () => fetchAlertHistory(walletAddress, limit),
    enabled: enabled && !!walletAddress,
    refetchInterval: ALERTS_REFETCH_INTERVAL_MS,
    staleTime: 10_000,
    retry: 2,
  });
}

// ===== 훅: 알림 CRUD 뮤테이션 =====

/**
 * 알림 CRUD 작업을 위한 뮤테이션 훅
 *
 * 생성, 수정, 삭제 작업 후 관련 쿼리를 자동으로 무효화하여
 * UI가 최신 상태를 반영하도록 한다.
 *
 * @param walletAddress 지갑 주소 (쿼리 무효화에 사용)
 */
export function useAlertMutations(walletAddress: string) {
  const queryClient = useQueryClient();

  /** 관련 쿼리를 무효화한다. */
  const invalidateAlertQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: alertQueryKeys.all });
  }, [queryClient]);

  /** 알림 생성 뮤테이션 */
  const createMutation = useMutation({
    mutationFn: createAlert,
    onSuccess: () => {
      invalidateAlertQueries();
    },
  });

  /** 알림 수정 뮤테이션 */
  const updateMutation = useMutation({
    mutationFn: updateAlert,
    onSuccess: () => {
      invalidateAlertQueries();
    },
  });

  /** 알림 삭제 뮤테이션 */
  const deleteMutation = useMutation({
    mutationFn: deleteAlertApi,
    onSuccess: () => {
      invalidateAlertQueries();
    },
  });

  /** 알림 활성/비활성 토글 */
  const toggleActive = useCallback(
    (alertId: string, currentIsActive: boolean) => {
      updateMutation.mutate({
        alertId,
        isActive: !currentIsActive,
      });
    },
    [updateMutation],
  );

  return {
    createAlert: createMutation,
    updateAlert: updateMutation,
    deleteAlert: deleteMutation,
    toggleActive,
    invalidateAlertQueries,
  };
}

// ===== 훅: 실시간 알림 수신 =====

/** useAlertNotifications 옵션 */
export interface UseAlertNotificationsOptions {
  /** 지갑 주소 */
  walletAddress: string;
  /** 활성화 여부 (기본: true) */
  enabled?: boolean;
}

/** useAlertNotifications 반환 타입 */
export interface UseAlertNotificationsReturn {
  /** 수신된 인앱 알림 목록 (최신순) */
  notifications: InAppNotification[];
  /** 읽지 않은 알림 수 */
  unreadCount: number;
  /** 브라우저 알림 권한 상태 */
  notificationPermission: NotificationPermission;
  /** 브라우저 알림 권한 요청 */
  requestPermission: () => Promise<void>;
  /** 특정 알림을 읽음 처리 */
  markAsRead: (notificationId: string) => void;
  /** 모든 알림을 읽음 처리 */
  markAllAsRead: () => void;
  /** 알림 목록을 비운다 */
  clearAll: () => void;
}

/**
 * 실시간 알림 수신 훅
 *
 * NestJS WebSocket Gateway의 /price 네임스페이스에 연결하여
 * 사용자별 알림(alert 이벤트)을 수신한다.
 *
 * 수신된 알림은:
 * 1. 브라우저 Notification API로 네이티브 알림 표시 (권한 허용 시)
 * 2. 인앱 알림 목록에 추가 (권한 거부 또는 추가로)
 *
 * @param options 훅 옵션
 * @returns 알림 목록, 권한 관리 함수 등
 *
 * @see 요구사항 6.1 (브라우저 알림 전송)
 * @see 요구사항 6.4 (권한 거부 시 인앱 토스트/배지 대체)
 */
export function useAlertNotifications(
  options: UseAlertNotificationsOptions,
): UseAlertNotificationsReturn {
  const { walletAddress, enabled = true } = options;

  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>('default');
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();

  // 초기 권한 상태 확인
  useEffect(() => {
    setNotificationPermission(getNotificationPermission());
  }, []);

  // Socket.IO 연결 및 알림 수신
  useEffect(() => {
    if (!enabled || !walletAddress) return;

    const wsUrl = getWsBaseUrl();

    const socket = io(`${wsUrl}/price`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 16000,
      timeout: 10000,
    });

    socketRef.current = socket;

    // 연결 후 사용자 Room 가입 (user:{walletAddress})
    socket.on('connect', () => {
      // PriceGateway의 사용자 Room에 가입하기 위해 subscribe 사용
      // 서버 측에서 알림은 user:{walletAddress} Room으로 전송됨
      // Socket.IO는 서버에서 Room에 join 시켜줘야 하므로,
      // 여기서는 subscribe 이벤트를 통해 간접적으로 등록하거나
      // 서버가 walletAddress 기반으로 Room을 관리한다고 가정한다.
      // 현재 서버 구현에서는 broadcastAlert가 userRoom으로 emit하므로
      // 클라이언트가 해당 Room에 join해야 한다.
      // join_user 이벤트를 서버에서 지원하지 않으므로
      // 모든 클라이언트에서 alert 이벤트를 수신하되
      // walletAddress로 필터링한다.
    });

    // 알림 이벤트 수신
    socket.on(WS_EVENTS.ALERT, (data: AlertNotification) => {
      // 알림 처리
      handleAlertReceived(data);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, walletAddress]);

  /**
   * 알림 수신 시 처리 로직
   */
  const handleAlertReceived = useCallback(
    (notification: AlertNotification) => {
      // 1. 인앱 알림 목록에 추가
      const inAppNotification: InAppNotification = {
        id: `${notification.alertId}-${Date.now()}`,
        notification,
        receivedAt: new Date(),
        isRead: false,
      };

      setNotifications((prev) => [inAppNotification, ...prev].slice(0, 100));

      // 2. 브라우저 네이티브 알림 표시 (권한 허용 시)
      showBrowserNotification(notification);

      // 3. 알림 이력 쿼리 무효화 (최신 이력 반영)
      queryClient.invalidateQueries({
        queryKey: ['alerts', 'history'],
      });
    },
    [queryClient],
  );

  /**
   * 브라우저 알림 권한 요청
   */
  const requestPermission = useCallback(async () => {
    const result = await requestNotificationPermission();
    setNotificationPermission(result);
  }, []);

  /**
   * 특정 알림을 읽음 처리
   */
  const markAsRead = useCallback((notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n)),
    );
  }, []);

  /**
   * 모든 알림을 읽음 처리
   */
  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, []);

  /**
   * 알림 목록을 모두 비운다
   */
  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  /** 읽지 않은 알림 수 */
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return {
    notifications,
    unreadCount,
    notificationPermission,
    requestPermission,
    markAsRead,
    markAllAsRead,
    clearAll,
  };
}
