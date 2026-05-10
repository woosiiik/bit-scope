/**
 * 뉴스 수집/요약 Cron 서비스
 *
 * 주기적으로 RSS를 수집하고, 대기 중인 기사를 Claude로 요약하며,
 * 오래된 기사를 자동 삭제한다.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { RssFetcherService } from './services/rss-fetcher.service';
import { TelegramChannelFetcherService } from './services/telegram-channel-fetcher.service';
import { NewsSummaryService } from './services/news-summary.service';
import { NewsService } from './news.service';

/** RSS 수집 간격 (밀리초) - 기본 10분 */
const FETCH_INTERVAL_MS = parseInt(process.env.NEWS_FETCH_INTERVAL_MS ?? '600000', 10);

/** 요약 처리 간격 (밀리초) - 기본 2분 */
const SUMMARY_INTERVAL_MS = parseInt(process.env.NEWS_SUMMARY_INTERVAL_MS ?? '120000', 10);

/** 오래된 뉴스 삭제 간격 (밀리초) - 24시간 */
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class NewsCronService {
  private readonly logger = new Logger(NewsCronService.name);

  constructor(
    private readonly rssFetcher: RssFetcherService,
    private readonly telegramFetcher: TelegramChannelFetcherService,
    private readonly summaryService: NewsSummaryService,
    private readonly newsService: NewsService,
  ) {}

  /**
   * RSS 수집 cron - 10분 간격
   */
  @Interval('news-fetch', FETCH_INTERVAL_MS)
  async handleFetch(): Promise<void> {
    this.logger.log('RSS 뉴스 수집 시작');

    try {
      const items = await this.rssFetcher.fetchAll();
      let savedCount = 0;

      for (const item of items) {
        const saved = await this.newsService.saveArticle(item);
        if (saved) savedCount++;
      }

      this.logger.log(`RSS 수집 완료 - 수집: ${items.length}건, 신규 저장: ${savedCount}건`);
    } catch (error) {
      this.logger.error(
        `RSS 수집 오류: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // 텔레그램 채널 수집
    try {
      const tgItems = await this.telegramFetcher.fetchAll();
      let tgSavedCount = 0;

      for (const item of tgItems) {
        const saved = await this.newsService.saveArticle(item);
        if (saved) tgSavedCount++;
      }

      if (tgSavedCount > 0) {
        this.logger.log(`텔레그램 수집 완료 - 수집: ${tgItems.length}건, 신규 저장: ${tgSavedCount}건`);
      }
    } catch (error) {
      this.logger.error(
        `텔레그램 수집 오류: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * AI 요약 cron - 2분 간격
   * 대기 중인 기사를 순차적으로 요약한다 (API rate limit 고려).
   */
  @Interval('news-summary', SUMMARY_INTERVAL_MS)
  async handleSummary(): Promise<void> {
    if (!this.summaryService.isEnabled()) return;

    try {
      const pending = await this.newsService.getPendingArticles(5);
      if (pending.length === 0) return;

      this.logger.log(`AI 요약 처리 시작: ${pending.length}건`);

      for (const article of pending) {
        try {
          const result = await this.summaryService.summarize(
            article.titleEn,
            article.contentEn ?? '',
          );

          if (result) {
            await this.newsService.updateSummary(article.id, result.titleKo, result.summaryKo);
            this.logger.debug(`요약 완료: ${article.titleEn.slice(0, 50)}...`);
          } else {
            await this.newsService.markSummaryFailed(article.id);
          }
        } catch (error) {
          await this.newsService.markSummaryFailed(article.id);
          this.logger.warn(
            `요약 실패 - ${article.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `AI 요약 오류: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 오래된 뉴스 자동 삭제 - 24시간 간격
   */
  @Interval('news-cleanup', CLEANUP_INTERVAL_MS)
  async handleCleanup(): Promise<void> {
    try {
      const deleted = await this.newsService.deleteOldArticles(30);
      if (deleted > 0) {
        this.logger.log(`오래된 뉴스 삭제: ${deleted}건`);
      }
    } catch (error) {
      this.logger.error(
        `뉴스 정리 오류: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
