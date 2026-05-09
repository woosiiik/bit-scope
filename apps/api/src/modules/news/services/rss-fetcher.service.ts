/**
 * RSS 뉴스 수집 서비스
 *
 * CoinDesk, CoinTelegraph, The Block의 RSS 피드를 파싱하여
 * 새로운 뉴스 기사를 수집한다.
 */

import { Injectable, Logger } from '@nestjs/common';
import Parser from 'rss-parser';
import striptags from 'striptags';

/** RSS 소스 설정 */
interface RssSource {
  name: string;
  url: string;
}

/** 파싱된 뉴스 항목 */
export interface ParsedNewsItem {
  source: string;
  titleEn: string;
  contentEn: string;
  originalUrl: string;
  publishedAt: Date;
}

/** RSS 소스 목록 */
const RSS_SOURCES: RssSource[] = [
  { name: 'coindesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'cointelegraph', url: 'https://cointelegraph.com/rss' },
  { name: 'theblock', url: 'https://www.theblock.co/rss.xml' },
  { name: 'blockmedia', url: 'https://www.blockmedia.co.kr/feed' },
];

@Injectable()
export class RssFetcherService {
  private readonly logger = new Logger(RssFetcherService.name);
  private readonly parser: Parser;

  constructor() {
    this.parser = new Parser({
      timeout: 15_000,
      headers: {
        'User-Agent': 'BitScope/1.0 RSS Reader',
      },
    });
  }

  /**
   * 모든 RSS 소스에서 뉴스를 수집한다.
   * 각 소스는 독립적으로 처리되어 하나가 실패해도 나머지는 정상 수집된다.
   */
  async fetchAll(): Promise<ParsedNewsItem[]> {
    const results = await Promise.allSettled(
      RSS_SOURCES.map((source) => this.fetchSource(source)),
    );

    const items: ParsedNewsItem[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      const source = RSS_SOURCES[i]!;

      if (result.status === 'fulfilled') {
        items.push(...result.value);
        this.logger.log(`${source.name} RSS 수집 성공: ${result.value.length}건`);
      } else {
        this.logger.warn(`${source.name} RSS 수집 실패: ${result.reason}`);
      }
    }

    return items;
  }

  /**
   * 단일 RSS 소스에서 뉴스를 수집한다.
   */
  private async fetchSource(source: RssSource): Promise<ParsedNewsItem[]> {
    const feed = await this.parser.parseURL(source.url);
    const items: ParsedNewsItem[] = [];

    for (const entry of feed.items ?? []) {
      if (!entry.title || !entry.link) continue;

      const contentRaw = entry['content:encoded'] ?? entry.content ?? entry.summary ?? '';
      const contentClean = striptags(contentRaw).trim().slice(0, 5000);

      items.push({
        source: source.name,
        titleEn: entry.title.trim(),
        contentEn: contentClean,
        originalUrl: entry.link.trim(),
        publishedAt: entry.pubDate ? new Date(entry.pubDate) : new Date(),
      });
    }

    return items;
  }
}
