'use client';

export function LiquidationsChart() {
  return (
    <div className="h-full flex items-center justify-center">
      <p className="text-xs text-muted-foreground text-center">
        Liquidations 데이터는 WebSocket 실시간 수집이 필요합니다.
        <br />
        Phase 2에서 구현 예정
      </p>
    </div>
  );
}
