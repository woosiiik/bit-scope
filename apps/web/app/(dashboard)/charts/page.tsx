/**
 * 차트 전용 페이지
 *
 * 최대 5개의 TradingView 차트를 동시에 표시한다.
 * 암호화폐, 나스닥, 코스피, 금, WTI 등을 지원한다.
 */

'use client';

import { useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Plus, X, RotateCcw } from 'lucide-react';

import { ALL_TV_SYMBOLS, CHART_INTERVALS } from '@/lib/life/constants';
import { useChartsLayoutStore } from '@/store/charts-layout-store';
import { TradingViewChart } from '@/components/life/widgets/tradingview-chart-widget';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** 차트 수에 따른 그리드 클래스 */
function getGridClass(count: number): string {
  switch (count) {
    case 1: return 'grid-cols-1';
    case 2: return 'grid-cols-1 md:grid-cols-2';
    case 3: return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
    case 4: return 'grid-cols-1 md:grid-cols-2';
    case 5: return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
    case 6: return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
    default: return 'grid-cols-1 md:grid-cols-2';
  }
}

export default function ChartsPage() {
  const { address } = useAccount();
  const walletAddress = address ?? '';
  const { config, loadConfig, addChart, updateChart, removeChart, resetToDefault } = useChartsLayoutStore();

  useEffect(() => {
    if (walletAddress) {
      loadConfig(walletAddress);
    }
  }, [walletAddress, loadConfig]);

  const handleAddChart = () => {
    if (!walletAddress || config.charts.length >= 5) return;
    addChart(walletAddress, { symbol: 'BINANCE:BTCUSDT', interval: '60' });
  };

  const handleSymbolChange = (index: number, symbol: string) => {
    if (!walletAddress) return;
    updateChart(walletAddress, index, { ...config.charts[index]!, symbol });
  };

  const handleIntervalChange = (index: number, interval: string) => {
    if (!walletAddress) return;
    updateChart(walletAddress, index, { ...config.charts[index]!, interval });
  };

  const handleRemove = (index: number) => {
    if (!walletAddress) return;
    removeChart(walletAddress, index);
  };

  const handleReset = () => {
    if (!walletAddress) return;
    resetToDefault(walletAddress);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] p-3 gap-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between shrink-0">
        <h1 className="text-base font-semibold text-foreground">Charts</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-7 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            초기화
          </Button>
          <Button
            size="sm"
            onClick={handleAddChart}
            disabled={config.charts.length >= 6}
            className="h-7 text-xs"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            차트 추가 ({config.charts.length}/6)
          </Button>
        </div>
      </div>

      {/* 차트 그리드 */}
      {config.charts.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">차트가 없습니다</p>
            <Button size="sm" className="mt-2" onClick={handleAddChart}>
              <Plus className="h-4 w-4 mr-1" />
              차트 추가
            </Button>
          </div>
        </div>
      ) : (
        <div className={cn('grid gap-3 flex-1 min-h-0', getGridClass(config.charts.length))}>
          {config.charts.map((chart, index) => (
            <Card key={index} className="overflow-hidden flex flex-col min-h-[300px]">
              {/* 차트 컨트롤 */}
              <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border shrink-0">
                <select
                  value={chart.symbol}
                  onChange={(e) => handleSymbolChange(index, e.target.value)}
                  className="h-7 rounded border border-input bg-transparent px-2 text-xs flex-1"
                >
                  <optgroup label="암호화폐 (Binance)">
                    {ALL_TV_SYMBOLS.filter((s) => s.symbol.startsWith('BINANCE')).map((s) => (
                      <option key={s.symbol} value={s.symbol}>{s.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="암호화폐 (Upbit)">
                    {ALL_TV_SYMBOLS.filter((s) => s.symbol.startsWith('UPBIT')).map((s) => (
                      <option key={s.symbol} value={s.symbol}>{s.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="전통 자산">
                    {ALL_TV_SYMBOLS.filter((s) => !s.symbol.startsWith('BINANCE') && !s.symbol.startsWith('UPBIT')).map((s) => (
                      <option key={s.symbol} value={s.symbol}>{s.label}</option>
                    ))}
                  </optgroup>
                </select>

                <select
                  value={chart.interval}
                  onChange={(e) => handleIntervalChange(index, e.target.value)}
                  className="h-7 w-20 rounded border border-input bg-transparent px-2 text-xs"
                >
                  {CHART_INTERVALS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  className="p-1 rounded hover:bg-destructive hover:text-destructive-foreground transition-colors"
                  title="차트 제거"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* 차트 */}
              <div className="flex-1 min-h-0">
                <TradingViewChart
                  symbol={chart.symbol}
                  interval={chart.interval}
                  containerId={`charts-page-${index}`}
                />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
