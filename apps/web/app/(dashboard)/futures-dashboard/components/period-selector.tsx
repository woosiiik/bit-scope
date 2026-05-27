'use client';

import type { Period } from '@bitscope/shared';
import { Button } from '@/components/ui/button';

const PERIODS: Period[] = ['1d', '1w', '1m', '3m', '6m', '1y'];

interface PeriodSelectorProps {
  selected: Period;
  onChange: (period: Period) => void;
}

export function PeriodSelector({ selected, onChange }: PeriodSelectorProps) {
  return (
    <div className="flex items-center gap-0.5">
      {PERIODS.map((p) => (
        <Button
          key={p}
          variant={selected === p ? 'default' : 'ghost'}
          size="sm"
          className="text-[10px] h-5 px-1.5 min-w-0"
          onClick={() => onChange(p)}
        >
          {p.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}
