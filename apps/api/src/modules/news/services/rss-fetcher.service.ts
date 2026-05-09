/**
 * RSS 뉴스 수집 서비스
 *
 * 크립토 뉴스 매체 + 유튜브 인플루언서 채널의 RSS 피드를 파싱하여
 * 새로운 뉴스/영상을 수집한다.
 */

import { Injectable, Logger } from '@nestjs/common';
import Parser from 'rss-parser';
import striptags from 'striptags';

/** RSS 소스 설정 */
interface RssSource {
  name: string;
  url: string;
  type: 'news' | 'youtube';
}

/** 파싱된 뉴스 항목 */
export interface ParsedNewsItem {
  source: string;
  titleEn: string;
  contentEn: string;
  originalUrl: string;
  publishedAt: Date;
  thumbnailUrl?: string | null;
}

/** 뉴스 RSS 소스 */
const NEWS_SOURCES: RssSource[] = [
  { name: 'coindesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', type: 'news' },
  { name: 'cointelegraph', url: 'https://cointelegraph.com/rss', type: 'news' },
  { name: 'theblock', url: 'https://www.theblock.co/rss.xml', type: 'news' },
  { name: 'blockmedia', url: 'https://www.blockmedia.co.kr/feed', type: 'news' },
];

/** 유튜브 인플루언서 채널 */
const YOUTUBE_SOURCES: RssSource[] = [
  // 글로벌
  { name: 'yt-coinbureau', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCqK_GSMbpiV8spgD3ZGloSw', type: 'youtube' },
  { name: 'yt-benjamin-cowen', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCRvqjQPSeaWn-uEx-w0XOIg', type: 'youtube' },
  { name: 'yt-krown', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCnwxzpFzZNtLH8NgTeAROFA', type: 'youtube' },
  // 한국
  { name: 'yt-hs-academy', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCxvdCnvGODDyuvnELnLkQWw', type: 'youtube' },
  { name: 'yt-ohtaemin', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCgoUECWeZE7i0WQ0_xHWVMg', type: 'youtube' },
];

/** 전체 소스 */
const ALL_SOURCES: RssSource[] = [...NEWS_SOURCES, ...YOUTUBE_SOURCES];

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
      customFields: {
        item: [
          ['media:group', 'mediaGroup'],
          ['media:thumbnail', 'mediaThumbnail'],
          ['yt:videoId', 'ytVideoId'],
        ],
      },
    });
  }

  /**
   * 모든 RSS 소스에서 뉴스를 수집한다.
   */
  async fetchAll(): Promise<ParsedNewsItem[]> {
    const results = await Promise.allSettled(
      ALL_SOURCES.map((source) =>
        source.type === 'youtube'
          ? this.fetchYouTubeSource(source)
          : this.fetchSource(source),
      ),
    );

    const items: ParsedNewsItem[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      const source = ALL_SOURCES[i]!;

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
   * 뉴스 RSS 소스에서 수집한다.
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

  /**
   * 유튜브 채널 RSS에서 영상을 수집한다.
   */
  private async fetchYouTubeSource(source: RssSource): Promise<ParsedNewsItem[]> {
    const feed = await this.parser.parseURL(source.url);
    const items: ParsedNewsItem[] = [];
    const channelName = feed.title ?? source.name;

    for (const entry of feed.items ?? []) {
      if (!entry.title || !entry.link) continue;

      // 유튜브 비디오 ID 추출 → 썸네일 URL 생성
      const videoId = (entry as Record<string, unknown>).ytVideoId as string
        ?? entry.id?.replace('yt:video:', '')
        ?? '';
      const thumbnailUrl = videoId
        ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
        : null;

      const contentRaw = entry.content ?? entry.summary ?? '';
      const contentClean = striptags(contentRaw).trim().slice(0, 2000);

      items.push({
        source: source.name,
        titleEn: entry.title.trim(),
        contentEn: contentClean || `${channelName} 채널의 새 영상`,
        originalUrl: entry.link.trim(),
        publishedAt: entry.pubDate ? new Date(entry.pubDate) : new Date(),
        thumbnailUrl,
      });
    }

    return items;
  }
}
