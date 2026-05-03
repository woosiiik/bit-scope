/**
 * 알림 조회 쿼리 파라미터 DTO
 *
 * 알림 목록 및 알림 이력 조회 시 사용하는 쿼리 파라미터를 검증한다.
 */

import {
  IsOptional,
  IsString,
  IsIn,
  IsNumberString,
  IsBooleanString,
} from 'class-validator';

/** 알림 목록 조회 쿼리 파라미터 DTO */
export class QueryAlertDto {
  /** 활성 상태 필터 ('true' 또는 'false') */
  @IsOptional()
  @IsBooleanString({ message: 'isActive는 true 또는 false여야 합니다.' })
  isActive?: string;

  /** 코인 심볼 필터 */
  @IsOptional()
  @IsString()
  symbol?: string;
}

/** 알림 이력 조회 쿼리 파라미터 DTO */
export class QueryAlertHistoryDto {
  /** 조회할 최대 이력 수 (기본값: 50) */
  @IsOptional()
  @IsNumberString({}, { message: 'limit은 숫자여야 합니다.' })
  limit?: string;
}
