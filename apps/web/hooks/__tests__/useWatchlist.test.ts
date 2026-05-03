/**
 * useWatchlist 훅 단위 테스트
 *
 * 워치리스트(관심 코인) 관리 기능을 검증한다:
 * - 코인 추가/제거
 * - 특정 코인의 관심 여부 확인
 * - 토글 기능
 * - localStorage 저장/로드
 * - 지갑 주소별 데이터 분리
 * - 알림 설정 업데이트
 *
 * @see 요구사항 10.1 (관심 코인 추가/저장)
 * @see 요구사항 10.4 (관심 코인 제거)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWatchlist } from '../useWatchlist';

// ===== localStorage 모킹 =====

const mockStorage: Record<string, string> = {};

const mockLocalStorage = {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockStorage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockStorage[key];
  }),
  clear: vi.fn(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  }),
};

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
  });
  mockLocalStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===== 테스트 상수 =====

const WALLET_ADDRESS_1 = '0x1234abcd5678ef90';
const WALLET_ADDRESS_2 = '0xabcdef1234567890';
const STORAGE_KEY_1 = `bitscope:${WALLET_ADDRESS_1.toLowerCase()}:watchlist`;
const STORAGE_KEY_2 = `bitscope:${WALLET_ADDRESS_2.toLowerCase()}:watchlist`;

// ===== 테스트 =====

describe('useWatchlist', () => {
  describe('초기 상태', () => {
    it('지갑 주소가 비어있으면 빈 워치리스트를 반환한다', () => {
      const { result } = renderHook(() =>
        useWatchlist({ walletAddress: '' }),
      );

      expect(result.current.watchlist).toEqual([]);
      expect(result.current.watchlistSymbols).toEqual([]);
      expect(result.current.count).toBe(0);
    });

    it('localStorage에 데이터가 없으면 빈 워치리스트를 반환한다', () => {
      const { result } = renderHook(() =>
        useWatchlist({ walletAddress: WALLET_ADDRESS_1 }),
      );

      expect(result.current.watchlist).toEqual([]);
      expect(result.current.count).toBe(0);
    });

    it('localStorage에서 기존 워치리스트를 로드한다', () => {
      const existingData = [
        {
          symbol: 'BTC',
          addedAt: '2024-01-01T00:00:00.000Z',
          alertConfigs: [],
        },
        {
          symbol: 'ETH',
          addedAt: '2024-01-02T00:00:00.000Z',
          alertConfigs: [],
        },
      ];
      mockStorage[STORAGE_KEY_1] = JSON.stringify(existingData);

      const { result } = renderHook(() =>
        useWatchlist({ walletAddress: WALLET_ADDRESS_1 }),
      );

      expect(result.current.watchlist).toHaveLength(2);
      expect(result.current.watchlistSymbols).toEqual(['BTC', 'ETH']);
      expect(result.current.count).toBe(2);
    });

    it('잘못된 localStorage 데이터는 무시하고 빈 배열을 반환한다', () => {
      mockStorage[STORAGE_KEY_1] = 'invalid json';

      const { result } = renderHook(() =>
        useWatchlist({ walletAddress: WALLET_ADDRESS_1 }),
      );

      expect(result.current.watchlist).toEqual([]);
    });
  });

  describe('addCoin', () => {
    it('코인을 워치리스트에 추가한다', () => {
      const { result } = renderHook(() =>
        useWatchlist({ walletAddress: WALLET_ADDRESS_1 }),
      );

      act(() => {
        result.current.addCoin('BTC');
      });

      expect(result.current.watchlist).toHaveLength(1);
      expect(result.current.watchlist[0]!.symbol).toBe('BTC');
      expect(result.current.watchlistSymbols).toEqual(['BTC']);
      expect(result.current.count).toBe(1);
    });

    it('추가 시 localStorage에 저장한다', () => {
      const { result } = renderHook(() =>
        useWatchlist({ walletAddress: WALLET_ADDRESS_1 }),
      );

      act(() => {
        result.current.addCoin('ETH');
      });

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEY_1,
        expect.any(String),
      );

      const saved = JSON.parse(mockStorage[STORAGE_KEY_1]!);
      expect(saved).toHaveLength(1);
      expect(saved[0].symbol).toBe('ETH');
    });

    it('심볼을 대문자로 정규화한다', () => {
      const { result } = renderHook(() =>
        useWatchlist({ walletAddress: WALLET_ADDRESS_1 }),
      );

      act(() => {
        result.current.addCoin('btc');
      });

      expect(result.current.watchlist[0]!.symbol).toBe('BTC');
    });

    it('이미 존재하는 코인은 중복 추가하지 않는다', () => {
      const { result } = renderHook(() =>
        useWatchlist({ walletAddress: WALLET_ADDRESS_1 }),
      );

      act(() => {
        result.current.addCoin('BTC');
      });

      act(() => {
        result.current.addCoin('BTC');
      });

      expect(result.current.watchlist).toHaveLength(1);
    });

    it('여러 코인을 순서대로 추가할 수 있다', () => {
      const { result } = renderHook(() =>
        useWatchlist({ walletAddress: WALLET_ADDRESS_1 }),
      );

      act(() => {
        result.current.addCoin('BTC');
      });
      act(() => {
        result.current.addCoin('ETH');
      });
      act(() => {
        result.current.addCoin('XRP');
      });

      expect(result.current.watchlistSymbols).toEqual(['BTC', 'ETH', 'XRP']);
      expect(result.current.count).toBe(3);
    });

    it('지갑 주소가 비어있으면 추가하지 않는다', () => {
      const { result } = renderHook(() =>
        useWatchlist({ walletAddress: '' }),
      );

      act(() => {
        result.current.addCoin('BTC');
      });

      expect(result.current.watchlist).toHaveLength(0);
    });
  });

  describe('removeCoin', () => {
    it('코인을 워치리스트에서 제거한다', () => {
      const existingData = [
        { symbol: 'BTC', addedAt: '2024-01-01T00:00:00.000Z', alertConfigs: [] },
        { symbol: 'ETH', addedAt: '2024-01-02T00:00:00.000Z', alertConfigs: [] },
      ];
      mockStorage[STORAGE_KEY_1] = JSON.stringify(existingData);

      const { result } = renderHook(() =>
        useWatchlist({ walletAddress: WALLET_ADDRESS_1 }),
      );

      act(() => {
        result.current.removeCoin('BTC');
      });

      expect(result.current.watchlist).toHaveLength(1);
      expect(result.current.watchlistSymbols).toEqual(['ETH']);
    });

    it('제거 시 localStorage를 업데이트한다', () => {
      const existingData = [
        { symbol: 'BTC', addedAt: '2024-01-01T00:00:00.000Z', alertConfigs: [] },
      ];
      mockStorage[STORAGE_KEY_1] = JSON.stringify(existingData);

      const { result } = renderHook(() =>
        useWatchlist({ walletAddress: WALLET_ADDRESS_1 }),
      );

      act(() => {
        result.current.removeCoin('BTC');
      });

      const saved = JSON.parse(mockStorage[STORAGE_KEY_1]!);
      expect(saved).toHaveLength(0);
    });

    it('존재하지 않는 코인 제거는 무시한다', () => {
      const existingData = [
        { symbol: 'BTC', addedAt: '2024-01-01T00:00:00.000Z', alertConfigs: [] },
      ];
      mockStorage[STORAGE_KEY_1] = JSON.stringify(existingData);

      const { result } = renderHook(() =>
        useWatchlist({ walletAddress: WALLET_ADDRESS_1 }),
      );

      act(() => {
        result.current.removeCoin('DOGE');
      });

      expect(result.current.watchlist).toHaveLength(1);
      expect(result.current.watchlistSymbols).toEqual(['BTC']);
    });
  });

  describe('isInWatchlist', () => {
    it('워치리스트에 있는 코인은 true를 반환한다', () => {
      const { result } = renderHook(() =>
        useWatchlist({ walletAddress: WALLET_ADDRESS_1 }),
      );

      act(() => {
        result.current.addCoin('BTC');
      });

      expect(result.current.isInWatchlist('BTC')).toBe(true);
    });

    it('워치리스트에 없는 코인은 false를 반환한다', () => {
      const { result } = renderHook(() =>
        useWatchlist({ walletAddress: WALLET_ADDRESS_1 }),
      );

      expect(result.current.isInWatchlist('BTC')).toBe(false);
    });

    it('대소문자 구분 없이 확인한다', () => {
      const { result } = renderHook(() =>
        useWatchlist({ walletAddress: WALLET_ADDRESS_1 }),
      );

      act(() => {
        result.current.addCoin('BTC');
      });

      expect(result.current.isInWatchlist('btc')).toBe(true);
      expect(result.current.isInWatchlist('Btc')).toBe(true);
    });
  });

  describe('toggleCoin', () => {
    it('워치리스트에 없는 코인을 토글하면 추가한다', () => {
      const { result } = renderHook(() =>
        useWatchlist({ walletAddress: WALLET_ADDRESS_1 }),
      );

      act(() => {
        result.current.toggleCoin('BTC');
      });

      expect(result.current.isInWatchlist('BTC')).toBe(true);
    });

    it('워치리스트에 있는 코인을 토글하면 제거한다', () => {
      const { result } = renderHook(() =>
        useWatchlist({ walletAddress: WALLET_ADDRESS_1 }),
      );

      act(() => {
        result.current.addCoin('BTC');
      });

      act(() => {
        result.current.toggleCoin('BTC');
      });

      expect(result.current.isInWatchlist('BTC')).toBe(false);
    });
  });

  describe('updateAlertConfigs', () => {
    it('특정 코인의 알림 설정을 업데이트한다', () => {
      const { result } = renderHook(() =>
        useWatchlist({ walletAddress: WALLET_ADDRESS_1 }),
      );

      act(() => {
        result.current.addCoin('BTC');
      });

      const alertConfig = {
        symbol: 'BTC',
        condition: 'above' as const,
        targetValue: 50000000,
        isActive: true,
      };

      act(() => {
        result.current.updateAlertConfigs('BTC', [alertConfig]);
      });

      expect(result.current.watchlist[0]!.alertConfigs).toHaveLength(1);
      expect(result.current.watchlist[0]!.alertConfigs[0]).toEqual(alertConfig);
    });

    it('존재하지 않는 코인의 알림 설정 업데이트는 무시한다', () => {
      const { result } = renderHook(() =>
        useWatchlist({ walletAddress: WALLET_ADDRESS_1 }),
      );

      act(() => {
        result.current.addCoin('BTC');
      });

      act(() => {
        result.current.updateAlertConfigs('ETH', [
          { symbol: 'ETH', condition: 'above', targetValue: 3000000, isActive: true },
        ]);
      });

      // BTC의 alertConfigs는 변경되지 않는다
      expect(result.current.watchlist[0]!.alertConfigs).toHaveLength(0);
    });
  });

  describe('지갑 주소별 데이터 격리', () => {
    it('다른 지갑 주소의 워치리스트는 별도로 관리된다', () => {
      // 지갑 1에 데이터 설정
      const data1 = [
        { symbol: 'BTC', addedAt: '2024-01-01T00:00:00.000Z', alertConfigs: [] },
      ];
      mockStorage[STORAGE_KEY_1] = JSON.stringify(data1);

      // 지갑 2에 데이터 설정
      const data2 = [
        { symbol: 'ETH', addedAt: '2024-01-02T00:00:00.000Z', alertConfigs: [] },
        { symbol: 'XRP', addedAt: '2024-01-03T00:00:00.000Z', alertConfigs: [] },
      ];
      mockStorage[STORAGE_KEY_2] = JSON.stringify(data2);

      // 지갑 1 조회
      const { result: result1 } = renderHook(() =>
        useWatchlist({ walletAddress: WALLET_ADDRESS_1 }),
      );
      expect(result1.current.watchlistSymbols).toEqual(['BTC']);

      // 지갑 2 조회
      const { result: result2 } = renderHook(() =>
        useWatchlist({ walletAddress: WALLET_ADDRESS_2 }),
      );
      expect(result2.current.watchlistSymbols).toEqual(['ETH', 'XRP']);
    });

    it('지갑 주소 변경 시 워치리스트가 재로드된다', () => {
      const data1 = [
        { symbol: 'BTC', addedAt: '2024-01-01T00:00:00.000Z', alertConfigs: [] },
      ];
      const data2 = [
        { symbol: 'ETH', addedAt: '2024-01-02T00:00:00.000Z', alertConfigs: [] },
      ];
      mockStorage[STORAGE_KEY_1] = JSON.stringify(data1);
      mockStorage[STORAGE_KEY_2] = JSON.stringify(data2);

      let walletAddress = WALLET_ADDRESS_1;
      const { result, rerender } = renderHook(() =>
        useWatchlist({ walletAddress }),
      );

      expect(result.current.watchlistSymbols).toEqual(['BTC']);

      // 지갑 주소 변경
      walletAddress = WALLET_ADDRESS_2;
      rerender();

      expect(result.current.watchlistSymbols).toEqual(['ETH']);
    });
  });

  describe('localStorage 데이터 유효성 검증', () => {
    it('배열이 아닌 데이터는 빈 배열로 처리한다', () => {
      mockStorage[STORAGE_KEY_1] = JSON.stringify({ notAnArray: true });

      const { result } = renderHook(() =>
        useWatchlist({ walletAddress: WALLET_ADDRESS_1 }),
      );

      expect(result.current.watchlist).toEqual([]);
    });

    it('심볼이 없는 항목은 필터링한다', () => {
      const data = [
        { symbol: 'BTC', addedAt: '2024-01-01T00:00:00.000Z', alertConfigs: [] },
        { symbol: '', addedAt: '2024-01-02T00:00:00.000Z', alertConfigs: [] },
        { addedAt: '2024-01-03T00:00:00.000Z', alertConfigs: [] },
      ];
      mockStorage[STORAGE_KEY_1] = JSON.stringify(data);

      const { result } = renderHook(() =>
        useWatchlist({ walletAddress: WALLET_ADDRESS_1 }),
      );

      expect(result.current.watchlist).toHaveLength(1);
      expect(result.current.watchlistSymbols).toEqual(['BTC']);
    });

    it('alertConfigs가 없는 항목은 빈 배열로 초기화한다', () => {
      const data = [
        { symbol: 'BTC', addedAt: '2024-01-01T00:00:00.000Z' },
      ];
      mockStorage[STORAGE_KEY_1] = JSON.stringify(data);

      const { result } = renderHook(() =>
        useWatchlist({ walletAddress: WALLET_ADDRESS_1 }),
      );

      expect(result.current.watchlist[0]!.alertConfigs).toEqual([]);
    });
  });
});
