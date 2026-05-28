# Phase 2: 서버 사이드 데이터 수집 기반 선물 지표 요구사항

## 소개

BitScope Phase 2는 현재 클라이언트 사이드(인메모리 캐시) 기반으로 동작하는 선물 데이터 수집을 **서버 사이드 DB 영속화** 방식으로 전환하여, 시계열 히스토리 기반의 고급 선물 지표 4종을 구현하는 프로젝트이다.

기존 `FuturesCollectorService`는 Binance 단일 거래소에서 5개 심볼만 인메모리로 수집하지만, Phase 2에서는 **6개 거래소(Binance, Bybit, OKX, Gate.io, Bitget, Hyperliquid)** 의 전 코인 데이터를 1시간 간격으로 MySQL DB에 저장한다. 이를 통해 펀딩 히트맵, OI 변화율, OI-Normalized CVD, 3M 연환산 베이시스 등 시간축이 필요한 지표를 제공한다.

기존 `LiquidationModule`의 패턴(Entity -> CollectorService -> Service -> Controller -> Route Handler 프록시)을 따르며, `apps/api`(NestJS)에서 수집/저장, `apps/web`에서 프록시/시각화하는 구조를 유지한다.

**구현 대상 4개 기능:**
1. Funding APR Heatmap (마켓 스크리너)
2. OI Changes (마켓 스크리너)
3. OI-Normalized CVD (마켓 스크리너)
4. 3M Annualized Basis (선물 대시보드)

---

## 요구사항

### 요구사항 1: 멀티 거래소 펀딩/OI 데이터 수집 및 DB 저장

**User Story:** 시스템 운영자로서, 6개 거래소(Binance, Bybit, OKX, Gate.io, Bitget, Hyperliquid)의 전 코인 펀딩 비율과 OI 데이터를 주기적으로 수집하여 DB에 영속화하고 싶다. 이를 통해 시계열 히스토리 기반 분석 지표를 제공할 수 있다.

#### Acceptance Criteria

1. WHEN 서버(apps/api)가 시작되면 시스템 SHALL 즉시 1회 전 거래소의 펀딩 비율 및 OI 데이터를 수집하고 DB에 저장해야 한다.
2. WHEN 1시간 간격 타이머가 트리거되면 시스템 SHALL 6개 거래소의 벌크 API를 호출하여 전 코인의 (timestamp, symbol, exchange, fundingRate, openInterest) 데이터를 수집해야 한다.
3. WHEN 수집 데이터를 저장할 때 시스템 SHALL TypeORM Entity를 사용하여 `funding_oi_snapshot` 테이블에 배치 인서트해야 한다.
4. WHEN 거래소 API 호출이 실패하면 시스템 SHALL 해당 거래소만 건너뛰고 다른 거래소의 수집은 정상적으로 계속해야 한다.
5. WHEN 연속 3회 이상 API 호출이 실패하면 시스템 SHALL 해당 거래소에 대해 백오프 로직을 적용하고 경고 로그를 남겨야 한다.
6. IF 각 거래소 API의 심볼 포맷이 다른 경우(예: Binance "BTCUSDT", OKX "BTC-USDT-SWAP") THEN 시스템 SHALL 통일된 심볼 포맷(예: "BTC")으로 정규화하여 저장해야 한다.
7. WHEN 30일 이상 지난 데이터가 존재하면 시스템 SHALL 자동으로 오래된 데이터를 정리(cleanup)하여 DB 용량을 관리해야 한다.
8. WHERE `funding_oi_snapshot` 테이블에서 시스템 SHALL (symbol, timestamp)와 (exchange, timestamp) 복합 인덱스를 생성하여 조회 성능을 보장해야 한다.

### 요구사항 2: Taker Buy/Sell Volume 수집 및 DB 저장 (CVD 원천 데이터)

**User Story:** 시스템 운영자로서, Binance의 taker buy/sell volume 데이터를 주기적으로 수집하여 DB에 저장하고 싶다. 이를 통해 OI-Normalized CVD 지표를 계산할 수 있다.

#### Acceptance Criteria

1. WHEN 1시간 간격 타이머가 트리거되면 시스템 SHALL Binance의 `takerlongshortRatio` API 또는 Kline `takerBuyQuoteVol` 필드를 호출하여 코인별 taker buy/sell volume을 수집해야 한다.
2. WHEN 수집 데이터를 저장할 때 시스템 SHALL `taker_volume_snapshot` 테이블에 (timestamp, symbol, buyVolume, sellVolume) 형태로 저장해야 한다.
3. IF 수집 대상 코인이 너무 많아 Rate Limit에 걸릴 위험이 있는 경우 THEN 시스템 SHALL 코인 간 적절한 딜레이(예: 100ms)를 적용하거나 벌크 API를 우선 사용해야 한다.
4. WHEN 30일 이상 지난 데이터가 존재하면 시스템 SHALL 자동으로 오래된 데이터를 정리해야 한다.

### 요구사항 3: Funding APR Heatmap (마켓 스크리너 차트)

**User Story:** 트레이더로서, 코인 x 시간 축의 히트맵으로 OI 가중 평균 펀딩 비율의 시간별 변화를 시각화하고 싶다. 이를 통해 펀딩 과열 코인을 한눈에 파악하고 차익거래 기회를 발견할 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 Funding APR Heatmap 차트를 조회하면 시스템 SHALL DB에 저장된 펀딩 데이터를 기반으로 OI 가중 평균 펀딩을 계산해야 한다.
2. WHEN OI 가중 평균 펀딩을 계산할 때 시스템 SHALL `Sigma(거래소i의 Funding x 거래소i의 OI) / Sigma(거래소i의 OI)` 공식을 적용해야 한다.
3. WHEN 히트맵을 렌더링할 때 시스템 SHALL X축은 시간, Y축은 코인 심볼로 표시하고 셀 색상으로 펀딩 비율의 크기를 표현해야 한다.
4. WHEN 양의 펀딩(롱 과열)이면 시스템 SHALL 빨간색 계열로 표시하고, 음의 펀딩(숏 과열)이면 파란색 계열로 표시해야 한다.
5. WHEN 사용자가 기간을 선택하면 시스템 SHALL 1d(24시간), 1w(168시간), 1m(720시간) 중 선택한 기간의 데이터를 조회해야 한다.
6. WHEN 히트맵 셀에 마우스를 올리면 시스템 SHALL 해당 코인, 시간, OI 가중 평균 펀딩 비율(%), 각 거래소별 펀딩 비율을 툴팁으로 표시해야 한다.
7. WHEN 히트맵에 표시할 코인이 많을 경우 시스템 SHALL OI 상위 N개(기본 30개) 코인만 표시하고, 나머지는 스크롤로 접근할 수 있어야 한다.
8. WHERE 마켓 스크리너 페이지의 기존 "Funding APR Heatmap" 플레이스홀더 위치에서 시스템 SHALL Phase 2 구현으로 교체해야 한다.

### 요구사항 4: OI Changes 바 차트 (마켓 스크리너 차트)

**User Story:** 트레이더로서, 선택한 기간 동안 코인별 OI 변화율(%)을 바 차트로 확인하고 싶다. 이를 통해 포지션이 급격히 늘거나 줄어드는 코인을 발견하여 시장 관심이 어디로 이동하는지 파악할 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 OI Changes 차트를 조회하면 시스템 SHALL DB에서 현재 시점과 기준 시점의 OI 스냅샷을 조회하여 변화율을 계산해야 한다.
2. WHEN OI 변화율을 계산할 때 시스템 SHALL `(현재OI - 기준시점OI) / 기준시점OI x 100` 공식을 적용해야 한다.
3. WHEN 바 차트를 렌더링할 때 시스템 SHALL OI 변화율 상위 20개 코인을 내림차순으로 정렬하여 표시해야 한다.
4. WHEN 양의 변화율이면 시스템 SHALL 초록색 바로 표시하고, 음의 변화율이면 빨간색 바로 표시해야 한다.
5. WHEN 사용자가 기간을 선택하면 시스템 SHALL 1d, 1w, 1m 중 선택한 기간 이전의 OI를 기준 시점으로 사용해야 한다.
6. WHEN 바에 마우스를 올리면 시스템 SHALL 코인 심볼, OI 변화율(%), 현재 OI(USD), 기준 시점 OI(USD)를 툴팁으로 표시해야 한다.
7. WHERE 마켓 스크리너 페이지의 기존 "Open Interest (Top Coins)" 차트 위치에서 시스템 SHALL 절대 OI 크기 표시를 OI 변화율 기반으로 전환해야 한다.

### 요구사항 5: OI-Normalized CVD 바 차트 (마켓 스크리너 차트)

**User Story:** 트레이더로서, CVD(누적 거래량 델타)를 전 거래소 OI로 정규화한 지표를 코인별로 비교하고 싶다. OI 크기가 다른 코인 간에도 매수/매도 압력을 동일 선상에서 비교하여 공격적 매수/매도가 일어나는 코인을 찾을 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 OI-Normalized CVD 차트를 조회하면 시스템 SHALL DB에서 taker buy/sell volume 데이터를 조회하여 CVD를 계산해야 한다.
2. WHEN CVD를 계산할 때 시스템 SHALL `Sigma(takerBuyVolume - takerSellVolume)` 누적 합산 공식을 적용해야 한다.
3. WHEN Normalized CVD를 계산할 때 시스템 SHALL `CVD / 전 거래소 OI 합산`으로 정규화해야 한다.
4. WHEN 바 차트를 렌더링할 때 시스템 SHALL Normalized CVD 상위/하위 20개 코인을 정렬하여 표시해야 한다.
5. WHEN 양의 Normalized CVD이면 시스템 SHALL 초록색 바(순매수 우세)로 표시하고, 음이면 빨간색 바(순매도 우세)로 표시해야 한다.
6. WHEN 바에 마우스를 올리면 시스템 SHALL 코인 심볼, Normalized CVD 값, 원시 CVD(USD), 총 OI(USD)를 툴팁으로 표시해야 한다.
7. WHERE 마켓 스크리너 페이지의 기존 "OI-Normalized CVD" 플레이스홀더 위치에서 시스템 SHALL Phase 2 구현으로 교체해야 한다.

### 요구사항 6: 3M Annualized Basis 차트 (선물 대시보드)

**User Story:** 트레이더로서, BTC/ETH의 분기 선물 대비 현물 가격 차이(베이시스)를 연환산 퍼센트로 시각화하고 싶다. 이를 통해 시장의 미래 기대 심리와 캐리 트레이드 기회를 파악할 수 있다.

#### Acceptance Criteria

1. WHEN 서버가 데이터를 수집할 때 시스템 SHALL Binance `exchangeInfo` API에서 `CURRENT_QUARTER` 타입 심볼을 동적으로 조회하여 현재 분기 선물 심볼을 파악해야 한다.
2. WHEN 분기 선물 심볼이 파악되면 시스템 SHALL 분기 선물 가격과 Spot 가격을 주기적으로 수집하여 DB에 저장해야 한다.
3. WHEN 연환산 베이시스를 계산할 때 시스템 SHALL `((FuturesPrice - SpotPrice) / SpotPrice) x (365 / daysToExpiry) x 100` 공식을 적용해야 한다.
4. WHEN 차트를 렌더링할 때 시스템 SHALL X축은 시간, Y축은 연환산 베이시스(%)를 표시하는 라인 차트로 그려야 한다.
5. IF 사용자가 BTC 또는 ETH가 아닌 코인을 선택한 경우 THEN 시스템 SHALL "이 코인은 3M Basis를 지원하지 않습니다" 메시지를 표시해야 한다.
6. WHEN 분기 만기일이 변경(분기 교체)되면 시스템 SHALL 새로운 분기 선물 심볼을 자동으로 감지하고 전환해야 한다.
7. WHERE 선물 대시보드 페이지의 기존 "3M Basis" 플레이스홀더 차트 위치에서 시스템 SHALL Phase 2 구현으로 교체해야 한다.
8. WHEN 차트 포인트에 마우스를 올리면 시스템 SHALL 시간, 연환산 베이시스(%), 선물 가격, 현물 가격, 만기까지 남은 일수를 툴팁으로 표시해야 한다.

### 요구사항 7: 백엔드 API 엔드포인트

**User Story:** 프론트엔드 개발자로서, 집계된 선물 지표 데이터를 REST API로 조회하고 싶다. 이를 통해 차트 컴포넌트에서 데이터를 로드하고 시각화할 수 있다.

#### Acceptance Criteria

1. WHEN 프론트엔드가 펀딩 히트맵 데이터를 요청하면 시스템 SHALL `GET /funding-heatmap?period=1d` 엔드포인트에서 코인별/시간별 OI 가중 평균 펀딩 데이터를 JSON으로 반환해야 한다.
2. WHEN 프론트엔드가 OI 변화율 데이터를 요청하면 시스템 SHALL `GET /oi-changes?period=1d` 엔드포인트에서 코인별 OI 변화율(%) 데이터를 JSON으로 반환해야 한다.
3. WHEN 프론트엔드가 Normalized CVD 데이터를 요청하면 시스템 SHALL `GET /cvd-normalized?period=1d` 엔드포인트에서 코인별 Normalized CVD 데이터를 JSON으로 반환해야 한다.
4. WHEN 프론트엔드가 3M Basis 데이터를 요청하면 시스템 SHALL `GET /basis?symbol=BTC&period=1d` 엔드포인트에서 시계열 베이시스 데이터를 JSON으로 반환해야 한다.
5. WHEN API 응답을 반환할 때 시스템 SHALL `{ success: true, data: [...], timestamp: number }` 형태의 일관된 응답 포맷을 사용해야 한다.
6. IF 요청한 기간의 데이터가 아직 충분히 수집되지 않은 경우 THEN 시스템 SHALL 가용한 데이터 범위만 반환하고 `dataRange` 필드에 실제 데이터 범위를 명시해야 한다.

### 요구사항 8: Next.js Route Handler 프록시

**User Story:** 프론트엔드 개발자로서, Next.js Route Handler를 통해 apps/api의 엔드포인트를 프록시하여 CORS 문제 없이 데이터에 접근하고 싶다. 이를 통해 기존 프록시 패턴을 유지하면서 새로운 지표 데이터를 로드할 수 있다.

#### Acceptance Criteria

1. WHEN 프론트엔드 클라이언트가 `/api/futures-dashboard/funding-heatmap`, `/api/futures-dashboard/oi-changes`, `/api/futures-dashboard/cvd-normalized`, `/api/futures-dashboard/basis` 중 하나를 호출하면 시스템 SHALL 해당 요청을 apps/api의 대응 엔드포인트로 프록시해야 한다.
2. WHEN 프록시 응답을 캐싱할 때 시스템 SHALL 기존 liquidations 프록시와 동일한 패턴(1분 TTL, stale-while-revalidate)을 적용해야 한다.
3. IF apps/api가 응답 불능 상태인 경우 THEN 시스템 SHALL stale 캐시가 있으면 stale 데이터를 반환하고, 없으면 502 에러를 반환해야 한다.
4. WHEN 쿼리 파라미터를 전달할 때 시스템 SHALL period, symbol 등 필요한 파라미터를 apps/api로 그대로 전달해야 한다.

### 요구사항 9: 프론트엔드 데이터 페칭 및 상태 관리

**User Story:** 프론트엔드 개발자로서, TanStack Query를 사용하여 새로운 지표 데이터를 효율적으로 페칭하고 캐싱하고 싶다. 이를 통해 사용자 경험을 해치지 않으면서 최신 데이터를 제공할 수 있다.

#### Acceptance Criteria

1. WHEN 마켓 스크리너 페이지가 로드되면 시스템 SHALL TanStack Query를 사용하여 Funding Heatmap, OI Changes, Normalized CVD 데이터를 자동으로 페칭해야 한다.
2. WHEN 선물 대시보드 페이지에서 BTC 또는 ETH가 선택되면 시스템 SHALL TanStack Query를 사용하여 3M Basis 데이터를 페칭해야 한다.
3. WHILE 데이터가 로딩 중인 동안 시스템 SHALL 스켈레톤 UI 또는 로딩 인디케이터를 표시해야 한다.
4. WHEN 데이터 페칭이 실패하면 시스템 SHALL 사용자에게 에러 메시지를 표시하고 재시도 옵션을 제공해야 한다.
5. WHEN 사용자가 기간(1d/1w/1m)을 변경하면 시스템 SHALL 변경된 기간으로 데이터를 다시 페칭하고 차트를 갱신해야 한다.
6. WHEN TanStack Query의 refetchInterval을 설정할 때 시스템 SHALL 3분 이상의 간격으로 자동 갱신을 수행해야 한다.

---

## 비기능 요구사항

### NFR-1: 성능

1. WHEN 6개 거래소 벌크 API를 병렬 호출할 때 시스템 SHALL 전체 수집 시간이 30초 이내에 완료되어야 한다.
2. WHEN DB에서 1개월 분량의 히트맵 데이터를 조회할 때 시스템 SHALL 응답 시간이 3초 이내여야 한다.
3. WHEN 각 거래소 API 호출 시 시스템 SHALL 10초 타임아웃을 적용하여 전체 수집이 지연되지 않도록 해야 한다.

### NFR-2: 데이터 무결성

1. WHEN 동일 시간대에 같은 거래소/심볼의 데이터가 중복 수집되면 시스템 SHALL 중복 인서트를 방지하거나 upsert로 처리해야 한다.
2. WHEN 부분 수집 실패가 발생하면 시스템 SHALL 수집 성공한 거래소 데이터는 정상적으로 저장해야 한다.

### NFR-3: 모니터링

1. WHEN 각 수집 사이클이 완료될 때 시스템 SHALL 수집 건수, 소요 시간, 실패 거래소 등의 요약 로그를 남겨야 한다.
2. IF 특정 거래소가 연속 5회 이상 실패하면 시스템 SHALL 경고(WARN) 수준의 로그를 남겨야 한다.

### NFR-4: 확장성

1. WHERE 새로운 거래소를 추가할 때 시스템 SHALL 기존 코드에 최소한의 변경으로 새 거래소를 추가할 수 있는 구조(전략 패턴 또는 인터페이스 기반)를 제공해야 한다.

### NFR-5: DB 용량 관리

1. WHEN 데이터 보관 기간(기본 30일)이 지나면 시스템 SHALL 자동 cleanup 작업을 통해 오래된 레코드를 삭제하여 DB 용량을 관리해야 한다.
2. WHILE 1시간 간격으로 전 코인 데이터를 수집할 때 시스템 SHALL 월간 예상 레코드 수가 합리적인 범위(수백만 건 이하)에서 운영 가능해야 한다.
