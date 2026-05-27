'use client';

export function Basis3mChart({ coin }: { data: unknown; coin: string }) {
  const supportedCoins = ['BTC', 'ETH'];

  if (!supportedCoins.includes(coin)) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-xs text-muted-foreground text-center">
          이 코인은 3M Basis를 지원하지 않습니다
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center">
      <p className="text-xs text-muted-foreground text-center">
        3M Basis 계산에는 분기 만기 선물 가격이 필요합니다.
        <br />
        Phase 2에서 Binance/OKX 분기 선물 데이터 연동 예정
      </p>
    </div>
  );
}
