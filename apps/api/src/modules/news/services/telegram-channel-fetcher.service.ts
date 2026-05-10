/**
 * 텔레그램 채널 수집 서비스
 *
 * 공개 텔레그램 채널의 최근 메시지를 t.me/s/ 웹 미리보기에서 파싱한다.
 * 무료, API Key 불필요.
 */

import { Injectable, Logger } from '@nestjs/common';
import striptags from 'striptags';

/** 텔레그램 채널 설정 */
interface TelegramChannel {
  name: string;
  handle: string;
}

/** 파싱된 텔레그램 메시지 */
export interface ParsedTelegramMessage {
  source: string;
  titleEn: string;
  contentEn: string;
  originalUrl: string;
  publishedAt: Date;
}

/** 모니터링할 텔레그램 채널 */
const TELEGRAM_CHANNELS: TelegramChannel[] = [
  { name: 'tg-wu-blockchain', handle: 'WuBlockchain' },
  { name: 'tg-cryptoquant', handle: 'CryptoQuantOfficial' },
];

@Injectable()
export class TelegramChannelFetcherService {
  private readonly logger = new Logger(TelegramChannelFetcherService.name);

  /**
   * 모든 텔레그램 채널에서 메시지를 수집한다.
   */
  async fetchAll(): Promise<ParsedTelegramMessage[]> {
    const results = await Promise.allSettled(
      TELEGRAM_CHANNELS.map((ch) => this.fetchChannel(ch)),
    );

    const items: ParsedTelegramMessage[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      const channel = TELEGRAM_CHANNELS[i]!;

      if (result.status === 'fulfilled') {
        items.push(...result.value);
        this.logger.log(`${channel.handle} 텔레그램 수집 성공: ${result.value.length}건`);
      } else {
        this.logger.warn(`${channel.handle} 텔레그램 수집 실패: ${result.reason}`);
      }
    }

    return items;
  }

  /**
   * 단일 텔레그램 채널에서 메시지를 수집한다.
   */
  private async fetchChannel(channel: TelegramChannel): Promise<ParsedTelegramMessage[]> {
    const url = `https://t.me/s/${channel.handle}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'BitScope/1.0',
        'Accept': 'text/html',
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
  private parseMessages(html: string, channel: TelegramChannel): ParsedTelegramMessage[] {
    const messages: ParsedTelegramMessage[] = [];

    // tgme_widget_message_text 클래스에서 메시지 텍스트 추출
    const messagePattern = /class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
    const datePattern = /datetime="([^"]+)"/g;
    const linkPattern = /data-post="([^"]+)"/g;

    // 메시지 텍스트 추출
    const texts: string[] = [];
    let match;
    while ((match = messagePattern.exec(html)) !== null) {
      const rawText = striptags(match[1] ?? '').trim();
      if (rawText.length > 10) {
        texts.push(rawText);
      }
    }

    // 날짜 추출
    const dates: string[] = [];
    while ((match = datePattern.exec(html)) !== null) {
      dates.push(match[1]!);
    }

    // 링크 추출
    const links: string[] = [];
    while ((match = linkPattern.exec(html)) !== null) {
      links.push(match[1]!);
    }

    // 최근 10개만
    const count = Math.min(texts.length, 10);
    for (let i = 0; i < count; i++) {
      const text = texts[i]!;
      const title = text.slice(0, 100) + (text.length > 100 ? '...' : '');
      const dateStr = dates[i] ?? new Date().toISOString();
      const postId = links[i] ?? `${channel.handle}/${Date.now()}-${i}`;

      messages.push({
        source: channel.name,
        titleEn: title,
        contentEn: text.slice(0, 3000),
        originalUrl: `https://t.me/${postId}`,
        publishedAt: new Date(dateStr),
      });
    }

    return messages;
  }
}
