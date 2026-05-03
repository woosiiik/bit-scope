/**
 * CreateSnapshotDto 유효성 검증 테스트
 *
 * class-validator를 통한 DTO 검증 로직을 테스트한다.
 */

import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { CreateSnapshotDto, CreateSnapshotHoldingDto } from './create-snapshot.dto';

/** 유효한 스냅샷 DTO 데이터 생성 */
function createValidData(): Record<string, unknown> {
  return {
    walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
    totalEvaluation: 10000000,
    totalInvestment: 8000000,
    totalProfitLoss: 2000000,
    profitLossRate: 25.0,
    holdings: [
      {
        symbol: 'BTC',
        exchange: 'upbit',
        balance: 0.5,
        avgBuyPrice: 50000000,
        currentPrice: 55000000,
        evaluation: 27500000,
      },
    ],
  };
}

describe('CreateSnapshotDto', () => {
  it('유효한 데이터로 검증을 통과해야 한다', async () => {
    const dto = plainToInstance(CreateSnapshotDto, createValidData());
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('빈 holdings 배열도 검증을 통과해야 한다', async () => {
    const data = createValidData();
    data.holdings = [];
    const dto = plainToInstance(CreateSnapshotDto, data);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('잘못된 지갑 주소는 검증에 실패해야 한다', async () => {
    const data = createValidData();
    data.walletAddress = 'invalid-address';
    const dto = plainToInstance(CreateSnapshotDto, data);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);

    const walletError = errors.find((e) => e.property === 'walletAddress');
    expect(walletError).toBeDefined();
  });

  it('0x 접두사가 없는 지갑 주소는 검증에 실패해야 한다', async () => {
    const data = createValidData();
    data.walletAddress = '1234567890abcdef1234567890abcdef12345678';
    const dto = plainToInstance(CreateSnapshotDto, data);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('totalEvaluation이 누락되면 검증에 실패해야 한다', async () => {
    const data = createValidData();
    delete data.totalEvaluation;
    const dto = plainToInstance(CreateSnapshotDto, data);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('totalEvaluation이 음수이면 검증에 실패해야 한다', async () => {
    const data = createValidData();
    data.totalEvaluation = -1000;
    const dto = plainToInstance(CreateSnapshotDto, data);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('totalProfitLoss는 음수를 허용해야 한다 (손실)', async () => {
    const data = createValidData();
    data.totalProfitLoss = -500000;
    const dto = plainToInstance(CreateSnapshotDto, data);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('profitLossRate는 음수를 허용해야 한다 (손실률)', async () => {
    const data = createValidData();
    data.profitLossRate = -15.5;
    const dto = plainToInstance(CreateSnapshotDto, data);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});

describe('CreateSnapshotHoldingDto', () => {
  it('유효한 보유 코인 데이터로 검증을 통과해야 한다', async () => {
    const data = {
      symbol: 'BTC',
      exchange: 'upbit',
      balance: 0.5,
      avgBuyPrice: 50000000,
      currentPrice: 55000000,
      evaluation: 27500000,
    };
    const dto = plainToInstance(CreateSnapshotHoldingDto, data);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('지원하지 않는 거래소는 검증에 실패해야 한다', async () => {
    const data = {
      symbol: 'BTC',
      exchange: 'kraken',
      balance: 0.5,
      avgBuyPrice: 50000000,
      currentPrice: 55000000,
      evaluation: 27500000,
    };
    const dto = plainToInstance(CreateSnapshotHoldingDto, data);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);

    const exchangeError = errors.find((e) => e.property === 'exchange');
    expect(exchangeError).toBeDefined();
  });

  it('각 거래소(upbit, bithumb, coinone, binance, bybit, okx, gate, bitget) 값을 허용해야 한다', async () => {
    const exchanges = ['upbit', 'bithumb', 'coinone', 'binance', 'bybit', 'okx', 'gate', 'bitget'];

    for (const exchange of exchanges) {
      const data = {
        symbol: 'BTC',
        exchange,
        balance: 0.5,
        avgBuyPrice: 50000000,
        currentPrice: 55000000,
        evaluation: 27500000,
      };
      const dto = plainToInstance(CreateSnapshotHoldingDto, data);
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it('balance가 음수이면 검증에 실패해야 한다', async () => {
    const data = {
      symbol: 'BTC',
      exchange: 'upbit',
      balance: -1,
      avgBuyPrice: 50000000,
      currentPrice: 55000000,
      evaluation: 27500000,
    };
    const dto = plainToInstance(CreateSnapshotHoldingDto, data);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('symbol이 누락되면 검증에 실패해야 한다', async () => {
    const data = {
      exchange: 'upbit',
      balance: 0.5,
      avgBuyPrice: 50000000,
      currentPrice: 55000000,
      evaluation: 27500000,
    };
    const dto = plainToInstance(CreateSnapshotHoldingDto, data);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
