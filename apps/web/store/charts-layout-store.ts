/**
 * 차트 페이지 레이아웃 스토어 (Zustand)
 *
 * /charts 페이지의 차트 목록을 관리한다.
 * 지갑 주소별로 localStorage에 저장/복원한다.
 */

import { create } from 'zustand';

import type { ChartConfig, ChartsLayoutConfig } from '@/lib/life/types';
import { DEFAULT_CHARTS } from '@/lib/life/constants';

/** localStorage 키 생성 */
function getStorageKey(walletAddress: string): string {
  return `bitscope:${walletAddress.toLowerCase()}:charts-layout`;
}

/** 최대 차트 수 */
const MAX_CHARTS = 6;

interface ChartsLayoutState {
  config: ChartsLayoutConfig;
  loadConfig: (walletAddress: string) => void;
  addChart: (walletAddress: string, chart: ChartConfig) => void;
  updateChart: (walletAddress: string, index: number, chart: ChartConfig) => void;
  removeChart: (walletAddress: string, index: number) => void;
  resetToDefault: (walletAddress: string) => void;
}

export const useChartsLayoutStore = create<ChartsLayoutState>((set, get) => ({
  config: { charts: [...DEFAULT_CHARTS] },

  loadConfig: (walletAddress) => {
    try {
      const key = getStorageKey(walletAddress);
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored) as ChartsLayoutConfig;
        set({ config: parsed });
        return;
      }
    } catch { /* 파싱 실패 시 기본값 */ }
    set({ config: { charts: [...DEFAULT_CHARTS] } });
  },

  addChart: (walletAddress, chart) => {
    const current = get().config;
    if (current.charts.length >= MAX_CHARTS) return;

    const newConfig = { charts: [...current.charts, chart] };
    set({ config: newConfig });
    try {
      localStorage.setItem(getStorageKey(walletAddress), JSON.stringify(newConfig));
    } catch { /* */ }
  },

  updateChart: (walletAddress, index, chart) => {
    const current = get().config;
    const charts = [...current.charts];
    charts[index] = chart;
    const newConfig = { charts };

    set({ config: newConfig });
    try {
      localStorage.setItem(getStorageKey(walletAddress), JSON.stringify(newConfig));
    } catch { /* */ }
  },

  removeChart: (walletAddress, index) => {
    const current = get().config;
    const charts = current.charts.filter((_, i) => i !== index);
    const newConfig = { charts };

    set({ config: newConfig });
    try {
      localStorage.setItem(getStorageKey(walletAddress), JSON.stringify(newConfig));
    } catch { /* */ }
  },

  resetToDefault: (walletAddress) => {
    const newConfig = { charts: [...DEFAULT_CHARTS] };
    set({ config: newConfig });
    try {
      localStorage.setItem(getStorageKey(walletAddress), JSON.stringify(newConfig));
    } catch { /* */ }
  },
}));
