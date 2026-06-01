'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  LineSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type MouseEventParams,
} from 'lightweight-charts';
import { useTheme } from 'next-themes';
import type { ComparisonPoint } from '@bitscope/shared';
import {
  downsamplePreservingBoundaries,
  computeClosedRegions,
  toLineSeriesData,
  makeKstTickFormatter,
  buildTimeIndex,
  MAX_POINTS,
} from '../lib/chart-data';
import { ClosedRegionPrimitive } from '../lib/closed-region-primitive';
import { DivergencePanel } from './divergence-panel';

/** 주식 라인 색상 (KRW). 두 테마 모두에서 구분 가능한 고정 팔레트(R7.3). */
const STOCK_COLOR = '#2563eb'; // blue-600
/** perp 라인 색상 (KRW 변환). */
const PERP_COLOR = '#f59e0b'; // amber-500

interface ComparisonChartProps {
  /** 병합된 비교 시계열 (timestamp 오름차순) */
  points: ComparisonPoint[];
  /** 주식 범례 라벨 (페어의 nameKo) */
  stockLabel: string;
  /** perp 범례 라벨 (perp 코인) */
  perpLabel: string;
  /** 변환 기준 통화 (현재 KRW 고정) */
  baseCurrency?: 'KRW';
}

/** 테마/CSS 변수 기반 차트 색상 묶음. */
interface ChartColors {
  text: string;
  grid: string;
  shade: string;
  crosshair: string;
}

/**
 * 컨테이너의 CSS 변수에서 실제 색상값을 읽어 차트 색상을 구성한다 (R7.1, R7.2).
 *
 * `--border`/`--muted-foreground`는 CSS 변수 실제 계산값(테마별 자동 반영)을 사용하고,
 * 음영·crosshair는 두 테마에 어울리는 반투명 슬레이트 톤을 테마별로 고정한다.
 */
function readThemeColors(el: HTMLElement, isDark: boolean): ChartColors {
  const style = getComputedStyle(el);
  const border = style.getPropertyValue('--border').trim();
  const mutedFg = style.getPropertyValue('--muted-foreground').trim();
  return {
    text: mutedFg || (isDark ? '#9ca3af' : '#6b7280'),
    grid: border || (isDark ? 'rgba(148,163,184,0.12)' : 'rgba(100,116,139,0.12)'),
    shade: isDark ? 'rgba(148,163,184,0.14)' : 'rgba(100,116,139,0.16)',
    crosshair: isDark ? 'rgba(148,163,184,0.5)' : 'rgba(100,116,139,0.5)',
  };
}

/** Y축 KRW 포맷 (천 단위 한국어, R2.5/R2.6). */
function priceFormatter(value: number): string {
  return Math.round(value).toLocaleString('ko-KR');
}

/**
 * 주식·perp 오버레이 비교 차트 (lightweight-charts v5).
 *
 * - 주식/perp 라인을 단일 KRW 가격 축에 오버레이(R2).
 * - 주식 라인은 휴장 구간에서 끊기고(whitespace), perp 라인은 24h 연속(R3).
 * - 휴장 음영은 series primitive로 그리며 토글 가능(R4).
 * - KST 스마트 시간축 + 줌/팬(R5, R10), crosshair 호버 → 괴리 패널(R6, R9).
 * - 테마/CSS 변수 색상 정합(R7), 반응형 리사이즈 + dispose(R12, R1.5).
 */
export function ComparisonChart({
  points,
  stockLabel,
  perpLabel,
  baseCurrency = 'KRW',
}: ComparisonChartProps) {
  const { resolvedTheme } = useTheme();
  const [showClosedShading, setShowClosedShading] = useState(true);
  const [hovered, setHovered] = useState<ComparisonPoint | null>(null);

  // --- refs ---
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const stockSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const perpSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const primitiveRef = useRef<ClosedRegionPrimitive | null>(null);
  const timeIndexRef = useRef<Map<number, ComparisonPoint>>(new Map());
  /** 현재 가시 구간 폭(ms)에 맞는 KST 포맷터. 줌/팬 시 갱신, tickMarkFormatter가 위임 참조. */
  const formatterRef = useRef<(time: Time) => string>(() => '');

  // --- 데이터 파생 (경계 보존 다운샘플 → 시리즈/음영 데이터) ---
  const sampled = useMemo(
    () => (Array.isArray(points) ? downsamplePreservingBoundaries(points, MAX_POINTS) : []),
    [points],
  );
  const stockData = useMemo(() => toLineSeriesData(sampled, 'stockPrice'), [sampled]);
  const perpData = useMemo(() => toLineSeriesData(sampled, 'perpPrice'), [sampled]);
  const regions = useMemo(() => computeClosedRegions(sampled), [sampled]);

  const fullRangeMs = useMemo(() => {
    const first = sampled[0];
    const last = sampled[sampled.length - 1];
    if (sampled.length > 1 && first !== undefined && last !== undefined) {
      return last.timestamp - first.timestamp;
    }
    return 0;
  }, [sampled]);

  const isDark = resolvedTheme === 'dark';

  // --- Effect A: 차트 인스턴스 생성 (마운트 1회) ---
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const colors = readThemeColors(container, isDark);
    formatterRef.current = makeKstTickFormatter(0);

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: colors.text,
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: colors.crosshair, labelBackgroundColor: colors.crosshair },
        horzLine: { color: colors.crosshair, labelBackgroundColor: colors.crosshair },
      },
      rightPriceScale: { borderColor: colors.grid },
      timeScale: {
        borderColor: colors.grid,
        timeVisible: true,
        secondsVisible: false,
        // tickMarkFormatter는 위임 함수 — 줌/팬 시 formatterRef만 갱신하면 자동 반영(R5, R10.3)
        tickMarkFormatter: (time: Time) => formatterRef.current(time),
      },
      localization: { priceFormatter },
      handleScroll: true,
      handleScale: true,
    });

    const stockSeries = chart.addSeries(LineSeries, {
      color: STOCK_COLOR,
      lineWidth: 2,
      priceScaleId: 'right',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    const perpSeries = chart.addSeries(LineSeries, {
      color: PERP_COLOR,
      lineWidth: 2,
      priceScaleId: 'right',
      lastValueVisible: false,
      priceLineVisible: false,
    });

    const primitive = new ClosedRegionPrimitive([], true, colors.shade);
    stockSeries.attachPrimitive(primitive);

    chartRef.current = chart;
    stockSeriesRef.current = stockSeries;
    perpSeriesRef.current = perpSeries;
    primitiveRef.current = primitive;

    // crosshair 호버 → 괴리 패널 동기화 (R9, R6.1)
    const onCrosshair = (param: MouseEventParams) => {
      const t = param.time;
      if (t == null || param.point === undefined) {
        setHovered(null);
        return;
      }
      const key = typeof t === 'number' ? t : NaN;
      setHovered(timeIndexRef.current.get(key) ?? null);
    };
    chart.subscribeCrosshairMove(onCrosshair);

    // 줌/팬 시 가시 구간 폭에 맞춰 KST 포맷터 갱신 (R5, R10.3)
    const onVisibleRange = () => {
      const range = chart.timeScale().getVisibleRange();
      if (range === null) return;
      const from = typeof range.from === 'number' ? range.from : NaN;
      const to = typeof range.to === 'number' ? range.to : NaN;
      if (Number.isFinite(from) && Number.isFinite(to)) {
        formatterRef.current = makeKstTickFormatter((to - from) * 1000);
      }
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(onVisibleRange);

    // 반응형 리사이즈 (R12)
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined || chartRef.current === null) return;
      const { width, height } = entry.contentRect;
      chartRef.current.applyOptions({ width, height });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.unsubscribeCrosshairMove(onCrosshair);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(onVisibleRange);
      chart.remove();
      chartRef.current = null;
      stockSeriesRef.current = null;
      perpSeriesRef.current = null;
      primitiveRef.current = null;
    };
    // 마운트 1회만 생성. 테마/데이터 갱신은 별도 effect에서 처리한다.
  }, []);

  // --- Effect B: 데이터 주입 + 음영 구간 갱신 (페어/range 전환 포함, R11.3) ---
  useEffect(() => {
    const chart = chartRef.current;
    const stockSeries = stockSeriesRef.current;
    const perpSeries = perpSeriesRef.current;
    const primitive = primitiveRef.current;
    if (chart === null || stockSeries === null || perpSeries === null || primitive === null) {
      return;
    }

    stockSeries.setData(stockData);
    perpSeries.setData(perpData);
    primitive.setRegions(regions);
    timeIndexRef.current = buildTimeIndex(sampled);

    // 전체 구간 폭 기준 초기 포맷터 + 전체 보기 (R5, R10.4)
    formatterRef.current = makeKstTickFormatter(fullRangeMs);
    chart.timeScale().fitContent();
    setHovered(null);
  }, [stockData, perpData, regions, sampled, fullRangeMs]);

  // --- Effect C: 테마 전환 시 색상 갱신 (R7.2) ---
  useEffect(() => {
    const chart = chartRef.current;
    const container = containerRef.current;
    const primitive = primitiveRef.current;
    if (chart === null || container === null || primitive === null) return;

    const colors = readThemeColors(container, isDark);
    chart.applyOptions({
      layout: { textColor: colors.text },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      crosshair: {
        vertLine: { color: colors.crosshair, labelBackgroundColor: colors.crosshair },
        horzLine: { color: colors.crosshair, labelBackgroundColor: colors.crosshair },
      },
      rightPriceScale: { borderColor: colors.grid },
      timeScale: { borderColor: colors.grid },
    });
    primitive.setColor(colors.shade);
  }, [isDark]);

  // --- Effect D: 휴장 음영 토글 (R4.3~R4.6) ---
  useEffect(() => {
    primitiveRef.current?.setVisible(showClosedShading);
  }, [showClosedShading]);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="mb-1 flex items-center justify-between px-1">
        {/* 범례 (R2.4) */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: STOCK_COLOR }}
            />
            {stockLabel}(주식)
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: PERP_COLOR }}
            />
            {perpLabel}(perp)
          </span>
          <span className="text-muted-foreground/70">단위: {baseCurrency}</span>
        </div>

        {/* 휴장 음영 토글 (R4.3) */}
        <button
          type="button"
          onClick={() => setShowClosedShading((v) => !v)}
          aria-pressed={showClosedShading}
          className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
            showClosedShading
              ? 'border-border bg-muted text-foreground'
              : 'border-border bg-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          휴장 음영 {showClosedShading ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* 차트 영역 — crosshair 호버 패널을 절대배치로 띄운다 */}
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="h-full w-full" />
        <DivergencePanel point={hovered} />
      </div>
    </div>
  );
}
