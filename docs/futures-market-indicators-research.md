# 선물 마켓 지표 조사 및 구현 현황

> 최초 조사: 2026-05-27 / 최종 갱신: 2026-05-29
> 참고: [velo.xyz/futures](https://velo.xyz/futures/) 의 선물 지표
> 관련: [선물 대시보드 기능 리뷰](./futures-dashboard-functional-review.md) (구현 동작 정합성), [Velo Market 페이지 조사](./velo-market-page-research.md) (마켓 스크리너)

## 1. 개요

velo.xyz는 크립토 선물 시장 데이터를 집계/시각화하는 서비스로, Binance, Bybit, OKX, Deribit, Hyperliquid 거래소 데이터를 통합 제공한다. 본 문서는 Velo가 제공하는 선물 지표를 거래소 무료 공개 API로 직접 구현할 수 있는지 조사하고, BitScope `/futures-dashboard`(멀티 거래소 선물 마켓 데이터) 페이지의 **실제 구현 현황**을 함께 기록한다.

### Velo API 비용과 비즈니스 모델

| 구분 | 접근 가능 범위 | 비용 |
|------|-------------|------|
| 무료 (인증 없음) | `/futures` 상품 목록만 조회 | 무료 |
| 유료 API | `/rows` 실제 데이터 (1분~ 해상도) | **$199/월** |

- API Base: `https://api.velo.xyz/api/v1`, 인증: Basic Auth, 응답: CSV, 제한: 요청당 최대 22,500 values

Velo는 데이터를 직접 생산하지 않고, 각 거래소의 **무료 공개 API**에서 수집/가공/보관 후 유료로 제공하는 데이터 집계 서비스다. 부가 가치는 ① 히스토리 축적(2021년~ 1분 해상도), ② 정규화(통일 CSV), ③ 파생 지표 계산(CVD, Basis, 세션 수익률), ④ 편의성(API + 웹앱)이다.

| 구독 | 히스토리 범위 |
|------|-------------|
| 월간 | 최근 **3개월** |
| 연간 | **전체** (2021년~) |

**결론: Velo 유료의 핵심 가치는 "이미 쌓아놓은 과거 데이터에 대한 접근권"이다.** 실시간 데이터 자체는 거래소에서 무료로 가져올 수 있으므로, 수년간 장기 히스토리가 필요하지 않다면 각 거래소 공개 API로 직접 구현하는 것이 합리적이다. BitScope는 `apps/api` cron으로 데이터를 주기적으로 수집해 히스토리를 점진적으로 축적한다.

| 영역 | Velo 의존 | BitScope 자체 구현 |
|------|----------|------------------|
| 실시간 데이터 | 불필요 | 동일한 거래소 무료 API |
| 최근 히스토리 (수일~수주) | 불필요 | 거래소 Kline 히스토리 API |
| 장기 히스토리 (수개월~수년) | 직접 쌓기 어려우면 필요 | `apps/api` cron → DB 적재 점진 축적 |
| 파생 지표 (CVD, Basis 등) | 불필요 | 계산 로직 구현 |
| 멀티 거래소 정규화 | 불필요 | 이미 구현됨 |

---

## 2. 지표별 상세 분석 및 구현 상태

> 리서치 단계에서는 9개 지표를 분석했고, 실제 구현에서는 12개 지표로 세분화했다(예: 가격→price, OI→oiSnapshot/oiHistory, 거래량→volume24h/volumeHistory, 시간대별 수익률→avgReturnByHour/avgReturnByDay). 각 지표의 실제 거래소 지원 현황은 3장 표 참조.

### 2.1 24h Volume — 구현 완료 (6개 거래소)

최근 24시간 총 선물 거래량(달러). 거래소별 분리 시 유동성 집중도 파악 가능. 거래량 급등은 큰 가격 변동의 선행 지표다.

| 거래소 | 엔드포인트 | 필드 |
|--------|-----------|------|
| Binance | `GET /fapi/v1/ticker/24hr` | `quoteVolume` |
| Bybit | `GET /v5/market/tickers?category=linear` | `turnover24h` |
| OKX | `GET /api/v5/market/ticker` | `volCcy24h` |
| Gate.io | `GET /api/v4/futures/usdt/contracts/{contract}` | `trade_size` |
| Bitget | `GET /api/v2/mix/market/ticker?productType=USDT-FUTURES` | `usdtVolume` |
| Hyperliquid | `POST /info` `metaAndAssetCtxs` | `dayNtlVlm` |

**구현**: 스냅샷 바 차트. `volume24h`(스냅샷) + `volumeHistory`(스택 바, 기간 선택)로 구현. 모두 USDT 단위 정규화.

### 2.2 Price — 구현 완료 (6개 거래소)

현재 선물 가격(마크/체결가). 거래소 간 비교로 가격 괴리(스프레드) 파악. 24h Volume과 동일 ticker 엔드포인트에서 제공.

**구현**: 라인 차트, 기간 선택(기간별 동적 interval — 1d→15m, 1w→1h, 1m→4h …).

### 2.3 Open Interest — 구현 완료 (스냅샷 6개 / 히스토리 2개)

시장에 열려 있는 선물 계약 총 규모. OI 증가+가격 상승=신규 롱, OI 증가+가격 하락=신규 숏.

| 거래소 | 스냅샷 | 히스토리 |
|--------|--------|----------|
| Binance | `GET /fapi/v1/openInterest` | `GET /futures/data/openInterestHist` (코인) |
| Bybit | ticker `openInterest` | `GET /v5/market/open-interest` (코인) |
| OKX | `GET /api/v5/public/open-interest` | rubik 통계 (기간 무시, ~24h 고정) |
| Gate.io | ticker `total_size` | `contract_stats` (USD/계약 수, 변환 불가) |
| Bitget | ticker | OI 히스토리 전용 API 없음 |
| Hyperliquid | metaAndAssetCtxs | OI 히스토리 없음 |

**구현**: `oiSnapshot`은 6개 거래소를 **코인 단위로 통일**. `oiHistory`는 단위 통일 가능한 **Binance/Bybit 2개만** 지원(상세는 선물 대시보드 리뷰 6장). 향후 Phase 2 서버 수집으로 6개 거래소 USD 단위 통일 예정.

### 2.4 Funding Rate — 구현 완료 (6개 거래소)

무기한 선물 가격을 현물에 수렴시키는 주기적 수수료(보통 8시간). 양수=롱 과열, 음수=숏 과열. APR 환산 = `Funding × 3 × 365`.

| 거래소 | 엔드포인트 |
|--------|-----------|
| Binance | `GET /fapi/v1/premiumIndex` (현재+예측) |
| Bybit | ticker / `GET /v5/market/funding/history` |
| OKX | `GET /api/v5/public/funding-rate` |
| Gate.io | ticker `funding_rate` |
| Bitget | `GET /api/v2/mix/market/current-fund-rate` |
| Hyperliquid | metaAndAssetCtxs `funding` |

**구현**: Annual/8hrs 토글. **Hyperliquid는 1시간 주기**이므로 8시간 환산(`rate1h × 24 × 365`로 연환산) 처리.

### 2.5 Liquidations — 구현 완료 (4개 거래소, 백엔드 의존)

강제 청산된 포지션 규모(롱/숏 구분). 대규모 청산은 연쇄 청산(Squeeze)의 신호.

| 거래소 | 방식 |
|--------|------|
| Binance | WebSocket `!forceOrder@arr` (실시간) |
| Bybit | WebSocket `allLiquidation` (실시간) |
| OKX | `GET /api/v5/public/liquidation-orders` (REST) |
| Gate.io | `GET /api/v4/futures/usdt/liq_orders` (REST) |
| Bitget / Hyperliquid | 공개 API 없음 (미지원) |

**구현**: `apps/api`의 `LiquidationModule`이 Binance/Bybit WebSocket 상시 연결 + OKX/Gate REST 5분 폴링 → MySQL `liquidation` 테이블. **NestJS 백엔드 필수**. 데이터 흐름 진단은 선물 대시보드 리뷰 5.1 참조.

### 2.6 CVD (Cumulative Volume Delta) — 구현 완료 (Binance 단독)

시장가 매수량 − 매도량의 누적합. CVD 상승=매수 압력, 하락=매도 압력. 가격과의 다이버전스는 추세 전환 신호. OI 정규화로 코인 간 비교 가능.

| 거래소 | 데이터 | 정확도 |
|--------|--------|:------:|
| Binance | Kline `takerBuyQuoteVol` / `takerlongshortRatio` | 정확 |
| 그 외 | Kline 기반 근사 | 근사 |

**구현**: Binance Kline `takerBuyQuoteVol` 기반(Phase 2 `taker_volume_snapshot`). 다른 거래소는 정확한 taker 데이터 미제공으로 제외. OI Norm 토글 UI는 있으나 계산 미구현(미완성).

### 2.7 3 Month Annualized Basis — 구현 완료 (Binance 단독, BTC/ETH, 백엔드 의존)

3개월 만기 선물과 현물 가격 차이를 연환산. 선물 시장의 낙관/비관 측정.

```
Basis = ((선물 − 현물) / 현물) × (365 / 만기까지 일수) × 100%
```

정상 5~15% APR, 과열 20%+, 마이너스=극도의 공포(Backwardation).

**구현**: `apps/api`의 `Phase2Module`(`BasisCollectorService`)이 **Binance COIN-M(`dapi.binance.com`) 분기 선물** + Spot 가격을 1시간마다 수집 → `basis_snapshot`. **분기 선물은 COIN-M에만 존재**하므로 USD-M(`fapi`)이 아닌 `dapi`를 사용한다(초기 fapi 사용 버그 수정 완료). 심볼 형식 `BTCUSD_YYMMDD`(USD). BTC/ETH만 대상. **NestJS 백엔드 필수**.

### 2.8 1m Average Return By Hour (UTC) — 구현 완료 (Binance 단독)

UTC 시간대(0~23시)별 평균 수익률. 미국장(UTC 13~14시)/아시아장(UTC 0~1시) 변동성 패턴 파악.

**구현**: `avgReturnByHour`. 리서치는 1분봉이었으나 **API 부하로 1시간봉 기반으로 변경**. `avgReturnByDay`(요일별)도 함께 구현. 카테고리 차트라 시계열 X축 문제 없음.

### 2.9 Cumulative Return By Session — 구현 완료 (Binance 단독)

지역 세션별 누적 수익률. 어느 지역이 상승/하락을 주도하는지 파악.

| 세션 | UTC | 지역 |
|------|-----|------|
| APAC | 00:00~08:00 | 아시아/태평양 |
| EU | 08:00~16:00 | 유럽 |
| US | 16:00~24:00 | 미국 |

**구현**: `cumReturnBySession`. 1시간봉 기반. 현재 1h×720 고정(기간 미반영) + 다운샘플링 미적용은 남은 과제.

---

## 3. 구현 가능성 및 실제 거래소 지원 현황 종합

### 거래소 공개 API 구현 가능성 (리서치)

| # | 지표 | Binance | Bybit | OKX | Gate | Bitget | Hyperliquid |
|---|------|:------:|:-----:|:---:|:----:|:-----:|:-----------:|
| 1 | 24h Volume | O | O | O | O | O | O |
| 2 | Price | O | O | O | O | O | O |
| 3 | Open Interest | O | O | O | O | O | O |
| 4 | Funding Rate | O | O | O | O | O | O |
| 5 | Liquidations | O | O | O | O | X | X |
| 6 | CVD | O (정확) | △ | △ | △ | △ | △ |
| 7 | 3M Basis | O | X | O | X | X | X |
| 8 | Avg Return/Hour | O | O | O | O | O | O |
| 9 | Return/Session | O | O | O | O | O | O |

### 실제 구현 시 거래소 지원 현황 (현재 코드)

`packages/shared`의 `INDICATOR_EXCHANGE_SUPPORT` 상수로 단일 관리한다.

| # | 지표 | 지원 거래소 | 개수 | 비고 |
|---|------|-----------|:----:|------|
| 1 | volume24h | 6개 전체 | 6 | 스냅샷 |
| 2 | price | 6개 전체 | 6 | 기간별 동적 interval |
| 3 | volumeHistory | 6개 전체 | 6 | Hyperliquid 30일 고정 |
| 4 | oiSnapshot | 6개 전체 | 6 | 코인 단위 통일 |
| 5 | **oiHistory** | **Binance, Bybit** | **2** | OKX/Gate/Bitget/Hyperliquid 제외 |
| 6 | fundingRate | 6개 전체 | 6 | Hyperliquid 1h→8h |
| 7 | liquidations | Binance, Bybit, OKX, Gate | 4 | WS+REST, 백엔드 필수 |
| 8 | cvd | Binance | 1 | taker 데이터 한정 |
| 9 | basis3m | Binance | 1 | COIN-M, BTC/ETH |
| 10 | avgReturnByHour | Binance | 1 | 1시간봉 |
| 11 | avgReturnByDay | Binance | 1 | 1시간봉 |
| 12 | cumReturnBySession | Binance | 1 | APAC/EU/US |

리서치에서 "전 거래소 가능"으로 본 CVD/Avg Return/Session은 **정확도·API 부하·데이터 가용성** 때문에 현재 Binance 단독으로 구현했다. 다른 거래소 확장은 정확도 검증과 추가 수집기가 필요한 후속 과제다.

---

## 4. 구현 중 발견된 주요 차이점

리서치 이후 실제 구현하며 확인된, 리서치 시점에 예측하지 못했던 제약들이다.

### OKX API 제약
- `/api/v5/market/candles` **최대 limit 100개** → interval을 크게 설정해 대응(1w→2H/84개, 1m→8H/90개)
- 에러 시에도 **HTTP 200 반환** + `{ code: "50014" }` → `code !== '0'` 별도 체크 필수
- rubik 통계 API(`/api/v5/rubik/stat/`)의 OI 히스토리는 ~24시간만 반환 → 사용 불가

### Hyperliquid 제약
- 펀딩이 **1시간 주기**(다른 거래소 8시간) → 연환산 `rate1h × 24 × 365`
- `candleSnapshot`이 **항상 30일/1h 고정** 반환 → period 파라미터 미지원. 현재 서버에서 기간 트리밍으로 대응하나, 기간별 동적 interval은 미구현
- OI 히스토리, taker buy/sell 데이터 없음

### OI 단위 불일치 (가장 까다로운 문제)
- 코인 단위: Binance `sumOpenInterest`, Bybit `openInterest`
- USD 단위: Gate `open_interest_usd`, Hyperliquid `openInterest × markPx`
- 계약 수: Gate `open_interest` (코인 아님, `quanto_multiplier` 필요)
- **처리**: oiSnapshot/oiHistory는 코인 단위 통일(USD 거래소 제외). 마켓 스크리너 Total OI는 Phase 2 서버 수집으로 USD 통일 계획

### Gate.io Volume History 단위
- candlestick `v` = **계약 수**(코인 아님). `v × c`는 비정상적으로 큼($3.3조/캔들)
- **처리**: `sum` 필드(실제 USDT 거래대금) 사용

### Binance 3M Basis 엔드포인트
- 분기 선물은 **COIN-M(`dapi.binance.com`)에만 존재**. USD-M(`fapi`)에는 없음
- 초기 `fapi` 사용으로 0건 조회 → `dapi`로 수정. 심볼 `BTCUSD_YYMMDD`(USD), `quoteAsset === 'USD'`

### 1000x 접두사 코인
- Binance/Bybit가 `1000PEPEUSDT`, `1000SHIBUSDT` 등 밈 코인에 1000x 접두사 사용
- **처리**: 심볼 정규화 시 접두사 제거 + 가격 ×1000 보정

### 시계열 차트 X축 / 버킷
- 거래소마다 다른 interval → 타임스탬프 불일치로 같은 시간에 합쳐지지 않음
- **처리**: `mergeTimeSeries`에서 기간별 동적 버킷 정규화(1d=15분, 1w=1시간, 1m=4시간, 3m=12시간, 6m/1y=1일) + X축 포맷 기간별 분기 + 누락 버킷 `null` 채움(connectNulls). Hyperliquid 30일 고정은 기간 트리밍으로 대응

---

## 5. NestJS 백엔드 의존 지표

아래 지표들은 거래소 API 직접 호출이 아닌 **NestJS 백엔드(`apps/api`) + MySQL DB**에 의존한다. 백엔드 미실행 시 해당 차트만 빈 상태가 된다.

| 지표 | NestJS 모듈 | 수집 방식 | DB 테이블 |
|------|------------|----------|----------|
| Liquidations | `LiquidationModule` | Binance/Bybit WS + OKX/Gate REST 5분 폴링 | `liquidation` |
| 3M Basis | `Phase2Module` | Binance COIN-M 분기 선물 + Spot 1시간 수집 | `basis_snapshot` |
| Funding Heatmap | `Phase2Module` | 6개 거래소 펀딩+OI 1시간 수집 | `funding_oi_snapshot` |
| OI Changes | `Phase2Module` | 위와 동일 | `funding_oi_snapshot` |
| Normalized CVD | `Phase2Module` | Binance taker buy/sell 1시간 수집 | `taker_volume_snapshot` |

Phase 2 수집기/쿼리 서비스의 코드 리뷰와 잔여 이슈는 [Phase 2 코드 리뷰](./phase2-code-review.md) 참조.

---

## 6. 아키텍처 결정 사항

| 결정 | 내용 |
|------|------|
| Route Handler 패턴 | 동적 라우트 `/api/futures-dashboard/[indicator]`로 다수 지표를 단일 핸들러에서 처리 |
| 백엔드 프록시 | NestJS 의존 지표는 별도 Route Handler에서 `getApiBaseUrl()` 유틸리티로 프록시 |
| 캐싱 전략 | 3단계 TTL — 스냅샷 30초 / 히스토리 5분 / Kline 집계 10분 |
| 파생 지표 계산 | 서버에서 Kline 기반 계산 후 결과만 클라이언트 전달(대역폭 절감) |
| 시계열 병합 | 기간별 동적 버킷 + 기간 트리밍 |
| Liquidations 수집 | WebSocket 상시 연결 + 배치 인서트(5초 flush) |
| Binance 도메인 분리 | USD-M `fapi`, COIN-M `dapi`, Spot `api` |

---

## 7. 참고 자료

- [Velo API Docs](https://docs.velo.xyz/api/http)
- [Velo Futures Page Docs](https://docs.velo.xyz/web-app/futures)
- [Velo Node.js SDK](https://github.com/velodataorg/velo-node)
- [Binance Futures API](https://binance-docs.github.io/apidocs/futures/en/)
- [Bybit V5 API](https://bybit-exchange.github.io/docs/v5/intro)
- [OKX V5 API](https://www.okx.com/docs-v5/en/)
