/**
 * 크립토 라이프 레이아웃 스토어 (Zustand)
 *
 * /life 페이지의 그리드 레이아웃 및 위젯 배치 설정을 관리한다.
 * 지갑 주소별로 localStorage에 저장/복원한다.
 */

import { create } from 'zustand';

import type { GridLayout, WidgetConfig, LifeLayoutConfig } from '@/lib/life/types';
import { DEFAULT_LIFE_LAYOUT, GRID_CELL_COUNTS } from '@/lib/life/constants';

/** localStorage 키 생성 */
function getStorageKey(walletAddress: string): string {
  return `bitscope:${walletAddress.toLowerCase()}:life-layout`;
}

interface LifeLayoutState {
  config: LifeLayoutConfig;
  /** 설정을 localStorage에서 로드한다 */
  loadConfig: (walletAddress: string) => void;
  /** 레이아웃을 변경한다 */
  setLayout: (walletAddress: string, layout: GridLayout) => void;
  /** 특정 셀의 위젯을 설정한다 */
  setWidget: (walletAddress: string, index: number, widget: WidgetConfig | null) => void;
  /** 기본 설정으로 초기화한다 */
  resetToDefault: (walletAddress: string) => void;
}

export const useLifeLayoutStore = create<LifeLayoutState>((set, get) => ({
  config: { ...DEFAULT_LIFE_LAYOUT },

  loadConfig: (walletAddress) => {
    try {
      const key = getStorageKey(walletAddress);
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored) as LifeLayoutConfig;
        set({ config: parsed });
        return;
      }
    } catch {
      // 파싱 실패 시 기본값 유지
    }
    set({ config: { ...DEFAULT_LIFE_LAYOUT } });
  },

  setLayout: (walletAddress, layout) => {
    const current = get().config;
    const cellCount = GRID_CELL_COUNTS[layout];
    // 위젯 배열 크기를 새 레이아웃에 맞게 조정
    const widgets = Array.from({ length: cellCount }, (_, i) => current.widgets[i] ?? null);
    const newConfig = { layout, widgets };

    set({ config: newConfig });
    try {
      localStorage.setItem(getStorageKey(walletAddress), JSON.stringify(newConfig));
    } catch { /* 저장 실패 무시 */ }
  },

  setWidget: (walletAddress, index, widget) => {
    const current = get().config;
    const widgets = [...current.widgets];
    widgets[index] = widget;
    const newConfig = { ...current, widgets };

    set({ config: newConfig });
    try {
      localStorage.setItem(getStorageKey(walletAddress), JSON.stringify(newConfig));
    } catch { /* 저장 실패 무시 */ }
  },

  resetToDefault: (walletAddress) => {
    const newConfig = { ...DEFAULT_LIFE_LAYOUT };
    set({ config: newConfig });
    try {
      localStorage.setItem(getStorageKey(walletAddress), JSON.stringify(newConfig));
    } catch { /* 저장 실패 무시 */ }
  },
}));
