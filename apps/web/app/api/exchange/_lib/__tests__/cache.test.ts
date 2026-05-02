/**
 * TTL 기반 인메모리 캐시 단위 테스트
 *
 * 캐시 히트/미스, TTL 만료, 스테일 데이터 조회,
 * 캐시 키 생성, 정리(cleanup) 동작을 검증한다.
 *
 * @see 요구사항 12.5 (캐싱 전략, 기본 TTL 10초)
 * @see 요구사항 12.8 (거래소 점검 시 마지막 캐시 데이터 반환)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  InMemoryCache,
  buildCacheKey,
  getGlobalCache,
  resetGlobalCache,
} from '../cache';

describe('InMemoryCache', () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    // 기본 TTL 1초, 정리 주기 5초로 설정하여 빠른 테스트 가능
    cache = new InMemoryCache(1000, 5000);
  });

  afterEach(() => {
    cache.stopCleanup();
    cache.clear();
  });

  describe('set / get', () => {
    it('데이터를 저장하고 조회할 수 있다', () => {
      const data = { price: 50000000, symbol: 'BTC' };
      cache.set('test-key', data);

      const result = cache.get('test-key');

      expect(result.hit).toBe(true);
      expect(result.data).toEqual(data);
      expect(result.isFresh).toBe(true);
      expect(result.storedAt).toBeTypeOf('number');
    });

    it('존재하지 않는 키를 조회하면 캐시 미스를 반환한다', () => {
      const result = cache.get('non-existent');

      expect(result.hit).toBe(false);
      expect(result.data).toBeNull();
      expect(result.isFresh).toBe(false);
      expect(result.storedAt).toBeNull();
    });

    it('커스텀 TTL을 지정하여 저장할 수 있다', () => {
      cache.set('custom-ttl', { value: 1 }, 5000);

      const result = cache.get('custom-ttl');

      expect(result.hit).toBe(true);
      expect(result.data).toEqual({ value: 1 });
    });

    it('다양한 타입의 데이터를 저장할 수 있다', () => {
      cache.set('string', 'hello');
      cache.set('number', 42);
      cache.set('array', [1, 2, 3]);
      cache.set('null', null);

      expect(cache.get<string>('string').data).toBe('hello');
      expect(cache.get<number>('number').data).toBe(42);
      expect(cache.get<number[]>('array').data).toEqual([1, 2, 3]);
      expect(cache.get('null').data).toBeNull();
    });

    it('동일 키에 새 데이터를 저장하면 덮어쓴다', () => {
      cache.set('key', 'old');
      cache.set('key', 'new');

      expect(cache.get<string>('key').data).toBe('new');
    });
  });

  describe('TTL 만료', () => {
    it('TTL이 만료된 항목은 캐시 미스를 반환한다', () => {
      vi.useFakeTimers();

      try {
        cache.set('expires', { value: 'test' }, 500);

        // 500ms 이전에는 히트
        const before = cache.get('expires');
        expect(before.hit).toBe(true);

        // 500ms 이후에는 미스
        vi.advanceTimersByTime(600);
        const after = cache.get('expires');
        expect(after.hit).toBe(false);
        expect(after.data).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('TTL 직전에는 아직 유효하다', () => {
      vi.useFakeTimers();

      try {
        cache.set('edge', 'data', 1000);

        vi.advanceTimersByTime(999);
        const result = cache.get('edge');
        expect(result.hit).toBe(true);
        expect(result.isFresh).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('TTL 만료 시 lazy 삭제로 캐시에서 제거된다', () => {
      vi.useFakeTimers();

      try {
        cache.set('lazy', 'data', 100);
        expect(cache.size).toBe(1);

        vi.advanceTimersByTime(200);
        cache.get('lazy'); // lazy 삭제 트리거

        expect(cache.size).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('getWithStale', () => {
    it('유효한 항목은 isFresh=true로 반환한다', () => {
      cache.set('fresh', { value: 'fresh-data' });

      const result = cache.getWithStale('fresh');

      expect(result.hit).toBe(true);
      expect(result.isFresh).toBe(true);
      expect(result.data).toEqual({ value: 'fresh-data' });
    });

    it('TTL 만료된 항목도 isFresh=false로 반환한다 (스테일 데이터)', () => {
      vi.useFakeTimers();

      try {
        cache.set('stale', { value: 'old-data' }, 500);

        vi.advanceTimersByTime(600);
        const result = cache.getWithStale('stale');

        expect(result.hit).toBe(true);
        expect(result.isFresh).toBe(false);
        expect(result.data).toEqual({ value: 'old-data' });
      } finally {
        vi.useRealTimers();
      }
    });

    it('존재하지 않는 키는 hit=false를 반환한다', () => {
      const result = cache.getWithStale('non-existent');

      expect(result.hit).toBe(false);
      expect(result.data).toBeNull();
    });

    it('스테일 데이터 조회 시 캐시에서 삭제하지 않는다', () => {
      vi.useFakeTimers();

      try {
        cache.set('persistent', 'data', 100);
        expect(cache.size).toBe(1);

        vi.advanceTimersByTime(200);
        cache.getWithStale('persistent'); // 삭제하지 않음

        expect(cache.size).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('delete / clear / has', () => {
    it('특정 항목을 삭제할 수 있다', () => {
      cache.set('to-delete', 'value');

      const deleted = cache.delete('to-delete');

      expect(deleted).toBe(true);
      expect(cache.get('to-delete').hit).toBe(false);
    });

    it('존재하지 않는 항목 삭제 시 false를 반환한다', () => {
      const deleted = cache.delete('non-existent');
      expect(deleted).toBe(false);
    });

    it('모든 항목을 삭제할 수 있다', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      expect(cache.size).toBe(3);

      cache.clear();

      expect(cache.size).toBe(0);
    });

    it('유효한 항목의 존재 여부를 확인할 수 있다', () => {
      cache.set('exists', 'yes');

      expect(cache.has('exists')).toBe(true);
      expect(cache.has('no')).toBe(false);
    });

    it('TTL 만료된 항목은 has()에서 false를 반환한다', () => {
      vi.useFakeTimers();

      try {
        cache.set('expired', 'data', 100);
        expect(cache.has('expired')).toBe(true);

        vi.advanceTimersByTime(200);
        expect(cache.has('expired')).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('removeExpiredEntries', () => {
    it('만료된 항목만 제거한다', () => {
      vi.useFakeTimers();

      try {
        cache.set('short', 'a', 100);
        cache.set('long', 'b', 5000);

        vi.advanceTimersByTime(200);
        const removed = cache.removeExpiredEntries();

        expect(removed).toBe(1);
        expect(cache.size).toBe(1);
        expect(cache.get('long').hit).toBe(true);
        expect(cache.get('short').hit).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('만료된 항목이 없으면 0을 반환한다', () => {
      cache.set('a', 1);
      cache.set('b', 2);

      const removed = cache.removeExpiredEntries();
      expect(removed).toBe(0);
    });

    it('모든 항목이 만료되면 전부 제거한다', () => {
      vi.useFakeTimers();

      try {
        cache.set('x', 1, 100);
        cache.set('y', 2, 100);
        cache.set('z', 3, 100);

        vi.advanceTimersByTime(200);
        const removed = cache.removeExpiredEntries();

        expect(removed).toBe(3);
        expect(cache.size).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('startCleanup / stopCleanup', () => {
    it('정리 타이머를 시작하고 중지할 수 있다', () => {
      vi.useFakeTimers();

      try {
        cache.set('item', 'data', 100);
        cache.startCleanup();

        // 정리 주기(5초) 전에는 만료 항목이 남아있을 수 있음
        vi.advanceTimersByTime(200);
        // lazy 삭제 없이 size 확인 (직접 Map에 남아있음)
        // 주의: get()을 호출하면 lazy 삭제가 트리거됨

        // 정리 주기가 지나면 자동 정리
        vi.advanceTimersByTime(5000);
        expect(cache.size).toBe(0);

        cache.stopCleanup();
      } finally {
        vi.useRealTimers();
      }
    });

    it('startCleanup을 중복 호출해도 타이머가 하나만 생성된다', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');

      cache.startCleanup();
      cache.startCleanup();
      cache.startCleanup();

      // setInterval이 한 번만 호출되어야 한다
      expect(setIntervalSpy).toHaveBeenCalledTimes(1);

      cache.stopCleanup();
      setIntervalSpy.mockRestore();
    });
  });
});

describe('buildCacheKey', () => {
  it('거래소와 엔드포인트로 캐시 키를 생성한다', () => {
    const key = buildCacheKey('upbit', '/v1/ticker');
    expect(key).toBe('upbit:/v1/ticker');
  });

  it('쿼리 파라미터를 포함하여 캐시 키를 생성한다', () => {
    const key = buildCacheKey('upbit', '/v1/ticker', { markets: 'KRW-BTC' });
    expect(key).toBe('upbit:/v1/ticker?markets=KRW-BTC');
  });

  it('쿼리 파라미터를 알파벳 순으로 정렬하여 동일한 키를 생성한다', () => {
    const key1 = buildCacheKey('bithumb', '/public/ticker', {
      b: '2',
      a: '1',
    });
    const key2 = buildCacheKey('bithumb', '/public/ticker', {
      a: '1',
      b: '2',
    });

    expect(key1).toBe(key2);
    expect(key1).toBe('bithumb:/public/ticker?a=1&b=2');
  });

  it('빈 파라미터 객체는 쿼리 문자열을 추가하지 않는다', () => {
    const key = buildCacheKey('coinone', '/v2/ticker', {});
    expect(key).toBe('coinone:/v2/ticker');
  });

  it('파라미터가 undefined이면 쿼리 문자열을 추가하지 않는다', () => {
    const key = buildCacheKey('coinone', '/v2/ticker');
    expect(key).toBe('coinone:/v2/ticker');
  });
});

describe('getGlobalCache / resetGlobalCache', () => {
  afterEach(() => {
    resetGlobalCache();
  });

  it('전역 캐시 인스턴스를 반환한다', () => {
    const cache = getGlobalCache();

    expect(cache).toBeInstanceOf(InMemoryCache);
  });

  it('동일한 전역 캐시 인스턴스를 반환한다 (싱글턴)', () => {
    const cache1 = getGlobalCache();
    const cache2 = getGlobalCache();

    expect(cache1).toBe(cache2);
  });

  it('리셋 후 새로운 인스턴스를 반환한다', () => {
    const cache1 = getGlobalCache();
    cache1.set('before-reset', 'data');

    resetGlobalCache();

    const cache2 = getGlobalCache();
    expect(cache2).not.toBe(cache1);
    expect(cache2.get('before-reset').hit).toBe(false);
  });
});
