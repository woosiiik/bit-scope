/**
 * 정기 리포트 스케줄 생성 DTO
 *
 * 사용자가 일간/주간/월간 정기 리포트 스케줄을 설정할 때
 * 전송하는 데이터를 검증한다.
 */

import {
  IsString,
  IsOptional,
  IsBoolean,
  IsIn,
  Matches,
} from 'class-validator';

/** 정기 리포트 스케줄 생성 요청 DTO */
export class CreateScheduleDto {
  /** 사용자 지갑 주소 (0x로 시작하는 42자 이더리움 주소) */
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/, {
    message: 'walletAddress는 유효한 이더리움 지갑 주소여야 합니다.',
  })
  walletAddress!: string;

  /** 리포트 유형 (daily, weekly, monthly) */
  @IsString()
  @IsIn(['daily', 'weekly', 'monthly'], {
    message: 'type은 daily, weekly, monthly 중 하나여야 합니다.',
  })
  type!: string;

  /** 활성 상태 여부 (기본값: true) */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
