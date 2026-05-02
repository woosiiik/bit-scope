/**
 * 사용자 설정 저장소 (Zustand)
 *
 * 테마, 언어, 자동 갱신 주기, 김프 알림 임계값 등
 * 사용자 설정을 관리한다. 설정은 localStorage에
 * 지갑 주소별로 분리 저장된다.
 *
 * @see 요구사항 9.3, 9.4 (다크/라이트/시스템 테마)
 * @see 요구사항 9.9 (한국어/영어 지원)
 * @see 요구사항 NF5.1 (한국어 기본 언어)
 * @see 요구사항 2.4 (자동 갱신 주기 기본 30초)
 * @see 설계문서 4.3 localStorage 데이터 구조
 */

import { create } from 'zustand';
import { type Locale, DEFAULT_LOCALE, isValidLocale } from '@/lib/i18n';

/** 테마 모드 */
export type ThemeMode = 'light' | 'dark' | 'system';

/** 사용자 설정 인터페이스 */
export interface UserSettings {
  /** 테마 모드 */
  theme: ThemeMode;
  /** 언어 */
  language: Locale;
  /** 자동 갱신 주기 (초 단위, 기본 30) */
  refreshInterval: number;
  /** 김프 알림 임계값 (%, 기본 3) */
  premiumThreshold: number;
}

/** 기본 설정 값 */
export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  language: DEFAULT_LOCALE,
  refreshInterval: 30,
  premiumThreshold: 3,
};

/** localStorage 키 생성 */
function getStorageKey(walletAddress: string): string {
  return `bitscope:${walletAddress.toLowerCase()}:settings`;
}

/**
 * localStorage에서 설정을 로드한다.
 *
 * @param walletAddress - 지갑 주소
 * @returns 저장된 설정 또는 null
 */
function loadSettingsFromStorage(walletAddress: string): UserSettings | null {
  if (typeof window === 'undefined') return null;

  try {
    const key = getStorageKey(walletAddress);
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    // 유효성 검증 후 반환
    return {
      theme: ['light', 'dark', 'system'].includes(parsed.theme)
        ? parsed.theme
        : DEFAULT_SETTINGS.theme,
      language: isValidLocale(parsed.language)
        ? parsed.language
        : DEFAULT_SETTINGS.language,
      refreshInterval:
        typeof parsed.refreshInterval === 'number' && parsed.refreshInterval > 0
          ? parsed.refreshInterval
          : DEFAULT_SETTINGS.refreshInterval,
      premiumThreshold:
        typeof parsed.premiumThreshold === 'number' && parsed.premiumThreshold >= 0
          ? parsed.premiumThreshold
          : DEFAULT_SETTINGS.premiumThreshold,
    };
  } catch {
    return null;
  }
}

/**
 * localStorage에 설정을 저장한다.
 *
 * @param walletAddress - 지갑 주소
 * @param settings - 저장할 설정
 */
function saveSettingsToStorage(walletAddress: string, settings: UserSettings): void {
  if (typeof window === 'undefined') return;

  try {
    const key = getStorageKey(walletAddress);
    localStorage.setItem(key, JSON.stringify(settings));
  } catch {
    // localStorage 용량 초과 등의 오류는 무시
  }
}

/** 설정 저장소 상태 인터페이스 */
interface SettingsState {
  /** 현재 설정 */
  settings: UserSettings;
  /** 연결된 지갑 주소 (설정 저장/로드에 사용) */
  walletAddress: string | null;
  /** 설정 초기화 완료 여부 */
  isInitialized: boolean;

  /** 지갑 주소 기반으로 설정을 초기화한다. */
  initializeSettings: (walletAddress: string) => void;
  /** 지갑 연결 해제 시 기본값으로 리셋한다. */
  resetSettings: () => void;

  /** 테마를 변경한다. */
  setTheme: (theme: ThemeMode) => void;
  /** 언어를 변경한다. */
  setLanguage: (language: Locale) => void;
  /** 자동 갱신 주기를 변경한다. */
  setRefreshInterval: (seconds: number) => void;
  /** 김프 알림 임계값을 변경한다. */
  setPremiumThreshold: (percent: number) => void;
  /** 여러 설정을 한번에 업데이트한다. */
  updateSettings: (partial: Partial<UserSettings>) => void;

  /** 현재 설정을 JSON 형식으로 내보낸다. */
  exportSettings: () => string;
  /** JSON 형식의 설정을 가져와 적용한다. */
  importSettings: (json: string) => boolean;
}

/**
 * 설정 저장소 업데이트 헬퍼
 *
 * 설정을 업데이트하고 localStorage에 동기화한다.
 */
function updateAndPersist(
  state: SettingsState,
  partial: Partial<UserSettings>,
): Partial<SettingsState> {
  const newSettings = { ...state.settings, ...partial };

  if (state.walletAddress) {
    saveSettingsToStorage(state.walletAddress, newSettings);
  }

  return { settings: newSettings };
}

/**
 * Zustand 사용자 설정 저장소
 *
 * @example
 * ```tsx
 * function SettingsPage() {
 *   const { settings, setLanguage, setTheme } = useSettingsStore();
 *   return (
 *     <div>
 *       <select value={settings.language} onChange={e => setLanguage(e.target.value as Locale)}>
 *         <option value="ko">한국어</option>
 *         <option value="en">English</option>
 *       </select>
 *     </div>
 *   );
 * }
 * ```
 */
export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  walletAddress: null,
  isInitialized: false,

  initializeSettings: (walletAddress: string) => {
    const saved = loadSettingsFromStorage(walletAddress);
    set({
      walletAddress,
      settings: saved ?? { ...DEFAULT_SETTINGS },
      isInitialized: true,
    });
  },

  resetSettings: () => {
    set({
      settings: { ...DEFAULT_SETTINGS },
      walletAddress: null,
      isInitialized: false,
    });
  },

  setTheme: (theme: ThemeMode) => {
    set((state) => updateAndPersist(state, { theme }));
  },

  setLanguage: (language: Locale) => {
    set((state) => updateAndPersist(state, { language }));
  },

  setRefreshInterval: (seconds: number) => {
    if (seconds <= 0) return;
    set((state) => updateAndPersist(state, { refreshInterval: seconds }));
  },

  setPremiumThreshold: (percent: number) => {
    if (percent < 0) return;
    set((state) => updateAndPersist(state, { premiumThreshold: percent }));
  },

  updateSettings: (partial: Partial<UserSettings>) => {
    set((state) => updateAndPersist(state, partial));
  },

  exportSettings: (): string => {
    const { settings } = get();
    return JSON.stringify(settings, null, 2);
  },

  importSettings: (json: string): boolean => {
    try {
      const parsed = JSON.parse(json);

      // 유효성 검증
      const validated: Partial<UserSettings> = {};

      if (parsed.theme && ['light', 'dark', 'system'].includes(parsed.theme)) {
        validated.theme = parsed.theme;
      }
      if (isValidLocale(parsed.language)) {
        validated.language = parsed.language;
      }
      if (typeof parsed.refreshInterval === 'number' && parsed.refreshInterval > 0) {
        validated.refreshInterval = parsed.refreshInterval;
      }
      if (typeof parsed.premiumThreshold === 'number' && parsed.premiumThreshold >= 0) {
        validated.premiumThreshold = parsed.premiumThreshold;
      }

      if (Object.keys(validated).length === 0) return false;

      set((state) => updateAndPersist(state, validated));
      return true;
    } catch {
      return false;
    }
  },
}));
