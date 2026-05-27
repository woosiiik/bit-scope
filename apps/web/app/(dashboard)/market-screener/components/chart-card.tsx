'use client';

import { useState, type ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Info } from 'lucide-react';

interface ChartCardProps {
  title: string;
  description: string;
  children: ReactNode;
  /** 헤더 오른쪽에 추가할 컨트롤 (기간 선택, 토글 등) */
  extra?: ReactNode;
}

export function ChartCard({ title, description, children, extra }: ChartCardProps) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="text-xs font-medium text-foreground truncate">{title}</h3>
            <button
              type="button"
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowInfo(!showInfo)}
              aria-label={`${title} 설명`}
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </div>
          {extra && <div className="shrink-0">{extra}</div>}
        </div>
        {showInfo && (
          <div className="rounded-md bg-muted/50 border border-border p-2.5 text-[11px] text-muted-foreground leading-relaxed mb-2">
            {description}
          </div>
        )}
        <div className="h-[200px]">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}
