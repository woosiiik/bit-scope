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

/**
 * 메시지 본문 끝에 있는 괄호 시간 패턴
 * 예: "(15:00 May 20)", "(9:05 May 20)"
 */
const INLINE_TIME_PATTERN = /\((\d{1,2}:\d{2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\)\s*$/;

const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/**
 * 메시지 본문 끝의 괄호 시간에서 Date를 추출한다.
 * 텍스트 자체는 변경하지 않는다 (표시용 원문 유지).
 * 예: "속보 내용...(15:00 May 20)" → Date(2026, 4, 20, 15, 0)
 */
function extractInlineTime(text: string): Date | null {
  const match = text.match(INLINE_TIME_PATTERN);
  if (!match) return null;

  const [, time, monthStr, dayStr] = match;
  const [hours, minutes] = time!.split(':').map(Number);
  const month = MONTH_MAP[monthStr!];
  const day = parseInt(dayStr!, 10);

  if (month === undefined || isNaN(hours!) || isNaN(minutes!) || isNaN(day)) {
    return null;
  }

  const now = new Date();
  const date = new Date(now.getFullYear(), month, day, hours!, minutes!, 0, 0);

  // 파싱된 날짜가 미래이면 작년으로 보정 (연말→연초 전환 대응)
  if (date.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    date.setFullYear(date.getFullYear() - 1);
  }

  return date;
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
   *
   * data-post 속성을 기준으로 메시지 블록을 분리하고,
   * 각 블록 내에서 텍스트/날짜/링크를 추출하여 인덱스 어긋남을 방지한다.
   */
  private parseMessages(html: string, channel: BreakingChannel): ParsedTelegramMessage[] {
    const messages: ParsedTelegramMessage[] = [];

    // data-post 기준으로 메시지 블록 분리
    const blocks = html.split(/data-post="/);

    for (const block of blocks.slice(1)) { // 첫 번째는 data-post 이전 부분이므로 skip
      // 블록 내에서 post ID 추출
      const postIdMatch = block.match(/^([^"]+)"/);
      if (!postIdMatch) continue;
      const postId = postIdMatch[1]!;

      // 블록 내에서 메시지 텍스트 추출
      const textMatch = block.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
      if (!textMatch) continue; // 텍스트 없는 메시지(이미지 전용 등)는 skip

      const rawText = striptags(textMatch[1] ?? '').trim();
      if (rawText.length <= 5) continue;

      // 블록 내에서 datetime 추출
      const dateMatch = block.match(/datetime="([^"]+)"/);
      const dateStr = dateMatch?.[1] ?? new Date().toISOString();

      // 인라인 시간 우선, 없으면 HTML datetime
      const inlineDate = extractInlineTime(rawText);
      const publishedAt = inlineDate ?? new Date(dateStr);

      const title = rawText.slice(0, 200) + (rawText.length > 200 ? '...' : '');

      messages.push({
        source: channel.sourcePrefix,
        titleEn: title,
        contentEn: rawText.slice(0, 5000),
        originalUrl: `https://t.me/${postId}`,
        publishedAt,
      });

      if (messages.length >= 15) break;
    }

    return messages;
  }
}
