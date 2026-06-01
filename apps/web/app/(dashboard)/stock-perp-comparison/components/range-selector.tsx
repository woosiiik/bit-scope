'use client';

import type { ComparisonRange } from '@bitscope/shared';

/**
 * 한국어 라벨 ↔ 내부 Yahoo 토큰(ComparisonRange) 매핑.
 * 사용자에게는 한국어 라벨을 노출하고, 내부 값/콜백은 Yahoo range 토큰을 사용한다.
 */
const RANGES: { value: ComparisonRange; label: string }[] = [
  { value: '1d', label: '1일' },
  { value: '5d', label: '5일' },
  { value: '1mo', label: '1개월' },
  { value: '6mo', label: '6개월' },
  { value: '1y', label: '1년' },
];

interface RangeSelectorProps {
  selected: ComparisonRange;
  onChange: (range: ComparisonRange) => void;
}

/**
 * 기간 선택 세그먼트 컨트롤.
 *
 * 고정된 소수 옵션이므로 버튼을 하나의 테두리 안에 묶은 세그먼트 형태로 표시한다.
 * 선택된 항목만 배경/그림자로 강조한다.
 */
export function RangeSelector({ selected, onChange }: RangeSelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label="기간 선택"
      className="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5"
    >
      {RANGES.map((r) => {
        const isActive = selected === r.value;
        return (
          <button
            key={r.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(r.value)}
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
