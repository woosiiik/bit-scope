/**
 * 사용자 설정 저장소 단위 테스트
 *
 * Zustand 설정 스토어의 초기화, CRUD, localStorage 연동,
 * 설정 내보내기/가져오기 로직을 검증한다.
 *
 * @see 요구사항 9.3 (테마 전환)
 * @see 요구사항 9.9 (언어 전환)
 * @see 요구사항 NF5.1 (한국어 기본 언어)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettingsStore, DEFAULT_SETTINGS } from '../settings-store';

/** 테스트용 지갑 주소 */
const TEST_WALLET = '0x1234567890abcdef1234567890abcdef12345678';

/** localStorage 모의 스토리지 */
let mockStorage: Record<string, string> = {};

/** localStorage 모킹 */
beforeEach(() => {
  mockStorage = {};

  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => mockStorage[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      mockStorage[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete mockStorage[key];
    }),
    clear: vi.fn(() => {
      mockStorage = {};
    }),
  });

  // 스토어 상태 초기화
  useSettingsStore.setState({
    settings: { ...DEFAULT_SETTINGS },
    walletAddress: null,
    isInitialized: false,
  });
});

describe('settings-store', () => {
  describe('초기 상태', () => {
    it('기본 설정 값으로 초기화되어야 한다', () => {
      const { settings, walletAddress, isInitialized } = useSettingsStore.getState();

      expect(settings.theme).toBe('system');
      expect(settings.language).toBe('ko');
      expect(settings.refreshInterval).toBe(30);
      expect(settings.premiumThreshold).toBe(3);
      expect(walletAddress).toBeNull();
      expect(isInitialized).toBe(false);
    });
  });

  describe('initializeSettings', () => {
    it('지갑 주소를 기반으로 설정을 초기화해야 한다', () => {
      const { initializeSettings } = useSettingsStore.getState();

      initializeSettings(TEST_WALLET);

      const state = useSettingsStore.getState();
      expect(state.walletAddress).toBe(TEST_WALLET);
      expect(state.isInitialized).toBe(true);
      expect(state.settings).toEqual(DEFAULT_SETTINGS);
    });

    it('localStorage에 저장된 설정을 로드해야 한다', () => {
      const savedSettings = {
        theme: 'dark',
        language: 'en',
        refreshInterval: 60,
        premiumThreshold: 5,
      };
      const key = `bitscope:${TEST_WALLET.toLowerCase()}:settings`;
      mockStorage[key] = JSON.stringify(savedSettings);

      const { initializeSettings } = useSettingsStore.getState();
      initializeSettings(TEST_WALLET);

      const { settings } = useSettingsStore.getState();
      expect(settings.theme).toBe('dark');
      expect(settings.language).toBe('en');
      expect(settings.refreshInterval).toBe(60);
      expect(settings.premiumThreshold).toBe(5);
    });

    it('잘못된 localStorage 데이터에 대해 기본값을 사용해야 한다', () => {
      const key = `bitscope:${TEST_WALLET.toLowerCase()}:settings`;
      mockStorage[key] = 'invalid json';

      const { initializeSettings } = useSettingsStore.getState();
      initializeSettings(TEST_WALLET);

      const { settings } = useSettingsStore.getState();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it('유효하지 않은 설정 값에 대해 기본값으로 대체해야 한다', () => {
      const key = `bitscope:${TEST_WALLET.toLowerCase()}:settings`;
      mockStorage[key] = JSON.stringify({
        theme: 'invalid-theme',
        language: 'fr',
        refreshInterval: -10,
        premiumThreshold: -1,
      });

      const { initializeSettings } = useSettingsStore.getState();
      initializeSettings(TEST_WALLET);

      const { settings } = useSettingsStore.getState();
      expect(settings.theme).toBe(DEFAULT_SETTINGS.theme);
      expect(settings.language).toBe(DEFAULT_SETTINGS.language);
      expect(settings.refreshInterval).toBe(DEFAULT_SETTINGS.refreshInterval);
      expect(settings.premiumThreshold).toBe(DEFAULT_SETTINGS.premiumThreshold);
    });
  });

  describe('resetSettings', () => {
    it('설정을 기본값으로 리셋해야 한다', () => {
      const store = useSettingsStore.getState();
      store.initializeSettings(TEST_WALLET);
      store.setLanguage('en');
      store.setTheme('dark');

      store.resetSettings();

      const { settings, walletAddress, isInitialized } = useSettingsStore.getState();
      expect(settings).toEqual(DEFAULT_SETTINGS);
      expect(walletAddress).toBeNull();
      expect(isInitialized).toBe(false);
    });
  });

  describe('setTheme', () => {
    it('테마를 변경하고 localStorage에 저장해야 한다', () => {
      const store = useSettingsStore.getState();
      store.initializeSettings(TEST_WALLET);

      store.setTheme('dark');

      const { settings } = useSettingsStore.getState();
      expect(settings.theme).toBe('dark');

      const key = `bitscope:${TEST_WALLET.toLowerCase()}:settings`;
      const raw = mockStorage[key];
      expect(raw).toBeDefined();
      const saved = JSON.parse(raw!);
      expect(saved.theme).toBe('dark');
    });
  });

  describe('setLanguage', () => {
    it('언어를 변경하고 localStorage에 저장해야 한다', () => {
      const store = useSettingsStore.getState();
      store.initializeSettings(TEST_WALLET);

      store.setLanguage('en');

      const { settings } = useSettingsStore.getState();
      expect(settings.language).toBe('en');

      const key = `bitscope:${TEST_WALLET.toLowerCase()}:settings`;
      const raw = mockStorage[key];
      expect(raw).toBeDefined();
      const saved = JSON.parse(raw!);
      expect(saved.language).toBe('en');
    });
  });

  describe('setRefreshInterval', () => {
    it('갱신 주기를 변경해야 한다', () => {
      const store = useSettingsStore.getState();
      store.initializeSettings(TEST_WALLET);

      store.setRefreshInterval(60);

      const { settings } = useSettingsStore.getState();
      expect(settings.refreshInterval).toBe(60);
    });

    it('0 이하의 값은 무시해야 한다', () => {
      const store = useSettingsStore.getState();
      store.initializeSettings(TEST_WALLET);

      store.setRefreshInterval(0);
      expect(useSettingsStore.getState().settings.refreshInterval).toBe(DEFAULT_SETTINGS.refreshInterval);

      store.setRefreshInterval(-10);
      expect(useSettingsStore.getState().settings.refreshInterval).toBe(DEFAULT_SETTINGS.refreshInterval);
    });
  });

  describe('setPremiumThreshold', () => {
    it('김프 알림 임계값을 변경해야 한다', () => {
      const store = useSettingsStore.getState();
      store.initializeSettings(TEST_WALLET);

      store.setPremiumThreshold(5);

      const { settings } = useSettingsStore.getState();
      expect(settings.premiumThreshold).toBe(5);
    });

    it('음수 값은 무시해야 한다', () => {
      const store = useSettingsStore.getState();
      store.initializeSettings(TEST_WALLET);

      store.setPremiumThreshold(-1);
      expect(useSettingsStore.getState().settings.premiumThreshold).toBe(DEFAULT_SETTINGS.premiumThreshold);
    });

    it('0은 허용해야 한다', () => {
      const store = useSettingsStore.getState();
      store.initializeSettings(TEST_WALLET);

      store.setPremiumThreshold(0);
      expect(useSettingsStore.getState().settings.premiumThreshold).toBe(0);
    });
  });

  describe('updateSettings', () => {
    it('여러 설정을 한번에 업데이트해야 한다', () => {
      const store = useSettingsStore.getState();
      store.initializeSettings(TEST_WALLET);

      store.updateSettings({ theme: 'light', language: 'en' });

      const { settings } = useSettingsStore.getState();
      expect(settings.theme).toBe('light');
      expect(settings.language).toBe('en');
      expect(settings.refreshInterval).toBe(DEFAULT_SETTINGS.refreshInterval);
    });
  });

  describe('exportSettings / importSettings', () => {
    it('설정을 JSON 문자열로 내보내야 한다', () => {
      const store = useSettingsStore.getState();
      store.initializeSettings(TEST_WALLET);
      store.setLanguage('en');

      const json = store.exportSettings();
      const parsed = JSON.parse(json);

      expect(parsed.language).toBe('en');
      expect(parsed.theme).toBe('system');
    });

    it('유효한 JSON 설정을 가져와 적용해야 한다', () => {
      const store = useSettingsStore.getState();
      store.initializeSettings(TEST_WALLET);

      const json = JSON.stringify({ theme: 'dark', language: 'en', refreshInterval: 45 });
      const result = store.importSettings(json);

      expect(result).toBe(true);
      const { settings } = useSettingsStore.getState();
      expect(settings.theme).toBe('dark');
      expect(settings.language).toBe('en');
      expect(settings.refreshInterval).toBe(45);
    });

    it('잘못된 JSON에 대해 false를 반환해야 한다', () => {
      const store = useSettingsStore.getState();
      store.initializeSettings(TEST_WALLET);

      const result = store.importSettings('invalid json');
      expect(result).toBe(false);
    });

    it('유효한 필드가 없는 JSON에 대해 false를 반환해야 한다', () => {
      const store = useSettingsStore.getState();
      store.initializeSettings(TEST_WALLET);

      const result = store.importSettings('{"foo": "bar"}');
      expect(result).toBe(false);
    });

    it('부분적으로 유효한 JSON에서 유효한 필드만 적용해야 한다', () => {
      const store = useSettingsStore.getState();
      store.initializeSettings(TEST_WALLET);

      const json = JSON.stringify({ theme: 'dark', language: 'invalid', refreshInterval: 45 });
      const result = store.importSettings(json);

      expect(result).toBe(true);
      const { settings } = useSettingsStore.getState();
      expect(settings.theme).toBe('dark');
      expect(settings.language).toBe(DEFAULT_SETTINGS.language); // invalid는 무시
      expect(settings.refreshInterval).toBe(45);
    });
  });

  describe('지갑 주소별 데이터 분리', () => {
    it('다른 지갑 주소의 설정은 별도로 저장되어야 한다', () => {
      const wallet1 = '0xaaaa000000000000000000000000000000000001';
      const wallet2 = '0xbbbb000000000000000000000000000000000002';

      const store = useSettingsStore.getState();

      // 지갑1: 영어 설정
      store.initializeSettings(wallet1);
      store.setLanguage('en');

      // 지갑2: 한국어 (기본값)
      store.initializeSettings(wallet2);
      store.setTheme('dark');

      // 지갑1의 설정을 다시 로드
      store.initializeSettings(wallet1);
      const { settings } = useSettingsStore.getState();
      expect(settings.language).toBe('en');
      expect(settings.theme).toBe('system'); // 지갑1은 테마 변경 안 했음
    });
  });
});
