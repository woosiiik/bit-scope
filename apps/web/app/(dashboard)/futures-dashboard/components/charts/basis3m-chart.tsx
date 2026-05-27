'use client';

export function Basis3mChart({ data, coin }: { data: unknown; coin: string }) {
  const supportedCoins = ['BTC', 'ETH'];

  if (!supportedCoins.includes(coin)) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-xs text-muted-foreground">
          이 코인은 3M Basis를 지원하지 않습니다
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-xs text-muted-foreground">3M Basis data loading...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center">
      <p className="text-xs text-muted-foreground">3M Basis chart (BTC/ETH only)</p>
    </div>
  );
}
