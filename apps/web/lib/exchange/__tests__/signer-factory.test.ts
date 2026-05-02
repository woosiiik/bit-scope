/**
 * ExchangeSignerFactory 단위 테스트
 *
 * 팩토리가 ExchangeType에 따라 올바른 Signer 인스턴스를 반환하는지,
 * 지원하지 않는 거래소에 대해 적절한 오류를 발생시키는지,
 * 각 Signer가 ExchangeSigner 인터페이스를 올바르게 구현하는지를 검증한다.
 *
 * @see 요구사항 NF2.1 (거래소 어댑터 패턴)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createSigner,
  getAllSigners,
  isSupportedExchange,
} from '../signer-factory';
import type { ExchangeSigner } from '../signer-factory';
import type { ApiKeyPair, ExchangeType, SignRequestParams } from '@bitscope/shared';
import { SUPPORTED_EXCHANGES } from '@bitscope/shared';

/** 테스트용 API Key */
const TEST_API_KEY: ApiKeyPair = {
  accessKey: 'test-access-key-1234567890',
  secretKey: 'test-secret-key-abcdefghij',
};

describe('ExchangeSignerFactory', () => {
  describe('createSigner', () => {
    it('업비트 ExchangeType에 대해 업비트 서명기를 반환한다', () => {
      const signer = createSigner('upbit');

      expect(signer).toBeDefined();
      expect(signer.getExchangeType()).toBe('upbit');
    });

    it('빗썸 ExchangeType에 대해 빗썸 서명기를 반환한다', () => {
      const signer = createSigner('bithumb');

      expect(signer).toBeDefined();
      expect(signer.getExchangeType()).toBe('bithumb');
    });

    it('코인원 ExchangeType에 대해 코인원 서명기를 반환한다', () => {
      const signer = createSigner('coinone');

      expect(signer).toBeDefined();
      expect(signer.getExchangeType()).toBe('coinone');
    });

    it('지원하지 않는 거래소 타입에 대해 오류를 발생시킨다', () => {
      expect(() => {
        createSigner('binance' as ExchangeType);
      }).toThrow('지원하지 않는 거래소입니다: binance');
    });

    it('지원하지 않는 거래소 타입 오류 메시지에 지원 거래소 목록을 포함한다', () => {
      expect(() => {
        createSigner('kraken' as ExchangeType);
      }).toThrow('upbit, bithumb, coinone');
    });

    it('모든 지원 거래소에 대해 서명기를 반환한다', () => {
      for (const exchange of SUPPORTED_EXCHANGES) {
        const signer = createSigner(exchange);
        expect(signer).toBeDefined();
        expect(signer.getExchangeType()).toBe(exchange);
      }
    });

    it('동일한 거래소에 대해 호출하면 동일한 서명기 인스턴스를 반환한다', () => {
      const signer1 = createSigner('upbit');
      const signer2 = createSigner('upbit');

      expect(signer1).toBe(signer2);
    });
  });

  describe('ExchangeSigner 인터페이스 준수', () => {
    it.each<ExchangeType>(['upbit', 'bithumb', 'coinone'])(
      '%s 서명기가 signRequest 메서드를 가지고 있다',
      (exchange) => {
        const signer = createSigner(exchange);
        expect(typeof signer.signRequest).toBe('function');
      }
    );

    it.each<ExchangeType>(['upbit', 'bithumb', 'coinone'])(
      '%s 서명기가 validateApiKey 메서드를 가지고 있다',
      (exchange) => {
        const signer = createSigner(exchange);
        expect(typeof signer.validateApiKey).toBe('function');
      }
    );

    it.each<ExchangeType>(['upbit', 'bithumb', 'coinone'])(
      '%s 서명기가 getExchangeType 메서드를 가지고 있다',
      (exchange) => {
        const signer = createSigner(exchange);
        expect(typeof signer.getExchangeType).toBe('function');
      }
    );
  });

  describe('서명기 signRequest 동작 검증', () => {
    it('업비트 서명기가 올바른 서명된 요청을 생성한다', () => {
      const signer = createSigner('upbit');
      const params: SignRequestParams = {
        method: 'GET',
        endpoint: '/accounts',
        apiKey: TEST_API_KEY,
      };

      const signedRequest = signer.signRequest(params);

      expect(signedRequest).toBeDefined();
      expect(signedRequest.url).toContain('api.upbit.com');
      expect(signedRequest.method).toBe('GET');
      expect(signedRequest.headers).toBeDefined();
      expect(signedRequest.headers['Authorization']).toMatch(/^Bearer /);
    });

    it('빗썸 서명기가 올바른 서명된 요청을 생성한다', () => {
      const signer = createSigner('bithumb');
      const params: SignRequestParams = {
        method: 'POST',
        endpoint: '/info/balance',
        body: { order_currency: 'BTC', payment_currency: 'KRW' },
        apiKey: TEST_API_KEY,
      };

      const signedRequest = signer.signRequest(params);

      expect(signedRequest).toBeDefined();
      expect(signedRequest.url).toContain('api.bithumb.com');
      expect(signedRequest.method).toBe('POST');
      expect(signedRequest.headers).toBeDefined();
      expect(signedRequest.headers['Api-Key']).toBe(TEST_API_KEY.accessKey);
      expect(signedRequest.headers['Api-Sign']).toBeDefined();
      expect(signedRequest.headers['Api-Nonce']).toBeDefined();
      expect(signedRequest.headers['Api-Timestamp']).toBeDefined();
    });

    it('코인원 서명기가 올바른 서명된 요청을 생성한다', () => {
      const signer = createSigner('coinone');
      const params: SignRequestParams = {
        method: 'POST',
        endpoint: '/v2.1/account/balance/all',
        apiKey: TEST_API_KEY,
      };

      const signedRequest = signer.signRequest(params);

      expect(signedRequest).toBeDefined();
      expect(signedRequest.url).toContain('api.coinone.co.kr');
      expect(signedRequest.method).toBe('POST');
      expect(signedRequest.headers).toBeDefined();
      expect(signedRequest.headers['X-COINONE-PAYLOAD']).toBeDefined();
      expect(signedRequest.headers['X-COINONE-SIGNATURE']).toBeDefined();
    });

    it('API Key가 없으면 모든 서명기에서 오류를 발생시킨다', () => {
      const emptyApiKey: ApiKeyPair = { accessKey: '', secretKey: '' };

      for (const exchange of SUPPORTED_EXCHANGES) {
        const signer = createSigner(exchange);
        expect(() => {
          signer.signRequest({
            method: 'GET',
            endpoint: '/test',
            apiKey: emptyApiKey,
          });
        }).toThrow();
      }
    });
  });

  describe('getAllSigners', () => {
    it('지원하는 모든 거래소의 서명기를 반환한다', () => {
      const signers = getAllSigners();

      expect(signers).toHaveLength(SUPPORTED_EXCHANGES.length);
    });

    it('반환된 서명기가 모든 지원 거래소를 포함한다', () => {
      const signers = getAllSigners();
      const exchangeTypes = signers.map((signer) => signer.getExchangeType());

      for (const exchange of SUPPORTED_EXCHANGES) {
        expect(exchangeTypes).toContain(exchange);
      }
    });

    it('각 서명기가 ExchangeSigner 인터페이스를 준수한다', () => {
      const signers = getAllSigners();

      for (const signer of signers) {
        expect(typeof signer.signRequest).toBe('function');
        expect(typeof signer.validateApiKey).toBe('function');
        expect(typeof signer.getExchangeType).toBe('function');
      }
    });
  });

  describe('isSupportedExchange', () => {
    it('지원하는 거래소에 대해 true를 반환한다', () => {
      expect(isSupportedExchange('upbit')).toBe(true);
      expect(isSupportedExchange('bithumb')).toBe(true);
      expect(isSupportedExchange('coinone')).toBe(true);
    });

    it('지원하지 않는 거래소에 대해 false를 반환한다', () => {
      expect(isSupportedExchange('binance')).toBe(false);
      expect(isSupportedExchange('kraken')).toBe(false);
      expect(isSupportedExchange('')).toBe(false);
      expect(isSupportedExchange('UPBIT')).toBe(false);
    });

    it('타입 가드로서 ExchangeType 타입을 좁힐 수 있다', () => {
      const exchange: string = 'upbit';

      if (isSupportedExchange(exchange)) {
        // 이 블록에서 exchange는 ExchangeType으로 추론된다
        const signer = createSigner(exchange);
        expect(signer.getExchangeType()).toBe('upbit');
      }
    });
  });
});
