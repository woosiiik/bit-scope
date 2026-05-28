# Requirements Document: Phase 2 - Server-Side Data Collection

## Introduction

BitScope Phase 2는 기존 클라이언트 사이드 실시간 조회 방식에서 벗어나, **서버(apps/api)에서 주기적으로 멀티 거래소 선물 데이터를 수집하여 MySQL DB에 저장**하고, 프론트엔드에서 **시계열 집계 데이터를 차트로 시각화**하는 기능을 구현한다.

기존 LiquidationModule(WebSocket+REST 수집 -> TypeORM Entity -> DB -> 집계 Service -> Controller -> Next.js Route Handler 프록시)의 아키텍처 패턴을 동일하게 따르며, 현재 FuturesCollectorService의 인메모리 캐시 방식을 DB 영속화 방식으로 확장한다.

구현 대상은 4개 기능이며, 마켓 스크리너 3개(Funding APR Heatmap, OI Changes, OI-Normalized CVD)와 선물 대시보드 1개(3M Annualized Basis)로 구성된다.

**데이터 소스 (6개 거래소):**
- Binance: `/fapi/v1/premiumIndex` (벌크), `/fapi/v1/ticker/24hr`, `/fapi/v1/exchangeInfo`
- Bybit: `/v5/market/tickers?category=linear` (벌크)
- OKX: `/api/v5/public/funding-rate`, `/api/v5/public/open-interest?instType=SWAP`
- Gate.io: `/api/v4/futures/usdt/tickers` (벌크)
- Bitget: `/api/v2/mix/market/tickers?productType=USDT-FUTURES` (벌크)
- Hyperliquid: `POST /info {"type":"metaAndAssetCtxs"}` (벌크)

---

## Requirements

### Requirement 1: Funding Rate & OI 데이터 수집 (Backend)

**User Story:** As a 시스템 운영자, I want 서버에서 6개 거래소의 전 코인 펀딩 비율과 OI를 1시간 간격으로 자동 수집하여 DB에 저장하고 싶다, so that 시계열 분석에 필요한 히스토리 데이터를 축적할 수 있다.

#### Acceptance Criteria

1. WHEN 서버(apps/api)가 시작되면 THEN FundingOICollectorService SHALL 즉시 1회 전체 거래소의 펀딩 비율과 OI 데이터를 수집하여 DB에 저장한다.
2. WHEN 1시간 간격(@Interval)이 도래하면 THEN FundingOICollectorService SHALL 6개 거래소(Binance, Bybit, OKX, Gate.io, Bitget, Hyperliquid)의 전 코인 펀딩 비율과 OI를 벌크 수집한다.
3. WHEN 수집이 완료되면 THEN 시스템 SHALL 각 데이터 포인트를 `funding_oi_snapshot` 테이블에 (timestamp, symbol, exchange, fundingRate, openInterest) 형태로 저장한다.
4. WHEN 특정 거래소의 API 호출이 실패하면 THEN 시스템 SHALL 해당 거래소를 건너뛰고 나머지 거래소의 수집을 계속 진행한다.
5. WHEN API 호출 실패가 3회 연속 발생하면 THEN 시스템 SHALL 백오프(backoff) 로직을 적용하여 해당 거래소의 수집을 일시 중단하고 로그에 경고를 기록한다.
6. WHEN 각 거래소 API를 호출할 때 THEN 시스템 SHALL AbortSignal.timeout(10초)을 설정하여 응답 지연으로 인한 블로킹을 방지한다.
7. WHEN 심볼을 정규화할 때 THEN 시스템 SHALL 거래소별 심볼 형식(BTCUSDT, BTC-USDT-SWAP, BTC_USDT 등)을 통일된 기본 심볼(BTC)로 변환한다.
8. IF TypeORM Entity에 `idx_funding_oi_symbol_time` 인덱스가 정의되어 있으면 THEN DB SHALL symbol과 timestamp 기준으로 효율적인 시계열 쿼리를 지원한다.

---

### Requirement 2: Funding APR Heatmap (Frontend - Market Screener)

**User Story:** As a 트레이더, I want 마켓 스크리너에서 코인별 펀딩 비율의 시간별 변화를 히트맵으로 보고 싶다, so that 펀딩 과열/공포 상태의 코인을 한눈에 파악하고 차익거래 기회를 발견할 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 마켓 스크리너 페이지에 접근하면 THEN Funding APR Heatmap 차트 SHALL 현재 "Phase 2에서 구현 예정" 플레이스홀더를 대체하여 실제 히트맵을 렌더링한다.
2. WHEN 히트맵을 표시할 때 THEN 시스템 SHALL OI 가중 평균 펀딩을 계산한다: `Σ(거래소i의 Funding x 거래소i의 OI) / Σ(거래소i의 OI)`.
3. WHEN 히트맵을 렌더링할 때 THEN 시스템 SHALL X축을 시간, Y축을 코인 심볼로 구성하고, 각 셀의 색상을 펀딩 비율에 따라 표현한다 (빨강 = 양의 펀딩 과열, 파랑 = 음의 펀딩 공포).
4. WHEN 사용자가 기간을 선택하면 THEN 시스템 SHALL 1d(24시간), 1w(168시간), 1m(720시간) 중 선택된 기간의 데이터를 조회하여 히트맵을 갱신한다.
5. WHEN 히트맵의 특정 셀에 마우스를 호버하면 THEN 시스템 SHALL 해당 코인, 시간, 펀딩 비율(APR %)을 툴팁으로 표시한다.
6. WHEN 데이터를 조회할 때 THEN Next.js Route Handler SHALL apps/api의 집계 API를 프록시하고, 1분 TTL 캐시를 적용한다.
7. WHEN 서버에서 데이터가 아직 수집되지 않았으면 THEN 시스템 SHALL "데이터 수집 중입니다. 잠시 후 다시 시도해주세요." 메시지를 표시한다.

---

### Requirement 3: OI Changes (Frontend - Market Screener)

**User Story:** As a 트레이더, I want 마켓 스크리너에서 코인별 OI 변화율을 기간별로 비교하고 싶다, so that 포지션이 빠르게 증가/감소하는 코인을 파악하여 큰 움직임을 예측할 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 마켓 스크리너 페이지에 접근하면 THEN OI Changes 차트 SHALL 현재 OI 크기 기반 절대값 차트를 OI 변화율(%) 기반 차트로 교체한다.
2. WHEN OI 변화율을 계산할 때 THEN 시스템 SHALL 다음 공식을 사용한다: `변화율(%) = (현재OI - 기준시점OI) / 기준시점OI x 100`.
3. WHEN 차트를 렌더링할 때 THEN 시스템 SHALL 상위 20개 코인의 OI 변화율을 수평 바 차트로 표시한다 (양수 = 녹색, 음수 = 빨강).
4. WHEN 사용자가 기간을 선택하면 THEN 시스템 SHALL 1d(24시간 전 대비), 1w(168시간 전 대비), 1m(720시간 전 대비) 중 선택된 기간의 OI 변화율을 계산하여 표시한다.
5. WHEN 차트 바에 마우스를 호버하면 THEN 시스템 SHALL 해당 코인의 OI 변화율(%), 현재 OI(USD), 기준시점 OI(USD)를 툴팁으로 표시한다.
6. WHEN 기준 시점의 OI 데이터가 존재하지 않으면 THEN 시스템 SHALL 해당 코인을 목록에서 제외한다.

---

### Requirement 4: Taker Buy/Sell Volume 데이터 수집 (Backend)

**User Story:** As a 시스템 운영자, I want 서버에서 Binance의 taker buy/sell volume 데이터를 1시간 간격으로 수집하여 DB에 저장하고 싶다, so that CVD(누적 거래량 델타)의 시계열 계산에 필요한 히스토리를 축적할 수 있다.

#### Acceptance Criteria

1. WHEN 서버가 시작되면 THEN TakerVolumeCollectorService SHALL 즉시 1회 Binance의 taker buy/sell volume 데이터를 수집하여 DB에 저장한다.
2. WHEN 1시간 간격이 도래하면 THEN 시스템 SHALL Binance `takerlongshortRatio` API 또는 Kline `takerBuyQuoteVol` 필드를 활용하여 전 코인의 taker buy/sell volume을 수집한다.
3. WHEN 수집이 완료되면 THEN 시스템 SHALL 각 데이터 포인트를 `taker_volume_snapshot` 테이블에 (timestamp, symbol, buyVolume, sellVolume) 형태로 저장한다.
4. IF 수집 대상 심볼 목록이 필요하면 THEN 시스템 SHALL Requirement 1의 Binance 펀딩/OI 수집 시 획득한 심볼 목록을 재사용한다.
5. WHEN API 호출이 실패하면 THEN 시스템 SHALL Requirement 1과 동일한 에러 처리 및 백오프 전략을 적용한다.

---

### Requirement 5: OI-Normalized CVD (Frontend - Market Screener)

**User Story:** As a 트레이더, I want 마켓 스크리너에서 OI로 정규화된 CVD를 코인별로 비교하고 싶다, so that 코인 크기에 무관하게 순수한 매수/매도 압력을 동일 선상에서 비교할 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 마켓 스크리너 페이지에 접근하면 THEN OI-Normalized CVD 차트 SHALL 현재 "Phase 2에서 구현 예정" 플레이스홀더를 대체하여 실제 바 차트를 렌더링한다.
2. WHEN CVD를 계산할 때 THEN 시스템 SHALL 다음 공식을 사용한다: `CVD = Σ(takerBuyVolume - takerSellVolume)` (선택 기간 내 누적).
3. WHEN Normalized CVD를 계산할 때 THEN 시스템 SHALL 다음 공식을 사용한다: `Normalized CVD = CVD / 전 거래소 OI 합산`.
4. WHEN 차트를 렌더링할 때 THEN 시스템 SHALL 상위 20개 코인의 Normalized CVD를 수평 바 차트로 표시한다 (양수 = 순매수 우세, 음수 = 순매도 우세).
5. WHEN 차트 바에 마우스를 호버하면 THEN 시스템 SHALL 해당 코인의 Normalized CVD 값, CVD(USD), 전체 OI(USD)를 툴팁으로 표시한다.
6. WHEN 전 거래소 OI 합산이 0이면 THEN 시스템 SHALL 해당 코인을 목록에서 제외하여 0 나누기 오류를 방지한다.

---

### Requirement 6: Quarterly Futures Basis 데이터 수집 (Backend)

**User Story:** As a 시스템 운영자, I want 서버에서 Binance 분기 선물의 가격과 만기일을 주기적으로 수집하고 싶다, so that 3M Annualized Basis 계산에 필요한 데이터를 제공할 수 있다.

#### Acceptance Criteria

1. WHEN 서버가 시작되면 THEN BasisCollectorService SHALL Binance `/fapi/v1/exchangeInfo`에서 `CURRENT_QUARTER` 타입 심볼(BTC, ETH)을 동적으로 조회한다.
2. WHEN 분기 선물 심볼이 확인되면 THEN 시스템 SHALL 해당 심볼의 선물 가격과 만기일(deliveryDate)을 추출한다.
3. WHEN 1시간 간격이 도래하면 THEN 시스템 SHALL 분기 선물 가격과 해당 코인의 스팟 가격을 수집하여 DB에 저장한다.
4. WHEN 데이터를 저장할 때 THEN 시스템 SHALL `basis_snapshot` 테이블에 (timestamp, symbol, futuresPrice, spotPrice, deliveryDate) 형태로 저장한다.
5. IF Binance exchangeInfo에서 CURRENT_QUARTER 심볼을 찾을 수 없으면 THEN 시스템 SHALL 로그에 경고를 기록하고 해당 수집 사이클을 건너뛴다.
6. WHEN 분기가 변경되어 새로운 만기 심볼이 등장하면 THEN 시스템 SHALL 다음 수집 사이클에서 자동으로 새 심볼을 감지하여 전환한다.

---

### Requirement 7: 3M Annualized Basis (Frontend - Futures Dashboard)

**User Story:** As a 트레이더, I want 선물 대시보드에서 BTC/ETH의 3개월 연환산 베이시스를 시계열 차트로 보고 싶다, so that 선물 프리미엄/디스카운트 추세를 파악하여 시장 센티먼트를 판단할 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 선물 대시보드에서 BTC 또는 ETH를 선택하면 THEN 3M Basis 차트 SHALL 현재 플레이스홀더를 대체하여 실제 시계열 차트를 렌더링한다.
2. WHEN Basis를 계산할 때 THEN 시스템 SHALL 다음 공식을 사용한다: `Basis(%) = ((FuturesPrice - SpotPrice) / SpotPrice) x (365 / daysToExpiry) x 100`.
3. WHEN 차트를 렌더링할 때 THEN 시스템 SHALL X축을 시간, Y축을 Annualized Basis(%)로 구성한 LineChart를 표시한다.
4. WHEN BTC/ETH 외의 코인이 선택되면 THEN 시스템 SHALL "이 코인은 3M Basis를 지원하지 않습니다" 메시지를 표시한다 (기존 동작 유지).
5. WHEN 차트의 특정 포인트에 마우스를 호버하면 THEN 시스템 SHALL 시각, Basis(%), 선물 가격, 스팟 가격, 만기일까지 남은 일수를 툴팁으로 표시한다.
6. WHEN 데이터를 조회할 때 THEN Next.js Route Handler SHALL apps/api의 basis 집계 API를 프록시하고, 1분 TTL 캐시를 적용한다.

---

### Requirement 8: Backend 집계 API

**User Story:** As a 프론트엔드 개발자, I want 백엔드에서 기간별로 집계된 데이터를 효율적으로 제공하는 REST API가 있으면 좋겠다, so that 프론트엔드에서 복잡한 집계 로직 없이 차트 데이터를 바로 사용할 수 있다.

#### Acceptance Criteria

1. WHEN `GET /funding-heatmap?period=1d` 요청이 들어오면 THEN 시스템 SHALL 해당 기간의 코인별 시간별 OI 가중 평균 펀딩 비율을 2차원 배열로 반환한다.
2. WHEN `GET /oi-changes?period=1d` 요청이 들어오면 THEN 시스템 SHALL 해당 기간의 코인별 OI 변화율(%)을 변화율 내림차순으로 반환한다.
3. WHEN `GET /normalized-cvd?period=1d` 요청이 들어오면 THEN 시스템 SHALL 해당 기간의 코인별 OI-Normalized CVD를 반환한다.
4. WHEN `GET /basis?symbol=BTC&period=1d` 요청이 들어오면 THEN 시스템 SHALL 해당 기간의 시계열 Annualized Basis(%) 데이터를 반환한다.
5. WHEN period 파라미터가 유효하지 않으면 THEN 시스템 SHALL 기본값 1d를 적용한다.
6. WHEN 집계 쿼리 실행 시간이 5초를 초과하면 THEN 시스템 SHALL 타임아웃 에러를 반환한다.
7. WHEN API 응답을 반환할 때 THEN 시스템 SHALL `{ success: boolean, data: T, timestamp: number }` 형식의 일관된 응답 구조를 사용한다 (기존 LiquidationController 패턴 준수).

---

### Requirement 9: Next.js Route Handler 프록시

**User Story:** As a 프론트엔드 개발자, I want Next.js Route Handler를 통해 backend API를 프록시하고 싶다, so that CORS 문제 없이 프론트엔드에서 데이터를 조회할 수 있고 캐시를 적용할 수 있다.

#### Acceptance Criteria

1. WHEN 프론트엔드에서 `/api/futures-dashboard/funding-heatmap` 경로를 요청하면 THEN Route Handler SHALL apps/api의 `/funding-heatmap` 엔드포인트를 프록시한다.
2. WHEN 프론트엔드에서 `/api/futures-dashboard/oi-changes` 경로를 요청하면 THEN Route Handler SHALL apps/api의 `/oi-changes` 엔드포인트를 프록시한다.
3. WHEN 프론트엔드에서 `/api/futures-dashboard/normalized-cvd` 경로를 요청하면 THEN Route Handler SHALL apps/api의 `/normalized-cvd` 엔드포인트를 프록시한다.
4. WHEN 프론트엔드에서 `/api/futures-dashboard/basis` 경로를 요청하면 THEN Route Handler SHALL apps/api의 `/basis` 엔드포인트를 프록시한다.
5. WHEN 프록시 응답을 캐시할 때 THEN Route Handler SHALL 기존 liquidations Route Handler와 동일하게 1분 TTL의 in-memory 캐시를 적용한다.
6. WHEN 백엔드가 응답하지 않으면 THEN Route Handler SHALL stale 캐시 데이터를 반환하거나, 캐시도 없으면 502 에러를 반환한다.

---

### Requirement 10: DB 엔티티 및 데이터 관리

**User Story:** As a 시스템 운영자, I want 수집된 데이터가 효율적으로 저장되고 오래된 데이터가 자동 정리되면 좋겠다, so that DB 스토리지가 무한히 증가하지 않고 안정적으로 운영할 수 있다.

#### Acceptance Criteria

1. WHEN TypeORM Entity를 정의할 때 THEN 시스템 SHALL 기존 LiquidationEntity 패턴을 따라 `@Entity`, `@PrimaryGeneratedColumn`, `@Column`, `@Index` 데코레이터를 사용한다.
2. WHEN `funding_oi_snapshot` 테이블이 생성되면 THEN 시스템 SHALL (symbol, timestamp)와 (exchange, timestamp) 복합 인덱스를 생성한다.
3. WHEN `taker_volume_snapshot` 테이블이 생성되면 THEN 시스템 SHALL (symbol, timestamp) 복합 인덱스를 생성한다.
4. WHEN `basis_snapshot` 테이블이 생성되면 THEN 시스템 SHALL (symbol, timestamp) 복합 인덱스를 생성한다.
5. WHEN 데이터 보존 기간(90일)이 경과하면 THEN 시스템 SHALL 매일 1회(@Cron) 오래된 레코드를 자동 삭제한다.
6. WHEN 배치 인서트를 수행할 때 THEN 시스템 SHALL TypeORM의 `insert()` 메서드를 사용하여 일괄 저장하고, 개별 insert 반복을 피한다.

---

### Requirement 11: NestJS 모듈 구조

**User Story:** As a 개발자, I want Phase 2 기능이 기존 코드 구조와 일관된 모듈로 구성되면 좋겠다, so that 코드를 쉽게 이해하고 유지보수할 수 있다.

#### Acceptance Criteria

1. WHEN Phase 2 모듈을 구성할 때 THEN 시스템 SHALL 기존 LiquidationModule 패턴을 따라 Module, CollectorService, Service(집계), Controller를 분리한다.
2. WHEN 모듈을 등록할 때 THEN 시스템 SHALL AppModule의 imports 배열에 새 모듈을 추가한다.
3. WHEN TypeORM Entity를 등록할 때 THEN 시스템 SHALL 해당 모듈의 `TypeOrmModule.forFeature([...])` 에 Entity를 추가한다.
4. WHEN Collector와 집계 로직이 공통 데이터(심볼 목록 등)를 공유해야 할 때 THEN 시스템 SHALL Module의 exports를 통해 서비스를 공유한다.

---

### Requirement 12: 비기능 요구사항 - 성능 및 안정성

**User Story:** As a 시스템 운영자, I want 데이터 수집이 서버 성능에 부정적 영향을 주지 않으면 좋겠다, so that 기존 서비스(청산 수집, WebSocket 등)가 안정적으로 동작할 수 있다.

#### Acceptance Criteria

1. WHILE 데이터 수집이 진행되는 동안 THEN 시스템 SHALL 거래소 간 API 호출을 `Promise.allSettled`로 병렬 처리하되, 각 거래소 응답 타임아웃을 10초로 제한한다.
2. WHILE 수집 사이클이 실행 중인 동안 THEN 시스템 SHALL 이전 사이클이 완료되지 않았으면 새 사이클을 건너뛴다 (중복 실행 방지).
3. WHEN 거래소 API의 Rate Limit에 도달하면 THEN 시스템 SHALL 지수 백오프를 적용하여 점진적으로 재시도 간격을 늘린다.
4. WHEN 수집 에러가 발생하면 THEN 시스템 SHALL NestJS Logger를 통해 에러 상세 정보를 기록한다.
5. WHEN DB 쿼리가 집계 API에서 실행될 때 THEN 시스템 SHALL 쿼리 실행 시간이 5초를 초과하지 않도록 인덱스를 최적화한다.
6. WHEN 1시간 수집 주기에서 6개 거래소의 벌크 API를 호출할 때 THEN 시스템 SHALL 전체 수집 사이클이 60초 이내에 완료되어야 한다.

---

### Requirement 13: 비기능 요구사항 - 프론트엔드 UX

**User Story:** As a 트레이더, I want 차트가 빠르고 부드럽게 로딩되면 좋겠다, so that 끊김 없이 시장 분석에 집중할 수 있다.

#### Acceptance Criteria

1. WHEN 차트 데이터를 로딩 중일 때 THEN 시스템 SHALL 스켈레톤 애니메이션(기존 ChartSkeleton 컴포넌트)을 표시한다.
2. WHEN TanStack Query로 데이터를 요청할 때 THEN 시스템 SHALL staleTime을 60초, refetchInterval을 300초로 설정하여 불필요한 재요청을 방지한다.
3. WHEN 기간 탭을 전환할 때 THEN 시스템 SHALL 이전 기간의 캐시된 데이터를 즉시 표시하고 백그라운드에서 새 데이터를 가져온다.
4. WHEN 차트를 렌더링할 때 THEN 시스템 SHALL Recharts 라이브러리를 사용하고, `isAnimationActive={false}`를 설정하여 렌더링 성능을 최적화한다 (기존 패턴 준수).
5. WHEN API 에러가 발생하면 THEN 시스템 SHALL 사용자에게 에러 메시지를 표시하고 수동 재시도 버튼을 제공한다.
