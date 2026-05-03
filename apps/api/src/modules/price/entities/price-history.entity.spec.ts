/**
 * PriceHistoryEntity 단위 테스트
 *
 * 엔티티 인스턴스 생성 및 기본 속성을 검증한다.
 */

import { PriceHistoryEntity } from './price-history.entity';

describe('PriceHistoryEntity', () => {
  it('인스턴스를 생성할 수 있어야 한다', () => {
    const entity = new PriceHistoryEntity();
    expect(entity).toBeDefined();
    expect(entity).toBeInstanceOf(PriceHistoryEntity);
  });

  it('모든 속성을 설정할 수 있어야 한다', () => {
    const entity = new PriceHistoryEntity();
    entity.id = 'price-uuid';
    entity.symbol = 'BTC';
    entity.exchange = 'upbit';
    entity.price = 100000000;
    entity.volume24h = 1234.5678;
    entity.recordedAt = new Date('2026-01-01T12:00:00Z');

    expect(entity.symbol).toBe('BTC');
    expect(entity.exchange).toBe('upbit');
    expect(entity.price).toBe(100000000);
    expect(entity.volume24h).toBe(1234.5678);
  });

  it('유효한 거래소 값을 저장할 수 있어야 한다', () => {
    const exchanges = ['upbit', 'bithumb', 'coinone', 'binance', 'bybit', 'okx', 'gate', 'bitget'];

    exchanges.forEach((exchange) => {
      const entity = new PriceHistoryEntity();
      entity.exchange = exchange;
      expect(entity.exchange).toBe(exchange);
    });
  });

  it('매우 작은 가격도 저장할 수 있어야 한다 (소수점 코인)', () => {
    const entity = new PriceHistoryEntity();
    entity.symbol = 'SHIB';
    entity.price = 0.0123;

    expect(entity.price).toBe(0.0123);
  });
});
