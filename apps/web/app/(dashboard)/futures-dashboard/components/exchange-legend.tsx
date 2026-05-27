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
        const hasError = errors?.[ex];

        return (
          <div key={ex} className="flex items-center gap-1">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className={hasError ? 'text-muted-foreground line-through' : 'text-foreground'}>
              {config?.nameEn ?? ex}
            </span>
            {hasError && (
              <span className="text-destructive">!</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
