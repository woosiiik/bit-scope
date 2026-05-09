/**
 * 위젯 선택기
 *
 * 그리드 셀에 배치할 위젯을 선택하는 UI를 제공한다.
 */

'use client';

import { useState } from 'react';
import {
  LayoutDashboard,
  Newspaper,
  BarChart3,
  TrendingUp,
  LineChart,
  Plus,
} from 'lucide-react';

import type { WidgetConfig, WidgetType } from '@/lib/life/types';
import { WIDGET_METAS, ALL_TV_SYMBOLS, CHART_INTERVALS, MARKET_EXCHANGES, PREMIUM_EXCHANGES } from '@/lib/life/constants';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Newspaper,
  BarChart3,
  TrendingUp,
  LineChart,
};

interface WidgetSelectorProps {
  onSelect: (config: WidgetConfig) => void;
  onCancel: () => void;
}

export function WidgetSelector({ onSelect, onCancel }: WidgetSelectorProps) {
  const [selectedType, setSelectedType] = useState<WidgetType | null>(null);
  const [chartSymbol, setChartSymbol] = useState('BINANCE:BTCUSDT');
  const [chartInterval, setChartInterval] = useState('60');
  const [exchange, setExchange] = useState('');

  // 위젯 타입 변경 시 기본 거래소 세팅
  const handleTypeSelect = (type: WidgetType) => {
    setSelectedType(type);
    if (type === 'market') setExchange('binance');
    else if (type === 'premium') setExchange('upbit');
    else setExchange('');
  };

  const handleConfirm = () => {
    if (!selectedType) return;

    if (selectedType === 'chart') {
      onSelect({ type: 'chart', chartSymbol, chartInterval });
    } else if (selectedType === 'market' || selectedType === 'premium') {
      onSelect({ type: selectedType, exchange });
    } else {
      onSelect({ type: selectedType });
    }
  };

  return (
    <div className="p-3 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground">위젯 선택</p>

      {/* 위젯 종류 */}
      <div className="grid grid-cols-2 gap-2">
        {WIDGET_METAS.map((meta) => {
          const Icon = ICON_MAP[meta.icon] ?? Plus;
          return (
            <button
              key={meta.type}
              type="button"
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors',
                selectedType === meta.type
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:bg-accent',
              )}
              onClick={() => handleTypeSelect(meta.type)}
            >
              <Icon className="h-4 w-4" />
              {meta.labelKo}
            </button>
          );
        })}
      </div>

      {/* 차트 설정 (차트 선택 시) */}
      {selectedType === 'chart' && (
        <div className="space-y-2">
          <select
            value={chartSymbol}
            onChange={(e) => setChartSymbol(e.target.value)}
            className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
          >
            <optgroup label="암호화폐 (Binance)">
              {ALL_TV_SYMBOLS.filter((s) => s.symbol.startsWith('BINANCE')).map((s) => (
                <option key={s.symbol} value={s.symbol}>{s.label}</option>
              ))}
            </optgroup>
            <optgroup label="암호화폐 (Upbit KRW)">
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
            value={chartInterval}
            onChange={(e) => setChartInterval(e.target.value)}
            className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
          >
            {CHART_INTERVALS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* 마켓 거래소 선택 */}
      {selectedType === 'market' && (
        <div className="space-y-2">
          <p className="text-[10px] text-muted-foreground">거래소</p>
          <div className="flex gap-1.5 flex-wrap">
            {MARKET_EXCHANGES.map((ex) => (
              <button
                key={ex.value}
                type="button"
                className={cn(
                  'px-2.5 py-1 rounded text-xs border transition-colors',
                  exchange === ex.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:bg-accent',
                )}
                onClick={() => setExchange(ex.value)}
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 김프 기준 거래소 선택 */}
      {selectedType === 'premium' && (
        <div className="space-y-2">
          <p className="text-[10px] text-muted-foreground">기준 국내 거래소 (vs 바이낸스)</p>
          <div className="flex gap-1.5 flex-wrap">
            {PREMIUM_EXCHANGES.map((ex) => (
              <button
                key={ex.value}
                type="button"
                className={cn(
                  'px-2.5 py-1 rounded text-xs border transition-colors',
                  exchange === ex.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:bg-accent',
                )}
                onClick={() => setExchange(ex.value)}
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 확인/취소 */}
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel} className="h-7 text-xs">
          취소
        </Button>
        <Button size="sm" onClick={handleConfirm} disabled={!selectedType} className="h-7 text-xs">
          적용
        </Button>
      </div>
    </div>
  );
}
