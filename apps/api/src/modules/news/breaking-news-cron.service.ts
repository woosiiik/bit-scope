/**
 * 속보 수집 Cron 서비스
 *
 * 1분 간격으로 속보 소스에서 최신 메시지를 수집한다.
 * 기존 뉴스 cron과 독립적으로 운영된다.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { BreakingNewsTelegramSource } from './services/breaking-news-telegram.source';
import { NewsService } from './news.service';

/** 속보 수집 간격 (밀리초) - 기본 1분 */
const BREAKING_FETCH_INTERVAL_MS = parseInt(
  process.env.BREAKING_FETCH_INTERVAL_MS ?? '60000',
  10,
);

@Injectable()
export class BreakingNewsCronService {
  private readonly logger = new Logger(BreakingNewsCronService.name);
  private consecutiveFailures = 0;

  constructor(
    private readonly breakingSource: BreakingNewsTelegramSource,
    private readonly newsService: NewsService,
  ) {}

  @Interval('breaking-news-fetch', BREAKING_FETCH_INTERVAL_MS)
  async handleFetch(): Promise<void> {
    try {
      const items = await this.breakingSource.fetch();
      this.consecutiveFailures = 0;

      let savedCount = 0;
      for (const item of items) {
        const saved = await this.newsService.saveArticle(item);
        if (saved) savedCount++;
      }

      if (savedCount > 0) {
        this.logger.log(
          `속보 수집 완료 - 수집: ${items.length}건, 신규: ${savedCount}건`,
        );
      }
    } catch (error) {
      this.consecutiveFailures++;
      const msg = error instanceof Error ? error.message : String(error);

      if (this.consecutiveFailures >= 3) {
        this.logger.warn(
          `속보 수집 연속 ${this.consecutiveFailures}회 실패: ${msg}`,
        );
      } else {
        this.logger.error(`속보 수집 실패: ${msg}`);
      }
    }
  }
}
