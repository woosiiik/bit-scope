# Velo Market Screener - 설계 문서 (v2)

## 1. 개요

Velo Market Screener는 6개 거래소(Binance, Bybit, OKX, Gate.io, Bitget, Hyperliquid)의 250+ 선물 코인 데이터를 집계하여 마켓 와이드 스크리너를 제공하는 Phase 1 프론트엔드 중심 기능이다.

**설계 목표:**
- 기존 `futures-dashboard`의 **개별 코인** 심층 분석 vs 본 스크리너의 **전체 시장** 개요라는 상호보완적 구조
- 기존 Route Handler 패턴(`Promise.allSettled`, normalizer, InMemoryCache)을 최대한 재사용
- 벌크 ticker API 1회 호출로 전 코인 데이터 수집 (코인별 개별 호출 지양)
- 정적 매핑(시가총액/섹터)으로 외부 API 의존성 제거

**범위:**
- 스크리너 테이블 (다중 탭 필터 + 정렬 + 검색)
- 4개 차트 위젯 (Return Buckets, Market Volume, Total OI, Sector Performance)
- Next.js Route Handler 프록시 (`/api/market-screener/tickers`)
- 정적 매핑 데이터 (`packages/shared`)

---

## 2. 아키텍처 설계

### 2.1 시스템 아키텍처 다이어그램

```mermaid
graph TB
    subgraph Client["클라이언트 (브라우저)"]
        A[MarketScreenerPage] --> B[useMarketScreenerTickers Hook]
        A --> C[ScreenerTable]
        A --> D[ChartWidgets]
        D --> D1[ReturnBucketsChart]
        D --> D2[MarketVolumeChart]
        D --> D3[TotalOIChart]
        D --> D4[SectorPerformanceChart]
        C --> E[TabFilters]
        C --> F[SearchInput]
    end

    subgraph Server["Next.js Route Handler"]
        G["/api/market-screener/tickers"] --> H[BulkTickerFetcher]
        H --> I[SymbolNormalizer]
        I --> J[CoinAggregator]
        G --> K[InMemoryCache]
        
        L["/api/market-screener/new-listings"] --> M[InstrumentFetcher]
    end

    subgraph Exchanges["거래소 공개 API (인증 불필요)"]
        N1[Binance /fapi/v1/ticker/24hr]
        N2[Bybit /v5/market/tickers]
        N3[OKX /api/v5/market/tickers]
        N4[Gate.io /api/v4/futures/usdt/tickers]
        N5[Bitget /api/v2/mix/market/tickers]
        N6[Hyperliquid POST /info]
    end

    subgraph SharedPkg["packages/shared"]
        P1[COIN_MARKET_CAP_MAP]
        P2[COIN_SECTOR_MAP]
        P3[EXCHANGE_COLORS]
        P4[MarketScreener Types]
    end

    B -->|TanStack Query 60s refetch| G
    H -->|Promise.allSettled| N1 & N2 & N3 & N4 & N5 & N6
    A -.->|정적 import| P1 & P2 & P3
```

### 2.2 데이터 흐름 다이어그램

```mermaid
graph LR
    subgraph Phase1["데이터 수집 (Route Handler)"]
        A1[6개 거래소 벌크 ticker API] -->|Promise.allSettled| A2[Raw Responses]
        A2 --> A3[거래소별 Normalizer]
        A3 --> A4["NormalizedTicker[]<br/>(거래소별 전 코인)"]
    end

    subgraph Phase2["심볼 정규화 & 집계"]
        A4 --> B1[SymbolNormalizer]
        B1 -->|"BTCUSDT → BTC<br/>BTC-USDT-SWAP → BTC<br/>BTC_USDT → BTC"| B2["Map&lt;symbol, ExchangeTicker[]&gt;"]
        B2 --> B3[CoinAggregator]
        B3 -->|"가격: 거래량 가중평균<br/>거래량/OI: 합산<br/>펀딩: OI 가중평균"| B4["AggregatedCoin[]"]
    end

    subgraph Phase3["클라이언트 가공"]
        B4 --> C1{필터/정렬}
        C1 -->|Top Gainers| C2[변화율 내림차순]
        C1 -->|Large Cap| C3[COIN_MARKET_CAP_MAP 필터]
        C1 -->|DeFi 섹터| C4[COIN_SECTOR_MAP 필터]
        B4 --> C5[Return Buckets 계산]
        B4 --> C6[거래소별 Volume/OI 합산]
        B4 --> C7[섹터별 평균 수익률]
    end
```

### 2.3 기존 패턴과의 관계

| 측면 | futures-dashboard (기존) | market-screener (신규) |
|---|---|---|
| **데이터 단위** | 개별 코인 (BTC, ETH...) | 전체 코인 (250+) |
| **API 호출 방식** | 코인별 개별 API 호출 | 벌크 ticker API 1회 호출 |
| **Route Handler** | `/api/futures-dashboard/[indicator]?coin=BTC` | `/api/market-screener/tickers` |
| **캐시 전략** | 지표별 TTL (30s ~ 10m) | 단일 TTL 30s |
| **정규화** | 지표별 normalizer | 벌크 ticker 전용 normalizer |
| **공통 재사용** | - | `InMemoryCache`, `EXCHANGE_COLORS`, `FuturesExchangeType` |

**설계 결정: 별도 Route Handler 신설**

기존 `futures-dashboard`의 `fetch-indicator.ts`는 **코인별 개별 API 호출** 패턴이다 (`buildIndicatorUrl(exchange, indicator, coin)`). 마켓 스크리너는 **벌크 ticker API 1회 호출**로 전 코인 데이터를 가져오는 완전히 다른 패턴이므로, 기존 코드를 억지로 확장하지 않고 `/api/market-screener/` 아래에 전용 Route Handler를 신설한다. 다만 `InMemoryCache`, `EXCHANGE_COLORS`, `FuturesExchangeType` 등 공통 인프라는 재사용한다.

---

## 3. 컴포넌트 설계

### 3.1 Route Handler 계층

#### 3.1.1 `BulkTickerFetcher`

- **위치:** `apps/web/app/api/market-screener/_lib/bulk-ticker-fetcher.ts`
- **책임:** 6개 거래소의 벌크 ticker API를 병렬 호출하여 raw 응답을 수집
- **인터페이스:**
  ```typescript
  async function fetchAllBulkTickers(): Promise<BulkTickerResult>
  
  interface BulkTickerResult {
    tickers: Map<FuturesExchangeType, RawExchangeTicker[]>;
    errors: Partial<Record<FuturesExchangeType, string>>;
    timestamp: number;
  }
  ```
- **의존성:** `EXCHANGE_CONFIGS` (baseUrl), `Promise.allSettled`

#### 3.1.2 `BulkTickerNormalizer`

- **위치:** `apps/web/app/api/market-screener/_lib/bulk-ticker-normalizer.ts`
- **책임:** 각 거래소의 서로 다른 응답 포맷을 `NormalizedTicker` 통일 스키마로 변환
- **인터페이스:**
  ```typescript
  function normalizeBulkTickers(
    exchange: FuturesExchangeType,
    rawData: unknown
  ): NormalizedTicker[]
  
  interface NormalizedTicker {
    exchange: FuturesExchangeType;
    symbol: string;          // 정규화된 심볼 (예: "BTC")
    rawSymbol: string;       // 원본 심볼 (예: "BTCUSDT")
    price: number;           // 현재가 (USD)
    priceChange24h: number;  // 24h 변화율 (소수, 예: 0.05 = 5%)
    volume24h: number;       // 24h 거래량 (USD)
    openInterest: number;    // OI (USD), 없으면 0
    fundingRate: number;     // 펀딩비율 (8h 기준 소수), 없으면 0
  }
  ```
- **의존성:** `normalizeSymbol()` (심볼 정규화 유틸)

#### 3.1.3 `SymbolNormalizer`

- **위치:** `apps/web/app/api/market-screener/_lib/symbol-normalizer.ts`
- **책임:** 거래소별 다른 심볼 형식을 공통 base asset 형식으로 변환
- **인터페이스:**
  ```typescript
  function normalizeSymbol(exchange: FuturesExchangeType, rawSymbol: string): string | null
  ```
- **변환 규칙:**
  - Binance: `"BTCUSDT"` -> USDT 접미사 제거 -> `"BTC"`
  - Bybit: `"BTCUSDT"` -> USDT 접미사 제거 -> `"BTC"`
  - OKX: `"BTC-USDT-SWAP"` -> `-` 분할 후 첫 번째 -> `"BTC"`
  - Gate.io: `"BTC_USDT"` -> `_` 분할 후 첫 번째 -> `"BTC"`
  - Bitget: `"BTCUSDT"` -> USDT 접미사 제거 -> `"BTC"`
  - Hyperliquid: `"BTC"` -> 그대로 -> `"BTC"`
- **필터:** USDT-마진 선물만 통과, COIN-마진/기타 제외. `null` 반환 시 해당 항목 스킵.

#### 3.1.4 `CoinAggregator`

- **위치:** `apps/web/app/api/market-screener/_lib/coin-aggregator.ts`
- **책임:** 동일 심볼의 거래소별 데이터를 하나의 집계 행으로 병합
- **인터페이스:**
  ```typescript
  function aggregateCoins(
    allTickers: NormalizedTicker[]
  ): AggregatedCoin[]
  
  interface AggregatedCoin {
    symbol: string;                  // "BTC"
    price: number;                   // 거래량 가중 평균 가격
    priceChange24h: number;          // 거래량 가중 평균 변화율
    volume24h: number;               // 전 거래소 합산 거래량
    openInterest: number;            // 전 거래소 합산 OI
    fundingRate: number;             // OI 가중 평균 펀딩비율
    exchanges: ExchangeBreakdown[];  // 거래소별 개별 데이터
  }
  
  interface ExchangeBreakdown {
    exchange: FuturesExchangeType;
    price: number;
    priceChange24h: number;
    volume24h: number;
    openInterest: number;
    fundingRate: number;
  }
  ```
- **집계 공식:**
  - `price` = Sum(거래소_i.price * 거래소_i.volume24h) / Sum(거래소_i.volume24h)
  - `volume24h` = Sum(거래소_i.volume24h)
  - `openInterest` = Sum(거래소_i.openInterest)
  - `fundingRate` = Sum(거래소_i.fundingRate * 거래소_i.openInterest) / Sum(거래소_i.openInterest)
  - `priceChange24h` = Sum(거래소_i.priceChange24h * 거래소_i.volume24h) / Sum(거래소_i.volume24h)

### 3.2 프론트엔드 컴포넌트 계층

#### 3.2.1 `MarketScreenerPage`

- **위치:** `apps/web/app/(dashboard)/market-screener/page.tsx`
- **책임:** 페이지 레이아웃, 상태 관리, 하위 컴포넌트 조합
- **인터페이스:**
  ```typescript
  // 페이지 상태
  interface ScreenerState {
    sortTab: SortTab;              // 'topGainers' | 'topLosers' | 'topVolume' | 'newListings'
    capFilter: CapFilter;          // 'all' | 'large' | 'mid' | 'small'
    sectorFilter: SectorFilter;    // 'all' | 'defi' | 'l1' | 'l2' | 'metaverse' | 'meme' | 'dino' | 'ai'
    searchQuery: string;
    chartPeriod: ChartPeriod;      // '1d' | '1w' | '1m'
  }
  ```
- **의존성:** `useMarketScreenerTickers`, `useNewListings`, `COIN_MARKET_CAP_MAP`, `COIN_SECTOR_MAP`

#### 3.2.2 `ScreenerTable`

- **위치:** `apps/web/app/(dashboard)/market-screener/components/screener-table.tsx`
- **책임:** 250+ 코인 데이터를 가상화된 테이블로 렌더링
- **인터페이스:**
  ```typescript
  interface ScreenerTableProps {
    coins: AggregatedCoin[];
    sortColumn: SortColumn;
    sortDirection: 'asc' | 'desc';
    onSort: (column: SortColumn) => void;
    onCoinClick: (symbol: string) => void;
    isLoading: boolean;
  }
  ```
- **의존성:** 없음 (순수 프레젠테이션)
- **성능:** `@tanstack/react-virtual`로 가상 스크롤 구현 (250+ 행 렌더링 최적화)

#### 3.2.3 `TabFilterBar`

- **위치:** `apps/web/app/(dashboard)/market-screener/components/tab-filter-bar.tsx`
- **책임:** 3개 탭 그룹(정렬/시가총액/섹터) 렌더링 및 상태 전달
- **인터페이스:**
  ```typescript
  interface TabFilterBarProps {
    sortTab: SortTab;
    onSortTabChange: (tab: SortTab) => void;
    capFilter: CapFilter;
    onCapFilterChange: (filter: CapFilter) => void;
    sectorFilter: SectorFilter;
    onSectorFilterChange: (filter: SectorFilter) => void;
  }
  ```
- **의존성:** shadcn/ui `Tabs` 컴포넌트

#### 3.2.4 `SearchInput`

- **위치:** `apps/web/app/(dashboard)/market-screener/components/search-input.tsx`
- **책임:** 심볼/이름 검색 입력 (300ms debounce)
- **인터페이스:**
  ```typescript
  interface SearchInputProps {
    value: string;
    onChange: (query: string) => void;
  }
  ```

#### 3.2.5 `ChartWidgetGrid`

- **위치:** `apps/web/app/(dashboard)/market-screener/components/chart-widget-grid.tsx`
- **책임:** 4개 차트 위젯을 반응형 그리드로 배치
- **인터페이스:**
  ```typescript
  interface ChartWidgetGridProps {
    coins: AggregatedCoin[];
    period: ChartPeriod;
    onPeriodChange: (period: ChartPeriod) => void;
  }
  ```

#### 3.2.6 차트 위젯 (4개)

| 컴포넌트 | 위치 | 차트 타입 | 데이터 소스 |
|---|---|---|---|
| `ReturnBucketsChart` | `components/charts/return-buckets-chart.tsx` | Recharts BarChart | `coins[].priceChange24h` 구간 분류 |
| `MarketVolumeChart` | `components/charts/market-volume-chart.tsx` | Recharts BarChart | `coins[].exchanges[].volume24h` 거래소별 합산 |
| `TotalOIChart` | `components/charts/total-oi-chart.tsx` | Recharts BarChart | `coins[].exchanges[].openInterest` 거래소별 합산 |
| `SectorPerformanceChart` | `components/charts/sector-performance-chart.tsx` | Recharts BarChart | `COIN_SECTOR_MAP` + `coins[].priceChange24h` 섹터 평균 |

### 3.3 Hooks

#### 3.3.1 `useMarketScreenerTickers`

- **위치:** `apps/web/hooks/useMarketScreenerTickers.ts`
- **책임:** TanStack Query로 `/api/market-screener/tickers` 호출, 캐싱, 자동 갱신
- **인터페이스:**
  ```typescript
  function useMarketScreenerTickers(options?: {
    enabled?: boolean;
  }): UseQueryResult<MarketScreenerResponse>
  ```
- **TanStack Query 설정:**
  - `staleTime`: 30_000 (30초)
  - `refetchInterval`: 60_000 (60초)
  - `refetchOnWindowFocus`: true
  - `refetchIntervalInBackground`: false (탭 비활성 시 중지)
  - `retry`: 2
  - `placeholderData`: keepPreviousData

#### 3.3.2 `useNewListings`

- **위치:** `apps/web/hooks/useNewListings.ts`
- **책임:** `/api/market-screener/new-listings` 호출, 신규 상장 코인 목록 제공
- **인터페이스:**
  ```typescript
  function useNewListings(): UseQueryResult<NewListingCoin[]>
  ```
- **TanStack Query 설정:**
  - `staleTime`: 3_600_000 (1시간, 빈번한 갱신 불필요)
  - `refetchInterval`: 없음 (수동 갱신만)

#### 3.3.3 `useScreenerFilter`

- **위치:** `apps/web/hooks/useScreenerFilter.ts`
- **책임:** 필터/정렬/검색 로직을 순수 함수로 분리한 커스텀 훅
- **인터페이스:**
  ```typescript
  function useScreenerFilter(
    coins: AggregatedCoin[],
    state: ScreenerState,
    newListings: NewListingCoin[]
  ): FilteredResult
  
  interface FilteredResult {
    filteredCoins: AggregatedCoin[];
    totalCount: number;
    filteredCount: number;
  }
  ```
- **의존성:** `COIN_MARKET_CAP_MAP`, `COIN_SECTOR_MAP` (정적 import), `useMemo`로 최적화

---

## 4. 데이터 모델

### 4.1 핵심 데이터 구조 정의

```typescript
// ===== packages/shared/src/types/market-screener.ts =====

import type { FuturesExchangeType } from './futures';

/** 정렬 탭 종류 */
export type SortTab = 'topGainers' | 'topLosers' | 'topVolume' | 'newListings';

/** 시가총액 필터 */
export type CapFilter = 'all' | 'large' | 'mid' | 'small';

/** 섹터 필터 */
export type SectorFilter = 'all' | 'defi' | 'l1' | 'l2' | 'metaverse' | 'meme' | 'dino' | 'ai';

/** 차트 기간 (Return Buckets, Sector Performance용) */
export type ChartPeriod = '1d' | '1w' | '1m';

/** 시가총액 분류 */
export type MarketCapTier = 'large' | 'mid' | 'small';

/** 섹터 종류 */
export type CoinSector = 'defi' | 'l1' | 'l2' | 'metaverse' | 'meme' | 'dino' | 'ai';

/** 정규화된 개별 거래소 ticker */
export interface NormalizedTicker {
  exchange: FuturesExchangeType;
  symbol: string;          // 정규화된 심볼 (예: "BTC")
  rawSymbol: string;       // 원본 심볼 (예: "BTCUSDT")
  price: number;
  priceChange24h: number;  // 소수 (0.05 = +5%)
  volume24h: number;       // USD
  openInterest: number;    // USD, 없으면 0
  fundingRate: number;     // 8h 기준 소수, 없으면 0
}

/** 거래소별 세부 데이터 */
export interface ExchangeBreakdown {
  exchange: FuturesExchangeType;
  price: number;
  priceChange24h: number;
  volume24h: number;
  openInterest: number;
  fundingRate: number;
}

/** 집계된 코인 데이터 (테이블 1행) */
export interface AggregatedCoin {
  symbol: string;                  // "BTC"
  price: number;                   // 거래량 가중 평균
  priceChange24h: number;          // 거래량 가중 평균
  volume24h: number;               // 합산
  openInterest: number;            // 합산
  fundingRate: number;             // OI 가중 평균
  exchangeCount: number;           // 데이터 제공 거래소 수
  exchanges: ExchangeBreakdown[];  // 거래소별 개별
}

/** 마켓 스크리너 API 응답 */
export interface MarketScreenerResponse {
  coins: AggregatedCoin[];
  errors: Partial<Record<FuturesExchangeType, string>>;
  timestamp: number;
  exchangeCount: number;           // 성공한 거래소 수
}

/** 신규 상장 코인 정보 */
export interface NewListingCoin {
  symbol: string;
  exchange: FuturesExchangeType;
  listDate: string;                // ISO 날짜 (예: "2026-05-20")
  daysAgo: number;                 // 상장 후 경과일
}

/** Return Bucket 데이터 (히스토그램 1개 막대) */
export interface ReturnBucket {
  rangeLabel: string;     // 예: "-10% ~ -5%"
  rangeMin: number;       // -0.10
  rangeMax: number;       // -0.05
  count: number;          // 해당 구간 코인 수
  coins: Array<{          // 해당 구간 코인 목록
    symbol: string;
    change: number;
  }>;
}

/** 거래소별 총량 데이터 (Volume/OI 바 차트) */
export interface ExchangeTotal {
  exchange: FuturesExchangeType;
  total: number;          // USD
  color: string;          // EXCHANGE_COLORS[exchange]
}

/** 섹터별 성과 데이터 */
export interface SectorPerformance {
  sector: CoinSector;
  label: string;          // 표시 이름 (예: "DeFi")
  avgReturn: number;      // 평균 수익률 (소수)
  coinCount: number;      // 포함 코인 수
  coins: string[];        // 구성 코인 심볼 목록
}
```

### 4.2 정적 매핑 데이터 구조

```typescript
// ===== packages/shared/src/constants/market-screener.ts =====

import type { MarketCapTier, CoinSector } from '../types/market-screener';

/** 시가총액 분류 매핑 (250+ 코인) */
export const COIN_MARKET_CAP_MAP: Record<string, MarketCapTier> = {
  // Large Cap ($10B+)
  BTC: 'large', ETH: 'large', SOL: 'large', BNB: 'large', XRP: 'large',
  DOGE: 'large', ADA: 'large', AVAX: 'large', TRX: 'large', LINK: 'large',
  DOT: 'large', SUI: 'large', TON: 'large',
  // Mid Cap ($1B ~ $10B)
  AAVE: 'mid', ARB: 'mid', OP: 'mid', APT: 'mid', NEAR: 'mid',
  UNI: 'mid', ATOM: 'mid', FIL: 'mid', RENDER: 'mid', FET: 'mid',
  PEPE: 'mid', SHIB: 'mid', IMX: 'mid', INJ: 'mid', SEI: 'mid',
  STX: 'mid', MKR: 'mid', LDO: 'mid', TAO: 'mid', TIA: 'mid',
  // Small Cap (< $1B)
  // ... (실제 구현 시 250+ 코인 전체 매핑)
};

/** 섹터 분류 매핑 (1개 코인이 다수 섹터에 속할 수 있음) */
export const COIN_SECTOR_MAP: Record<string, CoinSector[]> = {
  // DeFi
  AAVE: ['defi'], UNI: ['defi'], MKR: ['defi'], CRV: ['defi'],
  COMP: ['defi'], SNX: ['defi'], '1INCH': ['defi'], JUP: ['defi'],
  LDO: ['defi'], SUSHI: ['defi'], DYDX: ['defi'], GMX: ['defi'],
  // L1
  BTC: ['l1', 'dino'], ETH: ['l1', 'dino'], SOL: ['l1'], BNB: ['l1'],
  ADA: ['l1', 'dino'], AVAX: ['l1'], APT: ['l1'], SUI: ['l1'],
  NEAR: ['l1', 'ai'], ATOM: ['l1'], DOT: ['l1'], TON: ['l1'],
  // L2
  ARB: ['l2'], OP: ['l2'], POL: ['l2'], STRK: ['l2'], MNT: ['l2'],
  ZK: ['l2'], IMX: ['l2'],
  // Metaverse
  SAND: ['metaverse'], MANA: ['metaverse'], AXS: ['metaverse'],
  GALA: ['metaverse'], ENJ: ['metaverse'], RONIN: ['metaverse'],
  // Meme
  DOGE: ['meme', 'dino'], SHIB: ['meme'], PEPE: ['meme'], BONK: ['meme'],
  WIF: ['meme'], POPCAT: ['meme'], FLOKI: ['meme'],
  // Dino (2017년 이전)
  LTC: ['dino'], XRP: ['dino'], XLM: ['dino'], XMR: ['dino'],
  ZEC: ['dino'], DASH: ['dino'], ETC: ['dino'],
  // AI
  FET: ['ai'], RENDER: ['ai'], TAO: ['ai'],
  // NEAR는 위에서 ['l1', 'ai']로 이미 매핑
};

/** 섹터 표시 라벨 */
export const SECTOR_LABELS: Record<CoinSector, string> = {
  defi: 'DeFi',
  l1: 'Layer 1',
  l2: 'Layer 2',
  metaverse: 'Metaverse',
  meme: 'Meme',
  dino: 'Dino',
  ai: 'AI',
};
```

### 4.3 데이터 모델 다이어그램

```mermaid
classDiagram
    class AggregatedCoin {
        +string symbol
        +number price
        +number priceChange24h
        +number volume24h
        +number openInterest
        +number fundingRate
        +number exchangeCount
        +ExchangeBreakdown[] exchanges
    }

    class ExchangeBreakdown {
        +FuturesExchangeType exchange
        +number price
        +number priceChange24h
        +number volume24h
        +number openInterest
        +number fundingRate
    }

    class NormalizedTicker {
        +FuturesExchangeType exchange
        +string symbol
        +string rawSymbol
        +number price
        +number priceChange24h
        +number volume24h
        +number openInterest
        +number fundingRate
    }

    class MarketScreenerResponse {
        +AggregatedCoin[] coins
        +Record errors
        +number timestamp
        +number exchangeCount
    }

    class NewListingCoin {
        +string symbol
        +FuturesExchangeType exchange
        +string listDate
        +number daysAgo
    }

    MarketScreenerResponse "1" --> "*" AggregatedCoin
    AggregatedCoin "1" --> "*" ExchangeBreakdown
    NormalizedTicker ..> AggregatedCoin : aggregated into
```

---

## 5. 비즈니스 프로세스

### 5.1 프로세스 1: 페이지 초기 로드 및 데이터 수집

```mermaid
sequenceDiagram
    participant U as 사용자
    participant P as MarketScreenerPage
    participant H as useMarketScreenerTickers
    participant TQ as TanStack Query
    participant RH as Route Handler<br/>/api/market-screener/tickers
    participant C as InMemoryCache
    participant BF as BulkTickerFetcher
    participant N as BulkTickerNormalizer
    participant AG as CoinAggregator
    participant EX as 6개 거래소 API

    U->>P: /market-screener 접근
    P->>P: useState 초기화 (sortTab='topGainers', capFilter='all', ...)
    P->>H: useMarketScreenerTickers()
    H->>TQ: useQuery({ queryKey: ['market-screener', 'tickers'] })
    TQ->>RH: GET /api/market-screener/tickers

    RH->>C: cache.getWithStale('ms:tickers')
    
    alt 캐시 히트 (Fresh)
        C-->>RH: { hit: true, isFresh: true, data }
        RH-->>TQ: 200 OK (cached: true)
    else 캐시 미스 또는 Stale
        C-->>RH: { hit: false } 또는 { hit: true, isFresh: false }
        RH->>BF: fetchAllBulkTickers()
        BF->>EX: Promise.allSettled([6개 벌크 API 호출])
        Note over BF,EX: 각 거래소 타임아웃 5초
        EX-->>BF: 성공/실패 결과
        BF-->>RH: BulkTickerResult
        
        RH->>N: normalizeBulkTickers(exchange, rawData) x 6
        N-->>RH: NormalizedTicker[] (전 거래소)
        
        RH->>AG: aggregateCoins(allNormalizedTickers)
        AG-->>RH: AggregatedCoin[]
        
        RH->>C: cache.set('ms:tickers', result, 30_000)
        RH-->>TQ: 200 OK (cached: false)
    end

    TQ-->>H: data: MarketScreenerResponse
    H-->>P: { data, isLoading, error }
    P->>P: useScreenerFilter(coins, state) → filteredCoins
    P->>P: 테이블 + 차트 렌더링
```

### 5.2 프로세스 2: 탭 필터 및 검색 적용

```mermaid
flowchart TD
    A[사용자가 탭 클릭 또는 검색어 입력] --> B[ScreenerState 업데이트]
    B --> C[useScreenerFilter 호출]
    C --> D{searchQuery 있는가?}
    D -->|Yes| E[symbol.includes 대소문자 무시 필터]
    D -->|No| F[전체 코인 유지]
    E --> G{capFilter === 'all'?}
    F --> G
    G -->|No| H["COIN_MARKET_CAP_MAP[symbol] === capFilter 필터"]
    G -->|Yes| I[전체 통과]
    H --> J{sectorFilter === 'all'?}
    I --> J
    J -->|No| K["COIN_SECTOR_MAP[symbol]?.includes(sectorFilter) 필터"]
    J -->|Yes| L[전체 통과]
    K --> M{sortTab 기준 정렬}
    L --> M
    M -->|topGainers| N[priceChange24h DESC]
    M -->|topLosers| O[priceChange24h ASC]
    M -->|topVolume| P[volume24h DESC]
    M -->|newListings| Q[newListings 목록과 교차 필터 + listDate DESC]
    N --> R[filteredCoins 반환]
    O --> R
    P --> R
    Q --> R
    R --> S[useMemo로 캐싱, 100ms 이내 완료]
```

### 5.3 프로세스 3: Return Buckets 계산

```mermaid
flowchart TD
    A["coins: AggregatedCoin[]"] --> B{chartPeriod?}
    B -->|1d| C[coins.priceChange24h 사용<br/>추가 API 호출 없음]
    B -->|1w / 1m| D["추가 Kline API 호출<br/>/api/market-screener/kline-changes?period=1w"]
    C --> E[수익률 구간 분류]
    D --> E
    E --> F["구간 생성: -30% ~ +30%, 5% 단위<br/>총 13개 구간"]
    F --> G["각 코인을 해당 구간에 배치"]
    G --> H["ReturnBucket[] 생성"]
    H --> I[Recharts BarChart 렌더링]
    
    style C fill:#e8f5e9
    style D fill:#fff3e0
```

### 5.4 프로세스 4: 자동 갱신 및 변동 감지

```mermaid
sequenceDiagram
    participant TQ as TanStack Query
    participant RH as Route Handler
    participant UI as ScreenerTable

    Note over TQ: refetchInterval: 60_000ms
    
    loop 60초마다 (탭 활성 시에만)
        TQ->>RH: GET /api/market-screener/tickers
        RH-->>TQ: MarketScreenerResponse (new)
        TQ->>TQ: 이전 데이터와 비교 (placeholderData)
        TQ-->>UI: data 업데이트
        UI->>UI: 가격 변동 셀에 flash 애니메이션
    end

    Note over TQ: 탭 비활성 시 refetch 중지
    Note over TQ: 탭 재활성 시 즉시 refetch (refetchOnWindowFocus)
```

### 5.5 프로세스 5: 코인 행 클릭 -> futures-dashboard 이동

```mermaid
flowchart LR
    A["사용자가 테이블 행 클릭<br/>(예: BTC 행)"] --> B["onCoinClick('BTC') 호출"]
    B --> C["router.push('/futures-dashboard?coin=BTC')"]
    C --> D["FuturesDashboardPage 로드<br/>12개 차트 그리드 표시"]
```

---

## 6. 거래소별 벌크 Ticker API 정규화 상세

### 6.1 Binance

```
GET https://fapi.binance.com/fapi/v1/ticker/24hr
```

| 원본 필드 | 매핑 대상 | 변환 |
|---|---|---|
| `symbol` | `rawSymbol` | 그대로 (예: `"BTCUSDT"`) |
| `symbol` | `symbol` | USDT 접미사 제거 |
| `lastPrice` | `price` | `parseFloat` |
| `priceChangePercent` | `priceChange24h` | `parseFloat / 100` (% -> 소수) |
| `quoteVolume` | `volume24h` | `parseFloat` |
| - | `openInterest` | 0 (벌크 ticker에 미포함, Phase 1에서 별도 처리) |
| - | `fundingRate` | 0 (벌크 ticker에 미포함) |

**주의:** Binance의 벌크 24hr ticker에는 OI와 펀딩이 포함되지 않는다. 이를 보충하기 위해 `GET /fapi/v1/premiumIndex` (전 코인 벌크, weight 10)를 추가 호출하여 `lastFundingRate`를 수집하고, OI는 Phase 1에서 다른 거래소 데이터로 보충한다.

### 6.2 Bybit

```
GET https://api.bybit.com/v5/market/tickers?category=linear
```

| 원본 필드 | 매핑 대상 | 변환 |
|---|---|---|
| `result.list[].symbol` | `rawSymbol` / `symbol` | USDT 접미사 제거 |
| `result.list[].lastPrice` | `price` | `parseFloat` |
| `result.list[].price24hPcnt` | `priceChange24h` | `parseFloat` (이미 소수) |
| `result.list[].turnover24h` | `volume24h` | `parseFloat` |
| `result.list[].openInterest` | `openInterest` | `parseFloat * lastPrice` (코인 -> USD 변환) |
| `result.list[].fundingRate` | `fundingRate` | `parseFloat` |

### 6.3 OKX

```
GET https://www.okx.com/api/v5/market/tickers?instType=SWAP
```

| 원본 필드 | 매핑 대상 | 변환 |
|---|---|---|
| `data[].instId` | `rawSymbol` / `symbol` | `"BTC-USDT-SWAP"` -> `"BTC"` |
| `data[].last` | `price` | `parseFloat` |
| `data[].open24h`, `data[].last` | `priceChange24h` | `(last - open24h) / open24h` |
| `data[].volCcy24h`, `data[].last` | `volume24h` | `volCcy24h * last` (코인수량 x 가격 -> USD) |
| - | `openInterest` | 0 (별도 API `GET /api/v5/public/open-interest?instType=SWAP` 벌크 호출로 보충) |
| - | `fundingRate` | 0 (별도 API `GET /api/v5/public/funding-rate` 호출로 보충) |

**주의:** OKX ticker에는 OI와 펀딩이 미포함이다. OI는 `GET /api/v5/public/open-interest?instType=SWAP` (벌크)으로, 펀딩은 개별 심볼 호출이 필요하므로 Phase 1에서는 다른 거래소 데이터로 보충한다.

### 6.4 Gate.io

```
GET https://api.gateio.ws/api/v4/futures/usdt/tickers
```

| 원본 필드 | 매핑 대상 | 변환 |
|---|---|---|
| `[].contract` | `rawSymbol` / `symbol` | `"BTC_USDT"` -> `"BTC"` |
| `[].last` | `price` | `parseFloat` |
| `[].change_percentage` | `priceChange24h` | `parseFloat / 100` |
| `[].volume_24h_quote` | `volume24h` | `parseFloat` (이미 USD) |
| `[].total_size` | `openInterest` | `parseFloat * quanto_multiplier * last` |
| `[].funding_rate` | `fundingRate` | `parseFloat` |

### 6.5 Bitget

```
GET https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES
```

| 원본 필드 | 매핑 대상 | 변환 |
|---|---|---|
| `data[].symbol` | `rawSymbol` / `symbol` | `"BTCUSDT"` -> `"BTC"` |
| `data[].lastPr` | `price` | `parseFloat` |
| `data[].change24h` | `priceChange24h` | `parseFloat` (이미 소수) |
| `data[].usdtVolume` | `volume24h` | `parseFloat` |
| `data[].openInterestUsd` \| `data[].holdingAmount` | `openInterest` | `parseFloat` (openInterestUsd 우선, 없으면 holdingAmount * lastPr) |
| `data[].fundingRate` | `fundingRate` | `parseFloat` |

### 6.6 Hyperliquid

```
POST https://api.hyperliquid.xyz/info
Body: {"type": "metaAndAssetCtxs"}
```

| 원본 필드 | 매핑 대상 | 변환 |
|---|---|---|
| `[0].universe[i].name` | `symbol` | 그대로 (이미 base asset) |
| `[1][i].markPx` | `price` | `parseFloat` |
| `[1][i].prevDayPx`, `markPx` | `priceChange24h` | `(markPx - prevDayPx) / prevDayPx` |
| `[1][i].dayNtlVlm` | `volume24h` | `parseFloat` |
| `[1][i].openInterest`, `markPx` | `openInterest` | `openInterest * markPx` |
| `[1][i].funding` | `fundingRate` | `parseFloat` |

---

## 7. 에러 핸들링 전략

### 7.1 거래소 API 에러 처리 (Graceful Degradation)

```mermaid
flowchart TD
    A[6개 거래소 API 병렬 호출] --> B[Promise.allSettled]
    B --> C{각 결과 확인}
    C -->|fulfilled| D[NormalizedTicker[] 수집]
    C -->|rejected 또는 타임아웃 5s| E[errors 맵에 기록]
    D --> F{성공 거래소 >= 1?}
    E --> F
    F -->|Yes| G[성공 데이터로 AggregatedCoin[] 생성]
    F -->|No| H{스테일 캐시 존재?}
    G --> I["200 OK + errors 필드에 실패 거래소 명시"]
    H -->|Yes| J["200 OK + stale: true + errors"]
    H -->|No| K["500 Error + 재시도 안내"]
```

### 7.2 에러 계층별 처리

| 계층 | 에러 유형 | 처리 방식 |
|---|---|---|
| **거래소 API** | 타임아웃 (5s) | 해당 거래소 제외, `errors` 맵에 기록 |
| **거래소 API** | HTTP 4xx/5xx | 해당 거래소 제외, 에러 메시지 변환 |
| **거래소 API** | 응답 파싱 실패 | try-catch로 해당 거래소 제외 |
| **Route Handler** | 전체 거래소 실패 | 스테일 캐시 폴백, 없으면 500 |
| **클라이언트** | fetch 실패 | TanStack Query retry 2회, 이전 데이터 유지 |
| **클라이언트** | 데이터 2분+ 경과 | 경고 배지 표시 ("데이터 갱신 지연") |
| **클라이언트** | 부분 거래소 누락 | 상단 경고 배너 (예: "Binance 데이터 누락") |

### 7.3 클라이언트 에러 UI

```typescript
// 에러 배너 컴포넌트 로직
interface ErrorBannerProps {
  errors: Partial<Record<FuturesExchangeType, string>>;
  timestamp: number;
}

// 표시 조건:
// 1. errors 객체에 키가 1개 이상 → "일부 거래소 데이터 누락" 경고
// 2. timestamp가 2분 이상 경과 → "데이터 갱신 지연" 경고
// 3. 모든 거래소 실패 → 전체 에러 화면 + 재시도 버튼
```

---

## 8. 파일 구조

```
apps/web/
├── app/
│   ├── (dashboard)/
│   │   └── market-screener/
│   │       ├── page.tsx                         # 페이지 컴포넌트
│   │       └── components/
│   │           ├── screener-table.tsx            # 가상화 테이블
│   │           ├── tab-filter-bar.tsx            # 3개 탭 그룹
│   │           ├── search-input.tsx              # 검색 입력
│   │           ├── chart-widget-grid.tsx         # 4개 차트 그리드
│   │           ├── error-banner.tsx              # 에러 경고 배너
│   │           ├── data-freshness-badge.tsx      # 갱신 시간 배지
│   │           └── charts/
│   │               ├── return-buckets-chart.tsx  # 수익률 분포
│   │               ├── market-volume-chart.tsx   # 거래소별 거래량
│   │               ├── total-oi-chart.tsx        # 거래소별 OI
│   │               └── sector-performance-chart.tsx # 섹터별 성과
│   └── api/
│       └── market-screener/
│           ├── tickers/
│           │   └── route.ts                     # 벌크 ticker 수집 엔드포인트
│           ├── new-listings/
│           │   └── route.ts                     # 신규 상장 감지 엔드포인트
│           └── _lib/
│               ├── bulk-ticker-fetcher.ts       # 6개 거래소 병렬 호출
│               ├── bulk-ticker-normalizer.ts    # 응답 정규화
│               ├── symbol-normalizer.ts         # 심볼 정규화
│               └── coin-aggregator.ts           # 코인 집계
├── hooks/
│   ├── useMarketScreenerTickers.ts              # 벌크 ticker 훅
│   ├── useNewListings.ts                        # 신규 상장 훅
│   └── useScreenerFilter.ts                     # 필터/정렬 훅

packages/shared/
├── src/
│   ├── types/
│   │   └── market-screener.ts                   # 타입 정의
│   └── constants/
│       └── market-screener.ts                   # 정적 매핑 (시가총액, 섹터), 상수
```

---

## 9. 테스팅 전략

### 9.1 단위 테스트

| 대상 | 테스트 파일 | 주요 검증 항목 |
|---|---|---|
| `symbol-normalizer.ts` | `__tests__/symbol-normalizer.test.ts` | 6개 거래소별 심볼 변환 정확성, COIN-마진 필터링, 엣지 케이스(빈 문자열, 알 수 없는 포맷) |
| `bulk-ticker-normalizer.ts` | `__tests__/bulk-ticker-normalizer.test.ts` | 거래소별 필드 매핑, 숫자 파싱, 누락 필드 기본값 0 |
| `coin-aggregator.ts` | `__tests__/coin-aggregator.test.ts` | 가중 평균 정확성, 단일 거래소 코인, 0 거래량 시 fallback |
| `useScreenerFilter.ts` | `__tests__/useScreenerFilter.test.ts` | 탭 조합 필터, 검색, 빈 결과, 정렬 순서 |

### 9.2 통합 테스트

| 대상 | 테스트 파일 | 주요 검증 항목 |
|---|---|---|
| Route Handler `/api/market-screener/tickers` | `__tests__/tickers-route.test.ts` | 캐시 히트/미스, 부분 실패 Graceful Degradation, 전체 실패 시 500 |
| Route Handler `/api/market-screener/new-listings` | `__tests__/new-listings-route.test.ts` | exchangeInfo 파싱, 30일 필터 |

### 9.3 E2E 테스트 시나리오

| 시나리오 | 검증 항목 |
|---|---|
| 페이지 로드 | 스켈레톤 표시 -> 테이블 렌더링, 3초 이내 완료 |
| 탭 전환 | Top Gainers/Losers/Volume 탭 전환 시 100ms 이내 재정렬 |
| 코인 클릭 | 행 클릭 시 `/futures-dashboard?coin=XXX` 이동 |
| 검색 | "sol" 입력 시 SOL 행만 표시, debounce 300ms |
| 자동 갱신 | 60초 후 데이터 갱신, 가격 변동 셀 flash |

---

## 10. 성능 최적화

### 10.1 서버 측

| 항목 | 전략 |
|---|---|
| **API 병렬 호출** | `Promise.allSettled`로 6개 거래소 동시 호출, 개별 타임아웃 5초 |
| **서버 캐시** | `InMemoryCache` TTL 30초, 스테일 유예 5분 |
| **HTTP 캐시** | `Cache-Control: s-maxage=30, stale-while-revalidate=60` |
| **응답 크기** | 불필요 필드 제거, `exchanges` 배열은 필요 시에만 포함 |

### 10.2 클라이언트 측

| 항목 | 전략 |
|---|---|
| **테이블 가상화** | `@tanstack/react-virtual` (250+ 행 → 뷰포트 내 20~30행만 렌더) |
| **필터 메모이제이션** | `useMemo`로 필터/정렬 결과 캐싱, 의존성 변경 시에만 재계산 |
| **차트 Lazy Loading** | 4개 차트 위젯을 `React.lazy` + `dynamic import`로 코드 분할 |
| **Debounce 검색** | 300ms debounce로 입력당 1회 필터 실행 |
| **stale-while-revalidate** | TanStack Query `placeholderData: keepPreviousData`로 이전 데이터 유지하며 백그라운드 갱신 |
| **Flash 애니메이션** | `useRef`로 이전 가격 비교, CSS `transition`으로 변동 셀 하이라이트 (DOM 조작 최소화) |

### 10.3 번들 크기 최적화

```typescript
// 차트 위젯 동적 임포트 예시
const ReturnBucketsChart = dynamic(
  () => import('./charts/return-buckets-chart').then(m => ({ default: m.ReturnBucketsChart })),
  { loading: () => <div className="h-[200px] animate-pulse bg-muted rounded" /> }
);
```

---

## 11. 설계 결정 및 근거

### D1: 별도 Route Handler vs 기존 확장

**결정:** `/api/market-screener/tickers` 별도 Route Handler 신설

**근거:** 기존 `futures-dashboard`는 코인별 개별 API 호출 패턴(`/fapi/v1/ticker/24hr?symbol=BTCUSDT`)이고, 마켓 스크리너는 벌크 API 호출 패턴(`/fapi/v1/ticker/24hr` - symbol 생략)이다. URL 구조, 응답 파싱, 캐시 키 전략이 근본적으로 다르므로, 코드 복잡성을 높이는 것보다 깔끔한 분리가 유지보수에 유리하다.

### D2: 정적 매핑 vs CoinGecko API

**결정:** Phase 1은 정적 매핑(하드코딩), Phase 2에서 CoinGecko 하이브리드 고려

**근거:** Phase 1의 목표는 프론트엔드 중심 구현이다. CoinGecko 무료 API는 10,000 calls/월 제한이 있어 60초 갱신 시 빠르게 소진된다. 선물 상장 코인이 250개 수준이므로 수동 관리가 가능하다. 하드코딩 파일(`packages/shared`)에 TypeScript 상수로 관리하여 타입 안전성도 확보한다.

### D3: 테이블 가상화 라이브러리

**결정:** `@tanstack/react-virtual` 사용

**근거:** 이미 `@tanstack/react-query`를 사용 중이므로 TanStack 생태계 내에서 일관성을 유지할 수 있다. 250+ 행 렌더링에 페이지네이션 대신 가상 스크롤을 선택한 이유는, 사용자가 전체 시장을 **연속적으로 스캔**하는 UX가 페이지 전환보다 자연스럽기 때문이다.

### D4: Binance OI/Funding 보충 전략

**결정:** Binance `GET /fapi/v1/premiumIndex` (벌크)로 펀딩 보충, OI는 다른 거래소로 대체

**근거:** Binance 벌크 24hr ticker에 OI와 펀딩이 미포함이다. `premiumIndex` API는 symbol 생략 시 전 코인 벌크 조회가 가능하고 weight 10으로 가볍다. OI는 Binance 개별 API(`/fapi/v1/openInterest`)로 250+ 코인을 호출하면 rate limit 초과 위험이 있어, Phase 1에서는 Bybit/Gate/Bitget/Hyperliquid의 OI 합산으로 시장 개요를 제공한다.

### D5: 1w/1m Return Buckets 데이터

**결정:** 1d는 ticker 데이터 즉시 사용, 1w/1m는 별도 Kline API 호출

**근거:** 1d 수익률은 벌크 ticker의 `priceChange24h`로 즉시 계산 가능하다. 1w/1m는 7일/30일 전 가격이 필요하여 Kline API 호출이 불가피하다. 다만 250+ 코인 전체를 Kline 호출하면 API 부하가 크므로, 대표 거래소(Binance) 1곳만 사용하여 부하를 최소화한다.

### D6: New Listings 감지 전략

**결정:** Binance/Bybit/OKX의 exchangeInfo/instruments API를 Route Handler에서 호출, 클라이언트 1시간 캐시

**근거:** 신규 상장은 빈번하지 않으므로(월 수 건) 60초 갱신이 불필요하다. 3개 주요 거래소의 instrument 정보 API를 1시간 캐시로 호출하여, 상장 시간 정보가 포함된 거래소에서 `listDate`를 추출한다.
