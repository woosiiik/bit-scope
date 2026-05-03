/**
 * 리포트 조회 쿼리 파라미터 DTO
 *
 * 리포트 이력 조회 및 데이터 내보내기 시 사용하는
 * 쿼리 파라미터를 검증한다.
 */

import {
  IsOptional,
  IsString,
  IsIn,
  IsNumberString,
  IsDateString,
} from 'class-validator';

/** 리포트 이력 조회 쿼리 파라미터 DTO */
export class QueryReportDto {
  /** 리포트 유형 필터 */
  @IsOptional()
  @IsString()
  @IsIn(['daily', 'weekly', 'monthly', 'custom'], {
    message: 'type은 daily, weekly, monthly, custom 중 하나여야 합니다.',
  })
  type?: string;

  /** 조회할 최대 개수 (기본값: 20) */
  @IsOptional()
  @IsNumberString({}, { message: 'limit은 숫자여야 합니다.' })
  limit?: string;
}

/** 데이터 내보내기 쿼리 파라미터 DTO */
export class ExportDataDto {
  /** 내보내기 포맷 (csv, json, pdf) */
  @IsString()
  @IsIn(['csv', 'json', 'pdf'], {
    message: 'format은 csv, json, pdf 중 하나여야 합니다.',
  })
  format!: string;

  /** 시작 기간 (ISO 8601) */
  @IsOptional()
  @IsDateString(
    {},
    { message: 'start는 유효한 ISO 8601 날짜 형식이어야 합니다.' },
  )
  start?: string;

  /** 종료 기간 (ISO 8601) */
  @IsOptional()
  @IsDateString(
    {},
    { message: 'end는 유효한 ISO 8601 날짜 형식이어야 합니다.' },
  )
  end?: string;
}
