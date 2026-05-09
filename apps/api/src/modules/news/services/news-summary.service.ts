/**
 * 뉴스 AI 요약 서비스
 *
 * Claude Haiku API를 사용하여 영어 뉴스를 한글로 요약 번역한다.
 * 제목 번역 + 본문 3~5문장 요약을 생성한다.
 */

import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

/** 요약 결과 */
export interface SummaryResult {
  titleKo: string;
  summaryKo: string;
}

@Injectable()
export class NewsSummaryService {
  private readonly logger = new Logger(NewsSummaryService.name);
  private client: Anthropic | null = null;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
      this.logger.log('Claude API 클라이언트 초기화 완료');
    } else {
      this.logger.warn('ANTHROPIC_API_KEY가 설정되지 않았습니다. 뉴스 요약 기능이 비활성화됩니다.');
    }
  }

  /**
   * Claude API가 사용 가능한지 확인한다.
   */
  isEnabled(): boolean {
    return this.client !== null;
  }

  /**
   * 영어 뉴스를 한글로 요약 번역한다.
   *
   * @param titleEn 영어 제목
   * @param contentEn 영어 본문
   * @returns 한글 제목 + 요약 또는 null (실패 시)
   */
  /**
   * 한국어 뉴스인지 판별한다 (간단한 휴리스틱).
   */
  private isKorean(text: string): boolean {
    const koreanChars = text.match(/[\uAC00-\uD7AF]/g);
    return (koreanChars?.length ?? 0) > text.length * 0.1;
  }

  async summarize(titleEn: string, contentEn: string): Promise<SummaryResult | null> {
    if (!this.client) {
      return null;
    }

    try {
      const isKo = this.isKorean(titleEn + contentEn);

      const prompt = isKo
        ? `다음 한국어 암호화폐 뉴스를 요약해주세요.

규칙:
1. 제목은 그대로 유지 (1줄)
2. 본문을 3~5문장으로 요약

응답 형식 (반드시 이 형식으로):
제목: [제목]
요약: [요약 3~5문장]

---
제목: ${titleEn}
본문: ${contentEn.slice(0, 3000)}`
        : `다음 영어 암호화폐 뉴스를 한국어로 번역/요약해주세요.

규칙:
1. 제목을 한국어로 번역 (1줄)
2. 본문을 3~5문장으로 요약 (한국어)
3. 암호화폐 업계 용어는 관용적 한국어 표현 사용 (예: Bitcoin→비트코인, Ethereum→이더리움)

응답 형식 (반드시 이 형식으로):
제목: [한국어 번역 제목]
요약: [한국어 요약 3~5문장]

---
제목: ${titleEn}
본문: ${contentEn.slice(0, 3000)}`;

      const message = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = message.content[0]?.type === 'text' ? message.content[0].text : '';
      return this.parseResponse(text);
    } catch (error) {
      this.logger.error(
        `Claude API 요약 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Claude 응답을 파싱하여 제목과 요약을 추출한다.
   */
  private parseResponse(text: string): SummaryResult | null {
    const titleMatch = text.match(/제목:\s*(.+)/);
    const summaryMatch = text.match(/요약:\s*([\s\S]+)/);

    if (!titleMatch || !summaryMatch) {
      this.logger.warn('Claude 응답 파싱 실패: 형식 불일치');
      return null;
    }

    return {
      titleKo: titleMatch[1]!.trim(),
      summaryKo: summaryMatch[1]!.trim(),
    };
  }
}
