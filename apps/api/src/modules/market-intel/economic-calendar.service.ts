/**
 * 경제 캘린더 서비스
 *
 * Forex Factory 공개 JSON에서 경제 이벤트를 자동 수집한다.
 * 이번 주 + 다음 주 데이터, USD 등 주요국 High/Medium 이벤트 필터링.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

export interface EconomicEvent {
  id: string;
  title: string;
  titleKo: string;
  date: string;
  time?: string;
  importance: 'high' | 'medium' | 'low';
  category: string;
  country: string;
  forecast?: string;
  previous?: string;
}

const TITLE_KO_MAP: Record<string, string> = {
  'FOMC Statement': 'FOMC 성명서',
  'FOMC Meeting Minutes': 'FOMC 회의록',
  'Federal Funds Rate': '연방 기금 금리',
  'FOMC Press Conference': 'FOMC 기자회견',
  'CPI m/m': 'CPI 전월비',
  'CPI y/y': 'CPI 전년비',
  'Core CPI m/m': '근원 CPI 전월비',
  'Core CPI y/y': '근원 CPI 전년비',
  'Non-Farm Employment Change': '비농업 고용 변화',
  'Unemployment Rate': '실업률',
  'Average Hourly Earnings m/m': '평균 시급 전월비',
  'Advance GDP q/q': 'GDP 속보치',
  'Final GDP q/q': 'GDP 확정치',
  'Preliminary GDP q/q': 'GDP 잠정치',
  'Core PCE Price Index m/m': '근원 PCE 물가지수 전월비',
  'Retail Sales m/m': '소매판매 전월비',
  'Core Retail Sales m/m': '근원 소매판매 전월비',
  'PPI m/m': 'PPI 전월비',
  'ISM Manufacturing PMI': 'ISM 제조업 PMI',
  'ISM Services PMI': 'ISM 서비스업 PMI',
  'Initial Jobless Claims': '신규 실업수당 청구건수',
  'Crude Oil Inventories': '원유 재고',
  'CB Consumer Confidence': 'CB 소비자 신뢰지수',
  'Existing Home Sales': '기존주택판매',
  'New Home Sales': '신규주택판매',
  'Trade Balance': '무역수지',
  'Interest Rate Decision': '금리 결정',
};

function classifyCategory(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('fomc') || t.includes('federal funds') || t.includes('interest rate')) return 'fomc';
  if (t.includes('cpi') || t.includes('pce') || t.includes('ppi')) return 'cpi';
  if (t.includes('employment') || t.includes('non-farm') || t.includes('unemployment') || t.includes('jobless')) return 'employment';
  if (t.includes('gdp')) return 'gdp';
  if (t.includes('retail') || t.includes('consumer') || t.includes('home sales')) return 'consumer';
  if (t.includes('ism') || t.includes('pmi')) return 'pmi';
  return 'other';
}

function mapImportance(impact: string): 'high' | 'medium' | 'low' {
  if (impact === 'High') return 'high';
  if (impact === 'Medium') return 'medium';
  return 'low';
}

function translateTitle(title: string): string {
  if (TITLE_KO_MAP[title]) return TITLE_KO_MAP[title];
  for (const [en, ko] of Object.entries(TITLE_KO_MAP)) {
    if (title.includes(en)) return ko;
  }
  return title;
}

const COLLECT_INTERVAL_MS = 60 * 60 * 1000;
const WATCHED_COUNTRIES = ['USD', 'EUR', 'JPY', 'GBP', 'CNY'];

@Injectable()
export class EconomicCalendarService implements OnModuleInit {
  private readonly logger = new Logger(EconomicCalendarService.name);
  private events: EconomicEvent[] = [];

  async onModuleInit(): Promise<void> {
    // 서버 시작 직후 Rate Limit 방지를 위해 30초 딜레이
    setTimeout(() => this.collect(), 30_000);
  }

  @Interval('economic-calendar-collect', COLLECT_INTERVAL_MS)
  async collect(): Promise<void> {
    try {
      const [thisWeek, nextWeek] = await Promise.allSettled([
        this.fetchWeek('https://nfs.faireconomy.media/ff_calendar_thisweek.json'),
        this.fetchWeek('https://nfs.faireconomy.media/ff_calendar_nextweek.json'),
      ]);

      const allEvents: EconomicEvent[] = [];
      if (thisWeek.status === 'fulfilled') allEvents.push(...thisWeek.value);
      if (nextWeek.status === 'fulfilled') allEvents.push(...nextWeek.value);

      this.events = allEvents.sort((a, b) => a.date.localeCompare(b.date));
      this.logger.log(`경제 캘린더 수집 완료: ${this.events.length}건`);
    } catch (error) {
      this.logger.warn(`경제 캘린더 수집 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async fetchWeek(url: string): Promise<EconomicEvent[]> {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { 'Accept': 'application/json', 'User-Agent': 'BitScope/1.0' },
    });
    if (!res.ok) {
      this.logger.warn(`Forex Factory 응답 오류: ${res.status} ${url}`);
      return [];
    }

    const text = await res.text();
    // HTML 응답이면 (Cloudflare WARP 등) 스킵
    if (text.startsWith('<!') || text.startsWith('<html')) {
      this.logger.warn('Forex Factory 응답이 HTML (WARP/프록시 간섭 가능)');
      return [];
    }

    const data = JSON.parse(text) as Array<{
      title: string; country: string; date: string; impact: string; forecast: string; previous: string;
    }>;

    return data
      .filter((d) => WATCHED_COUNTRIES.includes(d.country))
      .filter((d) => d.impact === 'High' || d.impact === 'Medium')
      .map((d, i) => {
        // KST로 변환 (Forex Factory는 EDT 기준)
        const utcDate = new Date(d.date);
        const kstDate = new Date(utcDate.getTime());
        const kstDateStr = kstDate.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }); // YYYY-MM-DD
        const kstTimeStr = kstDate.toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });

        return {
          id: `ff-${d.date}-${i}`,
          title: d.title,
          titleKo: translateTitle(d.title),
          date: kstDateStr,
          time: kstTimeStr,
          importance: mapImportance(d.impact),
          category: classifyCategory(d.title),
          country: d.country,
          forecast: d.forecast || undefined,
          previous: d.previous || undefined,
        };
      });
  }

  getAllEvents(): EconomicEvent[] {
    return this.events;
  }

  getUpcomingEvents(limit: number = 10): EconomicEvent[] {
    const now = new Date().toISOString().slice(0, 10);
    return this.events.filter((e) => e.date >= now).slice(0, limit);
  }

  getRecentAndUpcoming(limit: number = 30): EconomicEvent[] {
    return this.events.slice(0, limit);
  }
}
