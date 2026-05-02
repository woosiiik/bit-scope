/**
 * 스냅샷 조회 쿼리 파라미터 DTO
 *
 * 기간별 스냅샷 조회, 집계 조회 등에 사용하는
 * 쿼리 파라미터를 검증한다.
 */

import {
  IsOptional,
  IsDateString,
  IsIn,
  IsNumberString,
} from 'class-validator';

/** 기간별 스냅샷 조회 쿼리 파라미터 */
export class QuerySnapshotDto {
  /** 조회 시작 시각 (ISO 8601) */
  @IsOptional()
  @IsDateString({}, { message: 'start는 유효한 ISO 8601 날짜 형식이어야 합니다.' })
  start?: string;

  /** 조회 종료 시각 (ISO 8601) */
  @IsOptional()
  @IsDateString({}, { message: 'end는 유효한 ISO 8601 날짜 형식이어야 합니다.' })
  end?: string;

  /** 집계 간격 (시계열 분석용) */
  @IsOptional()
  @IsIn(['hourly', 'daily', 'weekly', 'monthly'], {
    message: 'interval은 hourly, daily, weekly, monthly 중 하나여야 합니다.',
  })
  interval?: string;

  /** 조회 결과 제한 (최대 개수) */
  @IsOptional()
  @IsNumberString({}, { message: 'limit은 숫자여야 합니다.' })
  limit?: string;
}
