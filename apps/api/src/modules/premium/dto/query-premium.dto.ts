/**
 * 김치 프리미엄 이력 조회 DTO
 *
 * 프리미엄 이력 조회 시 쿼리 파라미터를 검증하는 DTO이다.
 */

import { IsString, IsOptional, IsIn } from 'class-validator';

/** 프리미엄 이력 조회 쿼리 파라미터 DTO */
export class QueryPremiumDto {
  /** 조회 기간 ('24h', '7d', '30d'), 기본값: '24h' */
  @IsOptional()
  @IsString()
  @IsIn(['24h', '7d', '30d'], {
    message: 'period는 24h, 7d, 30d 중 하나여야 합니다.',
  })
  period?: string;
}
