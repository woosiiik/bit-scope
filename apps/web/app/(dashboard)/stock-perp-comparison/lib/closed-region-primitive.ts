/**
 * 휴장 음영 series primitive (R4)
 *
 * lightweight-charts에는 recharts `ReferenceArea` 직접 대응이 없으므로, 연속 휴장
 * (marketOpen===false) 구간을 차트 배경에 반투명 사각형으로 그리는 v5 series primitive를
 * 구현한다. primitive는 차트가 좌표 변환과 재draw를 관장하므로 줌/팬/리사이즈 시 음영이
 * 라인·시간축과 항상 정합한다(R10.2, R12.2).
 *
 * - x 좌표: `chart.timeScale().timeToCoordinate(seconds)`로 구간 양끝 픽셀을 계산.
 * - y 좌표: priceToCoordinate를 쓰지 않고 pane 전체 높이(0~height)를 덮는다.
 * - zOrder: 'bottom' → 가격 라인 아래 레이어에 그린다(R4.7).
 * - 반투명 fill → 라인을 가리지 않는다.
 */

import type {
  IChartApi,
  ISeriesPrimitive,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { ClosedRegion } from './chart-data';

class ClosedRegionRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly chart: IChartApi | null,
    private readonly regions: ClosedRegion[],
    private readonly fillColor: string,
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    const chart = this.chart;
    if (chart === null || this.regions.length === 0) return;
    const timeScale = chart.timeScale();

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const hpr = scope.horizontalPixelRatio;
      const height = scope.bitmapSize.height;
      ctx.fillStyle = this.fillColor;

      for (const region of this.regions) {
        // ClosedRegion.x1/x2는 epoch ms → UTCTimestamp(초)로 변환
        const t1 = Math.floor(region.x1 / 1000) as UTCTimestamp;
        const t2 = Math.floor(region.x2 / 1000) as UTCTimestamp;
        const c1 = timeScale.timeToCoordinate(t1 as Time);
        const c2 = timeScale.timeToCoordinate(t2 as Time);
        if (c1 === null || c2 === null) continue;

        // 단일 포인트 휴장(x1===x2)도 최소 1px 폭으로 보이도록 보정
        const left = Math.round(Math.min(c1, c2) * hpr);
        const right = Math.round(Math.max(c1, c2) * hpr);
        const width = Math.max(1, right - left);
        ctx.fillRect(left, 0, width, height);
      }
    });
  }
}

class ClosedRegionPaneView implements IPrimitivePaneView {
  constructor(private readonly primitive: ClosedRegionPrimitive) {}

  zOrder(): PrimitivePaneViewZOrder {
    return 'bottom';
  }

  renderer(): IPrimitivePaneRenderer | null {
    if (!this.primitive.isVisible()) return null;
    return new ClosedRegionRenderer(
      this.primitive.getChart(),
      this.primitive.getRegions(),
      this.primitive.getFillColor(),
    );
  }
}

/** 휴장 음영을 그리는 series primitive. 외부에서 setter로 상태를 갱신한다. */
export class ClosedRegionPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private requestUpdate: (() => void) | null = null;
  private regions: ClosedRegion[];
  private visible: boolean;
  private fillColor: string;
  private readonly paneView: ClosedRegionPaneView;

  constructor(
    regions: ClosedRegion[] = [],
    visible = true,
    fillColor = 'rgba(148, 163, 184, 0.18)',
  ) {
    this.regions = regions;
    this.visible = visible;
    this.fillColor = fillColor;
    this.paneView = new ClosedRegionPaneView(this);
  }

  // --- ISeriesPrimitive 라이프사이클 ---

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart;
    this.requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.requestUpdate = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }

  // --- 내부 접근자 (paneView/renderer에서 사용) ---

  getChart(): IChartApi | null {
    return this.chart;
  }

  getRegions(): ClosedRegion[] {
    return this.regions;
  }

  getFillColor(): string {
    return this.fillColor;
  }

  isVisible(): boolean {
    return this.visible;
  }

  // --- 외부 setter (R4.3~R4.6) ---

  setRegions(regions: ClosedRegion[]): void {
    this.regions = regions;
    this.requestUpdate?.();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.requestUpdate?.();
  }

  setColor(fillColor: string): void {
    this.fillColor = fillColor;
    this.requestUpdate?.();
  }
}
