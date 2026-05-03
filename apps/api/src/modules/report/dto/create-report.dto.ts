/**
 * 리포트 생성 DTO
 *
 * 사용자가 수동으로 리포트를 생성 요청할 때
 * 전송하는 데이터를 검증한다.
 */

import {
  IsString,
  IsOptional,
  IsIn,
  IsDateString,
  Matches,
} from 'class-validator';

/** 리포트 생성 요청 DTO */
export class CreateReportDto {
  /** 사용자 지갑 주소 (0x로 시작하는 42자 이더리움 주소) */
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/, {
    message: 'walletAddress는 유효한 이더리움 지갑 주소여야 합니다.',
  })
  walletAddress!: string;

  /** 리포트 유형 (daily, weekly, monthly, custom) */
  @IsString()
  @IsIn(['daily', 'weekly', 'monthly', 'custom'], {
    message: 'type은 daily, weekly, monthly, custom 중 하나여야 합니다.',
  })
  type!: string;

  /** 리포트 기간 시작 (ISO 8601, custom 유형 시 필수) */
  @IsOptional()
  @IsDateString(
    {},
    { message: 'periodStart는 유효한 ISO 8601 날짜 형식이어야 합니다.' },
  )
  periodStart?: string;

  /** 리포트 기간 종료 (ISO 8601, custom 유형 시 필수) */
  @IsOptional()
  @IsDateString(
    {},
    { message: 'periodEnd는 유효한 ISO 8601 날짜 형식이어야 합니다.' },
  )
  periodEnd?: string;
}
