/**
 * 속보 텔레그램 소스
 *
 * @Coin24Live 등 텔레그램 채널에서 속보를 수집한다.
 * 기존 TelegramChannelFetcherService와 동일한 HTML 파싱 방식을 사용하되,
 * source prefix를 'breaking-'으로 구분한다.
 */

import { Injectable, Logger } from '@nestjs/common';
import striptags from 'striptags';

import type { BreakingNewsSource } from '../interfaces/breaking-news-source.interface';
import type { ParsedTelegramMessage } from './telegram-channel-fetcher.service';

/** 속보 텔레그램 채널 설정 */
interface BreakingChannel {
  handle: string;
  sourcePrefix: string;
}

/** 수집 대상 채널 목록 (추후 환경변수 또는 DB 설정으로 관리 가능) */
const BREAKING_CHANNELS: BreakingChannel[] = [
  { handle: 'Coin24Live', sourcePrefix: 'breaking-coin24live' },
];

@Injectable()
export class BreakingNewsTelegramSource implements BreakingNewsSource {
  private readonly logger = new Logger(BreakingNewsTelegramSource.name);

  readonly name = 'telegram';

  /**
   * 모든 속보 채널에서 메시지를 수집한다.
   */
  async fetch(): Promise<ParsedTelegramMessage[]> {
    const results = await Promise.allSettled(
      BREAKING_CHANNELS.map((ch) => this.fetchChannel(ch)),
    );

    const items: ParsedTelegramMessage[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      const channel = BREAKING_CHANNELS[i]!;

      if (result.status === 'fulfilled') {
        items.push(...result.value);
      } else {
        this.logger.warn(`${channel.handle} 속보 수집 실패: ${result.reason}`);
      }
    }

    return items;
  }

  /**
   * 단일 채널에서 속보를 수집한다.
   */
  private async fetchChannel(channel: BreakingChannel): Promise<ParsedTelegramMessage[]> {
    const url = `https://t.me/s/${channel.handle}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'BitScope/1.0',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const html = await res.text();
    return this.parseMessages(html, channel);
  }

  /**
   * t.me/s/ HTML에서 메시지를 파싱한다.
   */
  private parseMessages(html: string, channel: BreakingChannel): ParsedTelegramMessage[] {
    const messages: ParsedTelegramMessage[] = [];

    const messagePattern = /class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
    const datePattern = /datetime="([^"]+)"/g;
    const linkPattern = /data-post="([^"]+)"/g;

    const texts: string[] = [];
    let match;
    while ((match = messagePattern.exec(html)) !== null) {
      const rawText = striptags(match[1] ?? '').trim();
      if (rawText.length > 5) {
        texts.push(rawText);
      }
    }

    const dates: string[] = [];
    while ((match = datePattern.exec(html)) !== null) {
      dates.push(match[1]!);
    }

    const links: string[] = [];
    while ((match = linkPattern.exec(html)) !== null) {
      links.push(match[1]!);
    }

    const count = Math.min(texts.length, 15);
    for (let i = 0; i < count; i++) {
      const text = texts[i]!;
      const title = text.slice(0, 200) + (text.length > 200 ? '...' : '');
      const dateStr = dates[i] ?? new Date().toISOString();
      const postId = links[i] ?? `${channel.handle}/${Date.now()}-${i}`;

      messages.push({
        source: channel.sourcePrefix,
        titleEn: title,
        contentEn: text.slice(0, 5000),
        originalUrl: `https://t.me/${postId}`,
        publishedAt: new Date(dateStr),
      });
    }

    return messages;
  }
}
