'use client';

import { useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { CoinSelector } from './components/coin-selector';
import { ChartGrid } from './components/chart-grid';

export default function FuturesDashboardPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialCoin = searchParams.get('coin') ?? 'BTC';
  const [selectedCoin, setSelectedCoin] = useState(initialCoin);

  const handleCoinChange = useCallback((coin: string) => {
    setSelectedCoin(coin);
    const params = new URLSearchParams(searchParams.toString());
    params.set('coin', coin);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* 헤더 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">
          {t.futuresDashboard?.title ?? 'Multi-Exchange Futures'}
        </h1>
        <CoinSelector selectedCoin={selectedCoin} onCoinChange={handleCoinChange} />
      </div>

      {/* 12개 차트 그리드 */}
      <ChartGrid coin={selectedCoin} />
    </div>
  );
}
