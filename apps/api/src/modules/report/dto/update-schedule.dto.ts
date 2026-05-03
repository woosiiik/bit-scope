/**
 * 정기 리포트 스케줄 수정 DTO
 *
 * 기존 스케줄을 부분적으로 수정할 때 사용한다.
 * 모든 필드가 선택적(optional)이다.
 */

import { IsOptional, IsBoolean, IsIn, IsString } from 'class-validator';

/** 정기 리포트 스케줄 수정 요청 DTO */
export class UpdateScheduleDto {
  /** 리포트 유형 (daily, weekly, monthly) */
  @IsOptional()
  @IsString()
  @IsIn(['daily', 'weekly', 'monthly'], {
    message: 'type은 daily, weekly, monthly 중 하나여야 합니다.',
  })
  type?: string;

  /** 활성 상태 여부 */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
