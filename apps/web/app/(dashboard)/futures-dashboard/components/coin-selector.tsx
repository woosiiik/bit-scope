'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useBinanceFuturesCoins } from '@/hooks/useBinanceFuturesCoins';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown } from 'lucide-react';

interface CoinSelectorProps {
  selectedCoin: string;
  onCoinChange: (coin: string) => void;
}

export function CoinSelector({ selectedCoin, onCoinChange }: CoinSelectorProps) {
  const { data: coins = [] } = useBinanceFuturesCoins();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!search) return coins.slice(0, 50);
    const q = search.toUpperCase();
    return coins.filter((c) => c.baseAsset.includes(q)).slice(0, 50);
  }, [coins, search]);

  const close = useCallback(() => {
    setOpen(false);
    setSearch('');
    setHighlightIdx(0);
  }, []);

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, close]);

  // 키보드 네비게이션
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIdx((i) => Math.max(i - 1, 0));
        break;
      case 'Enter': {
        e.preventDefault();
        const coin = filtered[highlightIdx];
        if (coin) {
          onCoinChange(coin.baseAsset);
          close();
        }
        break;
      }
      case 'Escape':
        e.preventDefault();
        close();
        break;
    }
  }, [open, filtered, highlightIdx, onCoinChange, close]);

  // 하이라이트 스크롤
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[highlightIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx]);

  // 검색어 변경 시 하이라이트 리셋
  useEffect(() => {
    setHighlightIdx(0);
  }, [search]);

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      <Button
        variant="outline"
        className="w-[160px] justify-between text-sm"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {selectedCoin}/USDT
        <ChevronDown className="h-4 w-4 opacity-50" />
      </Button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-[200px] rounded-md border bg-popover p-2 shadow-md" role="listbox">
          <Input
            placeholder="Search coin..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs mb-2"
            autoFocus
          />
          <div ref={listRef} className="max-h-[300px] overflow-y-auto space-y-0.5">
            {filtered.map((coin, idx) => (
              <button
                key={coin.baseAsset}
                type="button"
                role="option"
                aria-selected={selectedCoin === coin.baseAsset}
                className={`w-full text-left px-2 py-1.5 text-xs rounded transition-colors ${
                  idx === highlightIdx ? 'bg-muted' : ''
                } ${selectedCoin === coin.baseAsset ? 'font-medium' : ''} hover:bg-muted`}
                onClick={() => {
                  onCoinChange(coin.baseAsset);
                  close();
                }}
              >
                {coin.label}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No results</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
