/**
 * 주식-perp 비교 차트 순수 데이터 변환 유틸 (lightweight-charts 렌더러용)
 *
 * 차트 컴포넌트(`comparison-chart.tsx`)는 `'use client'` + 브라우저 전용
 * lightweight-charts API(`createChart`)를 모듈 로드 시점에 끌어올 수 있어
 * jsdom 단위 테스트 격리가 어렵다. 따라서 렌더와 무관한 순수 로직을 이 파일로
 * 분리해 단위 테스트 가능하게 둔다(NFR3.2).
 *
 * 포함 함수:
 * - downsamplePreservingBoundaries: 경계 보존 다운샘플러 (기존 로직 이관, 상한만 상향)
 * - computeClosedRegions: 연속 휴장 구간 계산 (기존 로직 이관, epoch ms 단위 유지)
 * - toLineSeriesData: ComparisonPoint[] → lightweight-charts LineData/Whitespace 매핑
 * - makeKstTickFormatter: 가시 구간 폭에 따른 KST 스마트 시간축 포맷터
 * - buildTimeIndex / findPointByTime: crosshair time(초) → 원본 포인트 역매핑
 *
 * 주의: noUncheckedIndexedAccess가 켜져 있어 인덱스 접근은 항상 const로 캡처 후
 * undefined를 검사한다.
 */

import type { ComparisonPoint } from '@bitscope/shared';
import type { LineData, UTCTimestamp, WhitespaceData, Time } from 'lightweight-charts';

/**
 * 차트에 렌더할 최대 포인트 수 (R8.1).
 *
 * lightweight-charts는 canvas 렌더라 수천 포인트도 프레임 끊김 없이 그린다.
 * 분봉을 촘촘·부드럽게 보여주기 위해 기존 recharts 시절의 100에서 5000으로 상향한다.
 * 현실적으로 `ComparisonPoint[]`는 range별 수백~수천 규모라, 이 상한은 사실상 거의 항상
 * 원본 전부를 통과시키면서(부드러움) 비정상적으로 큰 입력에 대한 안전망만 유지한다.
 */
export const MAX_POINTS = 5000;

/** 휴장(연속 marketOpen===false) 음영 구간. x1/x2는 epoch ms (기존 단위 유지). */
export interface ClosedRegion {
  x1: number;
  x2: number;
}

/** lightweight-charts 라인 시리즈 포인트 (value 없는 whitespace는 라인 끊김). */
export type SeriesPoint = LineData<UTCTimestamp> | WhitespaceData<UTCTimestamp>;

/**
 * 경계 보존 다운샘플러 (R8.3).
 *
 * 균등 샘플링(`i % step === 0`)을 기반으로 하되, 갭/음영 경계가 샘플링으로
 * 사라지지 않도록 다음 포인트는 **강제 보존**한다:
 * - `stockGap === true` 포인트 (휴장 갭의 시작점, R6.2)
 * - `marketOpen` 값이 직전 포인트와 달라지는 전환 지점 (음영 구간 경계, R7)
 *
 * 첫 포인트와 마지막 포인트도 항상 포함하여 축 범위를 보존한다.
 * 보존 인덱스를 set으로 모은 뒤 원본 순서대로 추출하므로 정렬은 유지된다.
 * 상한 이하면 동일 참조를 그대로 반환한다.
 */
export function downsamplePreservingBoundaries(
  points: ComparisonPoint[],
  maxPoints: number = MAX_POINTS,
): ComparisonPoint[] {
  if (points.length <= maxPoints) return points;

  const keep = new Set<number>();
  const lastIndex = points.length - 1;
  keep.add(0);
  keep.add(lastIndex);

  let prevOpen: boolean | undefined;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p === undefined) continue;
    // 갭 시작점은 항상 보존
    if (p.stockGap) keep.add(i);
    // marketOpen 전환(개장↔휴장) 경계는 양쪽 모두 보존
    if (prevOpen !== undefined && prevOpen !== p.marketOpen) {
      keep.add(i);
      keep.add(i - 1);
    }
    prevOpen = p.marketOpen;
  }

  // 균등 샘플링
  const step = Math.ceil(points.length / maxPoints);
  for (let i = 0; i < points.length; i += step) {
    keep.add(i);
  }

  const indices = Array.from(keep).sort((a, b) => a - b);
  const result: ComparisonPoint[] = [];
  for (const idx of indices) {
    const p = points[idx];
    if (p !== undefined) result.push(p);
  }
  return result;
}

/**
 * 연속된 휴장(marketOpen===false) 구간을 `{x1,x2}` 음영 영역으로 묶는다 (R7.1).
 *
 * 인접 포인트의 timestamp(epoch ms)를 x1/x2로 사용하며, 휴장이 끝나면(개장 전환 또는
 * 배열 종료) 현재 구간을 닫는다. 단일 포인트 휴장도 x1===x2로 렌더된다.
 *
 * noUncheckedIndexedAccess 대응: 모든 인덱스 접근은 const 캡처 + undefined 검사.
 */
export function computeClosedRegions(points: ComparisonPoint[]): ClosedRegion[] {
  const regions: ClosedRegion[] = [];
  let startTs: number | null = null;
  let endTs: number | null = null;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p === undefined) continue;
    if (!p.marketOpen) {
      if (startTs === null) startTs = p.timestamp;
      endTs = p.timestamp;
    } else if (startTs !== null && endTs !== null) {
      regions.push({ x1: startTs, x2: endTs });
      startTs = null;
      endTs = null;
    }
  }
  if (startTs !== null && endTs !== null) {
    regions.push({ x1: startTs, x2: endTs });
  }
  return regions;
}

/** epoch ms → lightweight-charts UTCTimestamp(초 단위). 시프트하지 않는다(R5.5). */
function toUtcSeconds(timestampMs: number): UTCTimestamp {
  return Math.floor(timestampMs / 1000) as UTCTimestamp;
}

/**
 * ComparisonPoint[] → lightweight-charts 라인 시리즈 데이터로 변환한다 (R3).
 *
 * - `time = Math.floor(timestamp / 1000)` (초 단위, KST 시프트 없음 — 표시 단계 포맷터가 책임).
 * - 주식(`stockPrice`): null 가격은 `WhitespaceData`(value 없음)로 매핑 → 라인 끊김
 *   (recharts `connectNulls={false}` 동등). forward-fill 금지(R3.3).
 * - perp(`perpPrice`): null 포인트는 **배열에서 제외** → 인접 유효점을 직선으로 이어
 *   24시간 연속으로 보인다(recharts `connectNulls` 동등, R3.2).
 *
 * 입력 `points`는 timestamp 오름차순·중복 없음이 보장된다고 가정한다(병합 파이프라인 산출물).
 */
export function toLineSeriesData(
  points: ComparisonPoint[],
  key: 'stockPrice' | 'perpPrice',
): SeriesPoint[] {
  const result: SeriesPoint[] = [];
  const connectNulls = key === 'perpPrice';

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p === undefined) continue;
    const value = p[key];
    const time = toUtcSeconds(p.timestamp);

    if (value != null && Number.isFinite(value)) {
      result.push({ time, value });
    } else if (!connectNulls) {
      // 주식: 결측은 whitespace로 → 라인 끊김
      result.push({ time });
    }
    // perp: 결측은 제외(아무것도 push하지 않음) → 인접점 직선 연결
  }
  return result;
}

/** 가시 구간 폭 분기 임계값 (기존 comparison-chart.tsx와 동일). */
const SHORT_RANGE_MS = 48 * 3600 * 1000; // 48시간
const MID_RANGE_MS = 14 * 24 * 3600 * 1000; // 14일

/**
 * 가시 구간 폭(ms)에 따른 KST 스마트 시간축 포맷터를 만든다 (R5).
 *
 * - 48시간 미만: 시:분 (24시간제)
 * - 48시간 이상 14일 미만: 월/일 + 시
 * - 14일 이상: 월/일
 *
 * lightweight-charts의 `tickMarkFormatter(time, tickMarkType, locale)` 및 crosshair
 * 패널 양쪽에서 재사용 가능한 `(time) => string` 형태를 반환한다. `time`은 UTCTimestamp(초)
 * 또는 epoch ms를 모두 허용하기 위해 호출부에서 초를 넘기고 내부에서 ms로 환산한다.
 *
 * KST 표시는 `Intl.DateTimeFormat({ timeZone: 'Asia/Seoul' })`로 표시 단계에서만 적용한다
 * (time 자체는 시프트하지 않음, R5.5).
 */
export function makeKstTickFormatter(timeRangeMs: number): (time: Time) => string {
  const isShortRange = timeRangeMs < SHORT_RANGE_MS;
  const isMidRange = timeRangeMs < MID_RANGE_MS;

  const timeFmt = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const dateHourFmt = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    hour12: false,
  });
  const dateFmt = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
  });

  return (time: Time) => {
    // 본 차트는 UTCTimestamp(초)만 사용하므로 number만 처리한다.
    if (typeof time !== 'number') return '';
    const d = new Date(time * 1000);
    if (isShortRange) return timeFmt.format(d);
    if (isMidRange) return dateHourFmt.format(d);
    return dateFmt.format(d);
  };
}

/**
 * timestamp(초) → 원본 ComparisonPoint 역매핑용 인덱스를 만든다.
 *
 * crosshair `param.time`(UTCTimestamp 초)으로 원본 포인트를 O(1) 조회하기 위한 Map.
 * 키는 `Math.floor(timestamp / 1000)`(초)로 `toLineSeriesData`의 time 매핑과 일치한다.
 */
export function buildTimeIndex(points: ComparisonPoint[]): Map<number, ComparisonPoint> {
  const index = new Map<number, ComparisonPoint>();
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p === undefined) continue;
    index.set(Math.floor(p.timestamp / 1000), p);
  }
  return index;
}

/**
 * crosshair time(초)으로 원본 ComparisonPoint를 역매핑한다 (R9.3).
 *
 * 미존재 시 null을 반환한다(R9.4). 호출 빈도가 높은 경로(crosshair move)에서는
 * 호출부가 `buildTimeIndex`를 메모이즈해 재사용하는 것을 권장한다. 본 함수는
 * 단위 테스트 및 단발 조회 편의를 위해 내부에서 인덱스를 구성한다.
 */
export function findPointByTime(
  points: ComparisonPoint[],
  time: number,
): ComparisonPoint | null {
  return buildTimeIndex(points).get(Math.floor(time)) ?? null;
}
