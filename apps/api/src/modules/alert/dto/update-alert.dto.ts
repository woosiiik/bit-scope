/**
 * 알림 수정 DTO
 *
 * 기존 알림 설정을 부분적으로 수정할 때 사용한다.
 * 모든 필드가 선택적(optional)이다.
 */

import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsIn,
  Min,
} from 'class-validator';

/** 알림 수정 요청 DTO */
export class UpdateAlertDto {
  /** 코인 심볼 (예: "BTC", "ETH") */
  @IsOptional()
  @IsString()
  symbol?: string;

  /** 대상 거래소 (null이면 모든 거래소) */
  @IsOptional()
  @IsString()
  @IsIn(['upbit', 'bithumb', 'coinone'], {
    message: 'exchange는 upbit, bithumb, coinone 중 하나여야 합니다.',
  })
  exchange?: string | null;

  /** 알림 조건 (above, below, premium_above, premium_below) */
  @IsOptional()
  @IsString()
  @IsIn(['above', 'below', 'premium_above', 'premium_below'], {
    message: 'condition은 above, below, premium_above, premium_below 중 하나여야 합니다.',
  })
  condition?: string;

  /** 목표 가격 또는 프리미엄 비율 (%) */
  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'targetValue는 0 이상이어야 합니다.' })
  targetValue?: number;

  /** 활성 상태 여부 */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
