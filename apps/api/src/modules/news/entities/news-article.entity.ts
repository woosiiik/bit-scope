/**
 * 뉴스 기사 엔티티
 *
 * RSS로 수집한 크립토 뉴스 기사를 저장한다.
 * Claude Haiku API로 생성된 한글 요약과 영어 원문을 함께 보관한다.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/** 요약 처리 상태 */
export type SummaryStatus = 'pending' | 'completed' | 'failed';

@Entity('news_article')
export class NewsArticleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** 뉴스 소스 (coindesk, cointelegraph, theblock) */
  @Column({ type: 'varchar', length: 50 })
  @Index('idx_news_source')
  source!: string;

  /** 영어 원문 제목 */
  @Column({ name: 'title_en', type: 'varchar', length: 500 })
  titleEn!: string;

  /** 영어 원문 본문 (HTML 태그 제거된 텍스트) */
  @Column({ name: 'content_en', type: 'text', nullable: true })
  contentEn!: string | null;

  /** 한글 요약 번역 (3~5문장) */
  @Column({ name: 'summary_ko', type: 'text', nullable: true })
  summaryKo!: string | null;

  /** 한글 제목 번역 */
  @Column({ name: 'title_ko', type: 'varchar', length: 500, nullable: true })
  titleKo!: string | null;

  /** 원문 URL (중복 방지용 unique) */
  @Column({ name: 'original_url', type: 'varchar', length: 768, unique: true })
  originalUrl!: string;

  /** 기사 발행 시간 */
  @Column({ name: 'published_at', type: 'timestamp' })
  @Index('idx_news_published_at')
  publishedAt!: Date;

  /** AI 요약 처리 상태 */
  @Column({ name: 'summary_status', type: 'varchar', length: 20, default: 'pending' })
  summaryStatus!: SummaryStatus;

  /** DB 저장 시간 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
