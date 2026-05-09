/**
 * 뉴스 API 컨트롤러
 *
 * GET /news - 뉴스 목록 (커서 기반 페이지네이션)
 * GET /news/ticker - 티커용 최신 뉴스
 */

import { Controller, Get, Query } from '@nestjs/common';

import { NewsService } from './news.service';

@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  /**
   * 뉴스 목록을 조회한다.
   *
   * @param limit 조회할 뉴스 수 (기본 20)
   * @param cursor 페이지네이션 커서
   */
  @Get()
  async getNewsList(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const parsedLimit = Math.min(parseInt(limit ?? '20', 10) || 20, 50);

    const result = await this.newsService.getNewsList(parsedLimit, cursor);

    return {
      success: true,
      data: result.items,
      nextCursor: result.nextCursor,
    };
  }

  /**
   * 티커용 최신 뉴스를 조회한다.
   *
   * @param limit 조회할 뉴스 수 (기본 10)
   */
  @Get('ticker')
  async getTickerNews(@Query('limit') limit?: string) {
    const parsedLimit = Math.min(parseInt(limit ?? '10', 10) || 10, 20);

    const items = await this.newsService.getTickerNews(parsedLimit);

    return {
      success: true,
      data: items,
    };
  }
}
