/**
 * 크립토 라이프 멀티뷰 페이지
 *
 * 사용자가 원하는 위젯을 4분할(또는 N분할) 화면에 배치하여
 * 실시간으로 암호화폐 관련 정보를 한눈에 모니터링한다.
 *
 * 기본 레이아웃: 포트폴리오 / 뉴스 / 코인차트(BTC) / 김프
 */

'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { Settings2, RotateCcw, Plus, X } from 'lucide-react';

import type { GridLayout, WidgetConfig } from '@/lib/life/types';
import { GRID_LAYOUT_CLASSES, GRID_CELL_COUNTS } from '@/lib/life/constants';
import { useLifeLayoutStore } from '@/store/life-layout-store';
import { WidgetRenderer } from '@/components/life/widget-renderer';
import { WidgetSelector } from '@/components/life/widget-selector';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** 레이아웃 옵션 */
const LAYOUT_OPTIONS: { value: GridLayout; label: string }[] = [
  { value: '2x2', label: '2x2' },
  { value: '2x3', label: '2x3' },
  { value: '3x2', label: '3x2' },
  { value: '3x3', label: '3x3' },
  { value: '1x2', label: '1x2' },
  { value: '1x3', label: '1x3' },
];

export default function CryptoLifePage() {
  const { address } = useAccount();
  const walletAddress = address ?? '';
  const { config, loadConfig, setLayout, setWidget, resetToDefault } = useLifeLayoutStore();
  const [showSettings, setShowSettings] = useState(false);
  const [editingSlot, setEditingSlot] = useState<number | null>(null);

  useEffect(() => {
    if (walletAddress) {
      loadConfig(walletAddress);
    }
  }, [walletAddress, loadConfig]);

  const handleLayoutChange = (layout: GridLayout) => {
    if (walletAddress) setLayout(walletAddress, layout);
  };

  const handleWidgetSelect = (index: number, widgetConfig: WidgetConfig) => {
    if (walletAddress) setWidget(walletAddress, index, widgetConfig);
    setEditingSlot(null);
  };

  const handleRemoveWidget = (index: number) => {
    if (walletAddress) setWidget(walletAddress, index, null);
  };

  const handleReset = () => {
    if (walletAddress) resetToDefault(walletAddress);
    setShowSettings(false);
  };

  const cellCount = GRID_CELL_COUNTS[config.layout];

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] p-3 gap-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between shrink-0">
        <h1 className="text-base font-semibold text-foreground">Crypto Desk</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
            className="h-7 text-xs"
          >
            <Settings2 className="h-3.5 w-3.5 mr-1" />
            설정
          </Button>
        </div>
      </div>

      {/* 설정 패널 */}
      {showSettings && (
        <Card className="p-3 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground">레이아웃</span>
            <Button variant="ghost" size="sm" onClick={handleReset} className="h-6 text-[10px]">
              <RotateCcw className="h-3 w-3 mr-1" />
              기본값
            </Button>
          </div>
          <div className="flex gap-2">
            {LAYOUT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs border transition-colors',
                  config.layout === opt.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:bg-accent',
                )}
                onClick={() => handleLayoutChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* 그리드 */}
      <div className={cn('grid gap-3 flex-1 min-h-0', GRID_LAYOUT_CLASSES[config.layout])}>
        {Array.from({ length: cellCount }).map((_, index) => {
          const widget = config.widgets[index];

          // 위젯 선택 중
          if (editingSlot === index) {
            return (
              <Card key={index} className="overflow-auto">
                <WidgetSelector
                  onSelect={(cfg) => handleWidgetSelect(index, cfg)}
                  onCancel={() => setEditingSlot(null)}
                />
              </Card>
            );
          }

          // 위젯이 있는 셀
          if (widget) {
            return (
              <Card key={index} className="overflow-auto relative group">
                {/* 편집 오버레이 */}
                <div className="absolute top-1 right-12 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    className="p-1 rounded bg-background/80 border border-border hover:bg-accent"
                    onClick={() => setEditingSlot(index)}
                    title="위젯 변경"
                  >
                    <Settings2 className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className="p-1 rounded bg-background/80 border border-border hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => handleRemoveWidget(index)}
                    title="위젯 제거"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <WidgetRenderer config={widget} index={index} />
              </Card>
            );
          }

          // 빈 셀
          return (
            <Card
              key={index}
              className="overflow-hidden flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setEditingSlot(index)}
            >
              <div className="text-center">
                <Plus className="h-8 w-8 mx-auto text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground mt-1">위젯 추가</p>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
