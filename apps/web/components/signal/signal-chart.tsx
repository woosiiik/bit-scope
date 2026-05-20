/**
 * 시그널 차트 (Lightweight Charts v5)
 *
 * Binance 캔들 데이터 위에 Long/Short 시그널 마커를 표시한다.
 */

'use client';

import { useEffect, useRef, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { SignalItem } from '@bitscope/shared';

/** Binance Kline 응답 */
type BinanceKline = [
  number, string, string, string, string, string,
  number, string, string, string, string, string,
];

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Binance에서 캔들 데이터를 가져온다 */
async function fetchBinanceCandles(symbol: string, interval: string = '1h', limit: number = 120): Promise<CandleData[]> {
  const pair = symbol.replace('/', '');
  const res = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) throw new Error('Binance API error');
  const data: BinanceKline[] = await res.json();

  return data.map((k) => ({
    time: Math.floor(k[0] / 1000),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
  }));
}

interface MarkerData {
  time: number;
  position: 'belowBar' | 'aboveBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown';
  text: string;
}

/**
 * 시그널을 마커 데이터로 변환.
 * 마커 시간을 가장 가까운 캔들 시간으로 스냅한다.
 */
function buildMarkers(signals: SignalItem[], candles: CandleData[]): MarkerData[] {
  if (candles.length === 0 || signals.length === 0) return [];

  const candleTimes = candles.map((c) => c.time);

  function snapToCandle(ts: number): number {
    let closest = candleTimes[0]!;
    let minDiff = Math.abs(ts - closest);
    for (const ct of candleTimes) {
      const diff = Math.abs(ts - ct);
      if (diff < minDiff) {
        minDiff = diff;
        closest = ct;
      }
    }
    return closest;
  }

  const seen = new Map<number, MarkerData>();

  for (const s of signals) {
    if (!s.signalAt) continue;
    const rawTs = Math.floor(new Date(s.signalAt).getTime() / 1000);
    const snapped = snapToCandle(rawTs);
    if (seen.has(snapped)) continue;

    const isLong = s.direction === 'LONG';
    seen.set(snapped, {
      time: snapped,
      position: isLong ? 'belowBar' : 'aboveBar',
      color: isLong ? '#22c55e' : '#ef4444',
      shape: isLong ? 'arrowUp' : 'arrowDown',
      text: `${s.direction} [${s.signalType}]`,
    });
  }

  return Array.from(seen.values()).sort((a, b) => a.time - b.time);
}

const INTERVALS = [
  { value: '15m', label: '15분' },
  { value: '1h', label: '1시간' },
  { value: '4h', label: '4시간' },
  { value: '1d', label: '1일' },
] as const;

interface SignalChartProps {
  coinSymbol: string;
  signals: SignalItem[];
}

export function SignalChart({ coinSymbol, signals }: SignalChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const [interval, setInterval] = useState('1h');

  const { data: candles, isLoading } = useQuery({
    queryKey: ['binance-candles', coinSymbol, interval],
    queryFn: () => fetchBinanceCandles(coinSymbol, interval, 500),
    staleTime: 60_000,
    retry: 2,
  });

  const markers = useMemo(() => buildMarkers(signals, candles ?? []), [signals, candles]);

  useEffect(() => {
    if (!containerRef.current || !candles || candles.length === 0) return;

    let chart: any;
    let series: any;

    async function initChart() {
      // 동적 import로 확실히 클라이언트에서만 로드
      const lc = await import('lightweight-charts');

      if (!containerRef.current) return;

      // 기존 차트 정리
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }

      chart = lc.createChart(containerRef.current, {
        layout: {
          background: { type: lc.ColorType.Solid, color: 'transparent' },
          textColor: '#9ca3af',
          fontSize: 11,
        },
        grid: {
          vertLines: { color: 'rgba(107, 114, 128, 0.1)' },
          horzLines: { color: 'rgba(107, 114, 128, 0.1)' },
        },
        crosshair: { mode: lc.CrosshairMode.Normal },
        rightPriceScale: { borderColor: 'rgba(107, 114, 128, 0.2)' },
        handleScroll: true,
        handleScale: true,
        timeScale: {
          borderColor: 'rgba(107, 114, 128, 0.2)',
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 5,
        },
        width: containerRef.current.clientWidth,
        height: 300,
      });

      series = chart.addSeries(lc.CandlestickSeries, {
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderUpColor: '#22c55e',
        borderDownColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      });

      series.setData(candles);

      // 마커 추가
      if (markers.length > 0) {
        markersRef.current = lc.createSeriesMarkers(series, markers);
      }

      chart.timeScale().fitContent();
      chartRef.current = chart;

      // 리사이즈
      const handleResize = () => {
        if (containerRef.current && chartRef.current) {
          chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
        }
      };
      window.addEventListener('resize', handleResize);

      // cleanup 등록
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }

    let cleanupResize: (() => void) | undefined;
    initChart().then((fn) => { cleanupResize = fn; });

    return () => {
      cleanupResize?.();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        markersRef.current = null;
      }
    };
  }, [candles, markers]);

  if (isLoading) {
    return (
      <div className="h-[300px] flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!candles || candles.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center">
        <p className="text-xs text-muted-foreground">차트 데이터를 불러올 수 없습니다</p>
      </div>
    );
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border">
        {INTERVALS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
              interval === opt.value
                ? 'bg-primary text-primary-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted'
            }`}
            onClick={() => setInterval(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div ref={containerRef} className="h-[300px] w-full" />
    </div>
  );
}
