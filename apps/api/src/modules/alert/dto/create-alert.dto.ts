/**
 * 알림 생성 DTO
 *
 * 사용자가 가격 알림 또는 김치 프리미엄 알림을 생성할 때
 * 전송하는 데이터를 검증한다.
 */

import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsIn,
  Matches,
  Min,
} from 'class-validator';

/** 알림 생성 요청 DTO */
export class CreateAlertDto {
  /** 사용자 지갑 주소 (0x로 시작하는 42자 이더리움 주소) */
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/, {
    message: 'walletAddress는 유효한 이더리움 지갑 주소여야 합니다.',
  })
  walletAddress!: string;

  /** 코인 심볼 (예: "BTC", "ETH") */
  @IsString()
  symbol!: string;

  /** 대상 거래소 (null이면 모든 거래소) */
  @IsOptional()
  @IsString()
  @IsIn(['upbit', 'bithumb', 'coinone', 'binance', 'bybit', 'okx', 'gate', 'bitget'], {
    message: 'exchange는 upbit, bithumb, coinone, binance, bybit, okx, gate, bitget 중 하나여야 합니다.',
  })
  exchange?: string;

  /** 알림 조건 (above, below, premium_above, premium_below) */
  @IsString()
  @IsIn(['above', 'below', 'premium_above', 'premium_below'], {
    message: 'condition은 above, below, premium_above, premium_below 중 하나여야 합니다.',
  })
  condition!: string;

  /** 목표 가격 또는 프리미엄 비율 (%) */
  @IsNumber()
  @Min(0, { message: 'targetValue는 0 이상이어야 합니다.' })
  targetValue!: number;

  /** 활성 상태 여부 (기본값: true) */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
