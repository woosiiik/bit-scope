'use client';

import { ChevronDown } from 'lucide-react';
import { PAIR_CONFIGS } from '@bitscope/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface PairSelectorProps {
  /** 현재 선택된 페어의 주식 심볼 (예: '005930.KS') */
  selected: string;
  /** 페어 선택 변경 콜백 — 선택된 주식 심볼을 전달 */
  onChange: (stockSymbol: string) => void;
}

/**
 * 종목(주식-perp 페어) 선택 드롭다운.
 *
 * 버튼 나열 대신 드롭다운을 사용해 종목이 계속 추가되어도 레이아웃이 깨지지 않는다.
 * 각 항목은 종목명(한국어)과 대응 perp 코인을 함께 보여준다.
 */
export function PairSelector({ selected, onChange }: PairSelectorProps) {
  const current = PAIR_CONFIGS.find((p) => p.stockSymbol === selected) ?? PAIR_CONFIGS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 min-w-[7rem] justify-between gap-2 px-2.5 text-xs font-medium"
        >
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {current?.nameKo ?? '종목 선택'}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[60vh] w-56 overflow-y-auto">
        <DropdownMenuLabel className="text-[11px] text-muted-foreground">종목</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={selected} onValueChange={onChange}>
          {PAIR_CONFIGS.map((pair) => (
            <DropdownMenuRadioItem
              key={pair.stockSymbol}
              value={pair.stockSymbol}
              className="flex-col items-start gap-0 py-1.5"
            >
              <span className="text-sm font-medium">{pair.nameKo}</span>
              <span className="text-[10px] text-muted-foreground">{pair.perpCoin}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
