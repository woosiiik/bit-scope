'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
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
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!search) return coins.slice(0, 50);
    const q = search.toUpperCase();
    return coins.filter((c) => c.baseAsset.includes(q)).slice(0, 50);
  }, [coins, search]);

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="outline"
        className="w-[160px] justify-between text-sm"
        onClick={() => setOpen(!open)}
      >
        {selectedCoin}/USDT
        <ChevronDown className="h-4 w-4 opacity-50" />
      </Button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-[200px] rounded-md border bg-popover p-2 shadow-md">
          <Input
            placeholder="Search coin..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs mb-2"
            autoFocus
          />
          <div className="max-h-[300px] overflow-y-auto space-y-0.5">
            {filtered.map((coin) => (
              <button
                key={coin.baseAsset}
                type="button"
                className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors ${
                  selectedCoin === coin.baseAsset ? 'bg-muted font-medium' : ''
                }`}
                onClick={() => {
                  onCoinChange(coin.baseAsset);
                  setOpen(false);
                  setSearch('');
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
