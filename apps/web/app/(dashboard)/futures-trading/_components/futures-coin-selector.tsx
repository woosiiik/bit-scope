/**
 * 선물 코인 선택 콤보박스
 *
 * FUTURES_COINS 목록에서 검색 가능한 드롭다운으로 선물 코인을 선택한다.
 * shadcn/ui Popover + Command가 없으므로 Button + 드롭다운으로 구현한다.
 *
 * @see 요구사항 2.1, 2.2, 2.3, 2.4
 */

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { FUTURES_COINS } from '@bitscope/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/lib/i18n/i18n-context';

interface FuturesCoinSelectorProps {
  /** 현재 선택된 코인 심볼 (예: 'BTCUSDT') */
  selectedCoin: string;
  /** 코인 선택 핸들러 */
  onSelectCoin: (coin: string) => void;
}

export function FuturesCoinSelector({
  selectedCoin,
  onSelectCoin,
}: FuturesCoinSelectorProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 현재 선택된 코인 정보
  const selectedCoinInfo = FUTURES_COINS.find((c) => c.symbol === selectedCoin);

  // 검색 필터링
  const filteredCoins = searchQuery.trim()
    ? FUTURES_COINS.filter((coin) =>
        coin.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        coin.baseAsset.toLowerCase().includes(searchQuery.toLowerCase()) ||
        coin.label.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : FUTURES_COINS;

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // 드롭다운 열릴 때 검색 입력에 포커스
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = useCallback(
    (coinSymbol: string) => {
      onSelectCoin(coinSymbol);
      setIsOpen(false);
      setSearchQuery('');
    },
    [onSelectCoin],
  );

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 트리거 버튼 */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="min-w-[160px] justify-between gap-2"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={t.futuresTrading.selectCoin}
      >
        <span className="font-semibold">
          {selectedCoinInfo?.label ?? selectedCoin}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </Button>

      {/* 드롭다운 목록 */}
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[220px] rounded-md border border-border bg-popover shadow-md">
          {/* 검색 입력 */}
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search
                className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                ref={inputRef}
                type="text"
                placeholder={t.futuresTrading.searchCoin}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-7 text-xs"
                aria-label={t.futuresTrading.searchCoin}
              />
            </div>
          </div>

          {/* 코인 목록 */}
          <div
            className="max-h-[280px] overflow-y-auto py-1"
            role="listbox"
            aria-label={t.futuresTrading.selectCoin}
          >
            {filteredCoins.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                {t.common.search} - 0
              </div>
            ) : (
              filteredCoins.map((coin) => (
                <button
                  key={coin.symbol}
                  type="button"
                  role="option"
                  aria-selected={coin.symbol === selectedCoin}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors ${
                    coin.symbol === selectedCoin ? 'bg-muted/50 font-medium' : ''
                  }`}
                  onClick={() => handleSelect(coin.symbol)}
                >
                  <span className="font-medium text-foreground">{coin.baseAsset}</span>
                  <span className="text-xs text-muted-foreground">{coin.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
