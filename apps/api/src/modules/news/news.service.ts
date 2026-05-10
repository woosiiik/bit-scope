/**
 * 뉴스 서비스 - CRUD 및 비즈니스 로직
 *
 * 뉴스 기사의 저장, 조회, 삭제 및 페이지네이션을 담당한다.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';

import { NewsArticleEntity, type SummaryStatus } from './entities/news-article.entity';

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);

  constructor(
    @InjectRepository(NewsArticleEntity)
    private readonly newsRepository: Repository<NewsArticleEntity>,
  ) {}

  /**
   * 뉴스 기사를 저장한다 (중복 URL은 무시).
   */
  async saveArticle(data: {
    source: string;
    titleEn: string;
    contentEn: string | null;
    originalUrl: string;
    publishedAt: Date;
    thumbnailUrl?: string | null;
  }): Promise<NewsArticleEntity | null> {
    // 중복 체크
    const exists = await this.newsRepository.findOne({
      where: { originalUrl: data.originalUrl },
    });
    if (exists) return null;

    const article = this.newsRepository.create({
      ...data,
      summaryStatus: 'pending' as SummaryStatus,
    });

    return this.newsRepository.save(article);
  }

  /**
   * 요약이 필요한 기사 목록을 조회한다.
   */
  async getPendingArticles(limit: number = 10): Promise<NewsArticleEntity[]> {
    return this.newsRepository.find({
      where: { summaryStatus: 'pending' as SummaryStatus },
      order: { publishedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * 기사의 요약 정보를 업데이트한다.
   */
  async updateSummary(
    id: string,
    titleKo: string,
    summaryKo: string,
  ): Promise<void> {
    await this.newsRepository.update(id, {
      titleKo,
      summaryKo,
      summaryStatus: 'completed' as SummaryStatus,
    });
  }

  /**
   * 기사의 요약 상태를 실패로 표시한다.
   */
  async markSummaryFailed(id: string): Promise<void> {
    await this.newsRepository.update(id, {
      summaryStatus: 'failed' as SummaryStatus,
    });
  }

  /**
   * 티커용 최신 뉴스를 조회한다 (요약 완료 우선, 없으면 전체).
   */
  async getTickerNews(limit: number = 10): Promise<NewsArticleEntity[]> {
    // 요약 완료된 뉴스 우선
    const completed = await this.newsRepository.find({
      where: { summaryStatus: 'completed' as SummaryStatus },
      order: { publishedAt: 'DESC' },
      take: limit,
    });

    if (completed.length >= limit) return completed;

    // 부족하면 전체에서 채움 (API Key 미설정 시 영어 원문으로 표시)
    return this.newsRepository.find({
      order: { publishedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * 뉴스 목록을 커서 기반 페이지네이션으로 조회한다.
   */
  async getNewsList(limit: number = 20, cursor?: string, sourceType?: 'news' | 'youtube' | 'telegram'): Promise<{
    items: NewsArticleEntity[];
    nextCursor: string | null;
  }> {
    const queryBuilder = this.newsRepository
      .createQueryBuilder('news');

    // 소스 타입 필터
    if (sourceType === 'youtube') {
      queryBuilder.where('news.source LIKE :prefix', { prefix: 'yt-%' });
    } else if (sourceType === 'telegram') {
      queryBuilder.where('news.source LIKE :prefix', { prefix: 'tg-%' });
    } else if (sourceType === 'news') {
      queryBuilder.where('news.source NOT LIKE :ytPrefix AND news.source NOT LIKE :tgPrefix', { ytPrefix: 'yt-%', tgPrefix: 'tg-%' });
    }

    queryBuilder.orderBy('news.publishedAt', 'DESC')
      .addOrderBy('news.id', 'DESC')
      .take(limit + 1);

    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
        queryBuilder.andWhere(
          '(news.publishedAt < :publishedAt OR (news.publishedAt = :publishedAt AND news.id < :id))',
          { publishedAt: decoded.publishedAt, id: decoded.id },
        );
      } catch {
        // 잘못된 커서는 무시
      }
    }

    const items = await queryBuilder.getMany();

    let nextCursor: string | null = null;
    if (items.length > limit) {
      items.pop();
      const lastItem = items[items.length - 1]!;
      nextCursor = Buffer.from(
        JSON.stringify({ publishedAt: lastItem.publishedAt, id: lastItem.id }),
      ).toString('base64');
    }

    return { items, nextCursor };
  }

  /**
   * 지정된 일수보다 오래된 뉴스를 삭제한다.
   */
  async deleteOldArticles(days: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await this.newsRepository.delete({
      publishedAt: LessThan(cutoffDate),
    });

    return result.affected ?? 0;
  }
}
