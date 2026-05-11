/**
 * 수동 캘린더 이벤트 엔티티
 *
 * DB에 직접 INSERT하여 경제 캘린더에 커스텀 이벤트를 추가한다.
 * Forex Factory 자동 수집 이벤트와 합쳐져서 캘린더에 표시된다.
 *
 * INSERT 예시:
 *   INSERT INTO custom_calendar_event (title, title_ko, date, time, importance, category, country)
 *   VALUES ('Bitcoin Halving', '비트코인 반감기', '2028-04-15', '00:00', 'high', 'crypto', 'GLOBAL');
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('custom_calendar_event')
export class CustomCalendarEventEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  /** 이벤트 제목 (영문) */
  @Column({ type: 'varchar', length: 200 })
  title!: string;

  /** 이벤트 제목 (한국어) */
  @Column({ name: 'title_ko', type: 'varchar', length: 200 })
  titleKo!: string;

  /** 이벤트 날짜 (YYYY-MM-DD) */
  @Column({ type: 'varchar', length: 10 })
  date!: string;

  /** 이벤트 시간 (HH:MM, nullable) */
  @Column({ type: 'varchar', length: 5, nullable: true })
  time?: string;

  /** 중요도 */
  @Column({ type: 'varchar', length: 10, default: 'medium' })
  importance!: string;

  /** 카테고리 (fomc, cpi, employment, gdp, crypto, consumer, pmi, other) */
  @Column({ type: 'varchar', length: 20, default: 'other' })
  category!: string;

  /** 국가/통화 코드 (USD, KRW, GLOBAL 등) */
  @Column({ type: 'varchar', length: 10, default: 'GLOBAL' })
  country!: string;

  /** 예측값 (선택) */
  @Column({ type: 'varchar', length: 50, nullable: true })
  forecast?: string;

  /** 이전값 (선택) */
  @Column({ type: 'varchar', length: 50, nullable: true })
  previous?: string;

  /** 활성 상태 (false면 캘린더에 미표시) */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
