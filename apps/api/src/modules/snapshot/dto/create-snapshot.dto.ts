/**
 * 포트폴리오 스냅샷 생성 DTO
 *
 * 클라이언트가 대시보드 접속 시 전송하는 포트폴리오 스냅샷 데이터를
 * 검증하기 위한 DTO이다.
 */

import {
  IsString,
  IsNumber,
  IsArray,
  ValidateNested,
  Matches,
  IsIn,
  ArrayMaxSize,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/** 스냅샷 내 개별 코인 보유 내역 DTO */
export class CreateSnapshotHoldingDto {
  /** 코인 심볼 (예: "BTC", "ETH") */
  @IsString()
  symbol!: string;

  /** 거래소 식별자 */
  @IsString()
  @IsIn(['upbit', 'bithumb', 'coinone', 'binance', 'bybit', 'okx', 'gate', 'bitget', 'hyperliquid'])
  exchange!: string;

  /** 보유 수량 */
  @IsNumber()
  @Min(0)
  balance!: number;

  /** 매수 평균가 */
  @IsNumber()
  @Min(0)
  avgBuyPrice!: number;

  /** 현재가 */
  @IsNumber()
  @Min(0)
  currentPrice!: number;

  /** 평가금액 (KRW) */
  @IsNumber()
  @Min(0)
  evaluation!: number;
}

/** 포트폴리오 스냅샷 생성 요청 DTO */
export class CreateSnapshotDto {
  /** 사용자 지갑 주소 (0x로 시작하는 42자 이더리움 주소) */
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/, {
    message: 'walletAddress는 유효한 이더리움 지갑 주소여야 합니다.',
  })
  walletAddress!: string;

  /** 총 평가금액 (KRW) */
  @IsNumber()
  @Min(0)
  totalEvaluation!: number;

  /** 총 투자금액 (KRW) */
  @IsNumber()
  @Min(0)
  totalInvestment!: number;

  /** 총 손익 (KRW) */
  @IsNumber()
  totalProfitLoss!: number;

  /** 수익률 (%) */
  @IsNumber()
  profitLossRate!: number;

  /** 보유 코인 상세 목록 */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSnapshotHoldingDto)
  @ArrayMaxSize(500, { message: '보유 코인 목록은 최대 500개까지 지원합니다.' })
  holdings!: CreateSnapshotHoldingDto[];
}
