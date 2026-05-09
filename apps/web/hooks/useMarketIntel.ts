/**
 * 시장 인텔리전스 훅
 *
 * 공포/탐욕 지수, 경제 캘린더, 고래 알림 데이터를 조회한다.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/api-url';

// ===== 공포/탐욕 지수 =====

export interface FearGreedEntry {
  value: number;
  classification: string;
  timestamp: number;
}

export function useFearGreed(enabled: boolean = true) {
  return useQuery<FearGreedEntry[]>({
    queryKey: ['market-intel', 'fear-greed'],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/market-intel/fear-greed`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return [];
      const json = await res.json();
      // 이중 래핑 처리: { data: { data: [...] } } 또는 { data: [...] }
      const inner = json.data?.data;
      return Array.isArray(inner) ? inner : Array.isArray(json.data) ? json.data : [];
    },
    enabled,
    refetchInterval: 300_000, // 5분
    staleTime: 120_000,
  });
}

// ===== 경제 캘린더 =====

export interface EconomicEvent {
  id: string;
  title: string;
  titleKo: string;
  date: string;
  time?: string;
  importance: 'high' | 'medium' | 'low';
  category: string;
  country?: string;
  forecast?: string;
  previous?: string;
}

export function useEconomicCalendar(enabled: boolean = true) {
  return useQuery<EconomicEvent[]>({
    queryKey: ['market-intel', 'calendar'],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/market-intel/calendar`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return [];
      const json = await res.json();
      const inner = json.data?.data;
      return Array.isArray(inner) ? inner : Array.isArray(json.data) ? json.data : [];
    },
    enabled,
    refetchInterval: 600_000, // 10분
    staleTime: 300_000,
  });
}

// ===== 고래 알림 =====

export interface WhaleTransaction {
  id: string;
  symbol: string;
  amount: number;
  amountUsd: number;
  from: string;
  to: string;
  timestamp: number;
  type: string;
}

export function useWhaleAlerts(enabled: boolean = true) {
  return useQuery<WhaleTransaction[]>({
    queryKey: ['market-intel', 'whale'],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/market-intel/whale`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return [];
      const json = await res.json();
      const inner = json.data?.data;
      return Array.isArray(inner) ? inner : Array.isArray(json.data) ? json.data : [];
    },
    enabled,
    refetchInterval: 120_000, // 2분
    staleTime: 60_000,
  });
}

/** 공포/탐욕 값에 따른 색상 */
export function getFearGreedColor(value: number): string {
  if (value <= 20) return 'text-red-600';
  if (value <= 40) return 'text-orange-500';
  if (value <= 60) return 'text-yellow-500';
  if (value <= 80) return 'text-green-500';
  return 'text-green-600';
}

export function getFearGreedBgColor(value: number): string {
  if (value <= 20) return 'bg-red-600';
  if (value <= 40) return 'bg-orange-500';
  if (value <= 60) return 'bg-yellow-500';
  if (value <= 80) return 'bg-green-500';
  return 'bg-green-600';
}

export function getFearGreedLabel(value: number): string {
  if (value <= 20) return '극도의 공포';
  if (value <= 40) return '공포';
  if (value <= 60) return '중립';
  if (value <= 80) return '탐욕';
  return '극도의 탐욕';
}

export function formatUsd(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}
