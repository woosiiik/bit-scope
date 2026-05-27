'use client';

import type { FuturesExchangeType } from '@bitscope/shared';
import { EXCHANGE_CONFIGS, EXCHANGE_COLORS } from '@bitscope/shared';
import type { ExchangeType } from '@bitscope/shared';

interface ExchangeLegendProps {
  exchanges: FuturesExchangeType[];
  errors?: Partial<Record<FuturesExchangeType, string>>;
}

export function ExchangeLegend({ exchanges, errors }: ExchangeLegendProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
      {exchanges.map((ex) => {
        const config = EXCHANGE_CONFIGS[ex as ExchangeType];
        const color = EXCHANGE_COLORS[ex];
        const errorMsg = errors?.[ex];

        return (
          <div key={ex} className="flex items-center gap-1 group relative">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className={errorMsg ? 'text-muted-foreground line-through' : 'text-foreground'}>
              {config?.nameEn ?? ex}
            </span>
            {errorMsg && (
              <>
                <span className="text-destructive cursor-help">!</span>
                <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-50 max-w-[200px] rounded bg-popover text-popover-foreground border border-border px-2 py-1 text-[10px] shadow-md whitespace-normal">
                  {errorMsg}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
