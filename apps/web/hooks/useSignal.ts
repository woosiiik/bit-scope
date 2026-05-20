/**
 * 시그널 인증 및 데이터 조회 훅
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CoinLatestSignal, SignalListResponse, VerifyPasswordResponse } from '@bitscope/shared';

const TOKEN_KEY = 'signal-token';
const AUTH_EVENT = 'signal-auth-changed';

/** 인증 변경을 다른 훅 인스턴스에 알린다 */
function notifyAuthChange() {
  window.dispatchEvent(new Event(AUTH_EVENT));
}

/**
 * 시그널 히든 메뉴 인증 상태 관리
 *
 * 여러 컴포넌트(SidebarNav, PasswordModal, SignalPage)에서
 * 각각 호출되므로, 커스텀 이벤트로 상태를 동기화한다.
 */
export function useSignalAuth() {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(TOKEN_KEY);
    }
    return null;
  });
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIsReady(true);

    // 다른 훅 인스턴스에서 인증 상태가 변경되면 동기화
    const handleAuthChange = () => {
      setToken(sessionStorage.getItem(TOKEN_KEY));
    };
    window.addEventListener(AUTH_EVENT, handleAuthChange);
    return () => window.removeEventListener(AUTH_EVENT, handleAuthChange);
  }, []);

  const isAuthenticated = !!token;

  const login = useCallback(async (password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/signal/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        signal: AbortSignal.timeout(10_000),
      });

      const json = await res.json();
      const data: VerifyPasswordResponse = json.data?.data ?? json.data ?? json;

      if (data.success && data.token) {
        sessionStorage.setItem(TOKEN_KEY, data.token);
        setToken(data.token);
        notifyAuthChange();
        return { success: true };
      }

      return { success: false, error: '비밀번호가 올바르지 않습니다.' };
    } catch {
      return { success: false, error: '네트워크 오류가 발생했습니다.' };
    }
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    notifyAuthChange();
  }, []);

  return { isAuthenticated, isReady, token, login, logout };
}

/**
 * 코인별 최신 시그널 조회
 */
export function useSignalLatest(enabled: boolean = true) {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_KEY) : null;

  return useQuery<CoinLatestSignal[]>({
    queryKey: ['signal', 'latest'],
    queryFn: async () => {
      const res = await fetch('/api/signal/latest', {
        headers: { 'x-signal-token': token ?? '' },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 403) {
        sessionStorage.removeItem(TOKEN_KEY);
        return [];
      }
      if (!res.ok) throw new Error('시그널 조회 실패');
      const json = await res.json();
      return json.data?.data ?? json.data ?? [];
    },
    enabled: enabled && !!token,
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 2,
  });
}

/**
 * 시그널 목록 조회 (페이지네이션)
 */
export function useSignalList(page: number = 1, enabled: boolean = true) {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_KEY) : null;

  return useQuery<SignalListResponse>({
    queryKey: ['signal', 'list', page],
    queryFn: async () => {
      const res = await fetch(`/api/signal/list?page=${page}&limit=50`, {
        headers: { 'x-signal-token': token ?? '' },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 403) {
        sessionStorage.removeItem(TOKEN_KEY);
        throw new Error('인증 만료');
      }
      if (!res.ok) throw new Error('시그널 목록 조회 실패');
      const json = await res.json();
      return json.data?.data ?? json.data ?? { items: [], total: 0, page, limit: 50 };
    },
    enabled: enabled && !!token,
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 2,
  });
}

/**
 * 특정 코인의 시그널 이력 조회
 */
export function useSignalByCoin(coinSymbol: string | null, enabled: boolean = true) {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_KEY) : null;

  return useQuery<SignalItem[]>({
    queryKey: ['signal', 'coin', coinSymbol],
    queryFn: async () => {
      const res = await fetch(`/api/signal/coin/${coinSymbol!.replace('/', '-')}`, {
        headers: { 'x-signal-token': token ?? '' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return [];
      const json = await res.json();
      return json.data?.data ?? json.data ?? [];
    },
    enabled: enabled && !!token && !!coinSymbol,
    staleTime: 30_000,
    retry: 1,
  });
}
