/**
 * 뉴스 모듈
 *
 * 크립토 뉴스 RSS 수집, Claude AI 요약, REST API를 제공한다.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { NewsArticleEntity } from './entities/news-article.entity';
import { NewsService } from './news.service';
import { NewsController } from './news.controller';
import { RssFetcherService } from './services/rss-fetcher.service';
import { TelegramChannelFetcherService } from './services/telegram-channel-fetcher.service';
import { NewsSummaryService } from './services/news-summary.service';
import { NewsCronService } from './news-cron.service';
import { BreakingNewsTelegramSource } from './services/breaking-news-telegram.source';
import { BreakingNewsCronService } from './breaking-news-cron.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([NewsArticleEntity]),
    ScheduleModule.forRoot(),
  ],
  controllers: [NewsController],
  providers: [
    NewsService,
    RssFetcherService,
    TelegramChannelFetcherService,
    NewsSummaryService,
    NewsCronService,
    BreakingNewsTelegramSource,
    BreakingNewsCronService,
  ],
  exports: [NewsService],
})
export class NewsModule {}
