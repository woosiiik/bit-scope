/**
 * 시그널 메시지 파서
 *
 * Telegram 원본 메시지를 구조화된 시그널 데이터로 파싱한다.
 */

import { Injectable, Logger } from '@nestjs/common';

/** 파싱된 시그널 */
export interface ParsedSignal {
  coinSymbol: string;
  direction: 'LONG' | 'SHORT';
  signalType: string;
  sectionName: string | null;
  telegramMessageId: number;
  signalAt: Date;
  rawMessage: string;
}

/**
 * 시그널 헤더 패턴 매칭 규칙
 *
 * ⤴️ Long [L1, L2, L3]     → LONG, "L1,L2,L3"
 * ⤴️ Double Long [LL]       → LONG, "LL"
 * 🟢 Long [L]               → LONG, "L"
 * 🟢 Ready Long [RL]        → LONG, "RL"
 * ⤵️ Short [S1, S2, S3]    → SHORT, "S1,S2,S3"
 * ⤵️ Double Short [SS]     → SHORT, "SS"
 * 🔴 Short [S]              → SHORT, "S"
 */
const SIGNAL_HEADER_PATTERN = /(?:⤴️|⤵️|🟢|🔴)\s*(?:Double\s+|Ready\s+)?(Long|Short)\s*\[([^\]]+)\]/i;

/** 섹션 제목 패턴 (📍...📍 또는 🌟...🌟) */
const SECTION_TITLE_PATTERN = /[📍🌟](.+?)[📍🌟]/;

/** 코인 심볼 패턴 (예: BTC/USDT, ETH/USDT) */
const COIN_SYMBOL_PATTERN = /^([A-Z0-9]+\/USDT)$/;

@Injectable()
export class SignalParserService {
  private readonly logger = new Logger(SignalParserService.name);

  /**
   * 원본 메시지를 파싱하여 시그널 배열을 반환한다.
   */
  parse(rawMessage: string, telegramMessageId: number, messageDate: Date): ParsedSignal[] {
    if (!rawMessage || !rawMessage.trim()) return [];

    const signals: ParsedSignal[] = [];
    const lines = rawMessage.split('\n').map((l) => l.trim());

    let currentSection: string | null = null;
    let currentDirection: 'LONG' | 'SHORT' | null = null;
    let currentSignalType: string | null = null;

    for (const line of lines) {
      if (!line) continue;

      // 구분선 (-----)은 건너뛰기
      if (/^-{3,}$/.test(line)) {
        currentDirection = null;
        currentSignalType = null;
        continue;
      }

      // 섹션 제목 감지
      const sectionMatch = line.match(SECTION_TITLE_PATTERN);
      if (sectionMatch) {
        currentSection = sectionMatch[1]!.trim();
        currentDirection = null;
        currentSignalType = null;
        continue;
      }

      // 시그널 헤더 감지
      const headerMatch = line.match(SIGNAL_HEADER_PATTERN);
      if (headerMatch) {
        const directionStr = headerMatch[1]!.toLowerCase();
        currentDirection = directionStr === 'long' ? 'LONG' : 'SHORT';
        currentSignalType = headerMatch[2]!.replace(/\s+/g, '').trim();
        continue;
      }

      // 코인 심볼 감지 (현재 시그널 컨텍스트가 있을 때만)
      if (currentDirection && currentSignalType) {
        const symbolMatch = line.toUpperCase().match(COIN_SYMBOL_PATTERN);
        if (symbolMatch) {
          signals.push({
            coinSymbol: symbolMatch[1]!,
            direction: currentDirection,
            signalType: currentSignalType,
            sectionName: currentSection,
            telegramMessageId,
            signalAt: messageDate,
            rawMessage,
          });
        }
      }
    }

    if (signals.length === 0 && rawMessage.trim().length > 10) {
      this.logger.debug(`시그널 파싱 결과 없음 (msgId: ${telegramMessageId}): ${rawMessage.slice(0, 100)}`);
    }

    return signals;
  }
}
