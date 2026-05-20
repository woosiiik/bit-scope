/**
 * 속보 소스 인터페이스
 *
 * 새 속보 소스를 추가할 때 구현해야 하는 공통 계약.
 * 텔레그램 채널, 웹 스크래핑, RSS 등 다양한 소스를 동일한 방식으로 통합할 수 있다.
 */

import type { ParsedTelegramMessage } from '../services/telegram-channel-fetcher.service';

export interface BreakingNewsSource {
  /** 소스 식별자 (예: 'coin24live') */
  readonly name: string;

  /** 최신 속보 메시지를 수집한다 */
  fetch(): Promise<ParsedTelegramMessage[]>;
}
