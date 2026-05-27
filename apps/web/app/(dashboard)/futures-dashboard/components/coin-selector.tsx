'use client';

import { useState, useMemo } from 'react';
import { useBinanceFuturesCoins } from '@/hooks/useBinanceFuturesCoins';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown } from 'lucide-react';

interface CoinSelectorProps {
  selectedCoin: string;
  onCoinChange: (coin: string) => void;
}

export function CoinSelector({ selectedCoin, onCoinChange }: CoinSelectorProps) {
  const { data: coins = [] } = useBinanceFuturesCoins();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return coins.slice(0, 50);
    const q = search.toUpperCase();
    return coins.filter((c) => c.baseAsset.includes(q)).slice(0, 50);
  }, [coins, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-[160px] justify-between text-sm">
          {selectedCoin}/USDT
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-2" align="start">
        <Input
          placeholder="Search coin..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-xs mb-2"
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
      </PopoverContent>
    </Popover>
  );
}
