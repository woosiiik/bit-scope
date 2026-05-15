/**
 * 선물 거래소 선택 탭
 *
 * FUTURES_EXCHANGES 배열을 기반으로 Binance, Bybit, OKX, Gate, Bitget
 * 버튼 탭을 렌더링한다. 선택된 거래소를 활성 상태로 표시한다.
 *
 * @see 요구사항 3.1, 3.2, 3.3
 */

'use client';

import type { FuturesExchangeType } from '@bitscope/shared';
import { FUTURES_EXCHANGES, EXCHANGE_CONFIGS } from '@bitscope/shared';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/i18n-context';

interface FuturesExchangeTabsProps {
  /** 현재 선택된 거래소 */
  selectedExchange: FuturesExchangeType;
  /** 거래소 선택 핸들러 */
  onSelectExchange: (exchange: FuturesExchangeType) => void;
}

/**
 * 선물 거래소 이름을 반환한다.
 *
 * EXCHANGE_CONFIGS에서 거래소 이름을 조회한다.
 * 선물 거래소는 모두 해외 거래소이므로 영문명을 사용한다.
 */
function getFuturesExchangeDisplayName(exchange: FuturesExchangeType): string {
  const config = EXCHANGE_CONFIGS[exchange];
  if (!config) return exchange;
  return config.nameEn;
}

export function FuturesExchangeTabs({
  selectedExchange,
  onSelectExchange,
}: FuturesExchangeTabsProps) {
  const { locale } = useTranslation();

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      {FUTURES_EXCHANGES.map((exchange) => {
        const isActive = selectedExchange === exchange;
        return (
          <Button
            key={exchange}
            variant={isActive ? 'default' : 'outline'}
            size="sm"
            onClick={() => onSelectExchange(exchange)}
            aria-pressed={isActive}
            aria-label={`${getFuturesExchangeDisplayName(exchange)} ${locale === 'ko' ? '선물' : 'futures'}`}
            className="text-xs"
          >
            {getFuturesExchangeDisplayName(exchange)}
          </Button>
        );
      })}
    </div>
  );
}
