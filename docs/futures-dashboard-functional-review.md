# 멀티 거래소 선물 대시보드 기능 리뷰

> 최종 갱신: 2026-05-29
> 대상: `/futures-dashboard` (멀티 거래소 선물 마켓 데이터) 12개 지표
> 초점: 코드 품질이 아닌 **기능 동작 정합성** — 각 차트가 올바른 데이터를 올바른 형태로 표시하는지
> 비고: 본 문서는 2026-05-28 1차 기능 검증 이후의 수정 결과를 반영한 현행 상태 기록이다.

---

## 1. 12개 지표 동작 상태 종합

| # | 지표 | 판정 | 비고 |
|---|------|:----:|------|
| 1 | **price** | **동작** | 기간별 동적 interval. X축 포맷 분기 적용 |
| 2 | **volume24h** | **동작** | 스냅샷 바 차트, 6개 거래소 USDT 정규화 |
| 3 | **volumeHistory** | **동작** | 스택 바 차트. Gate `sum` 필드 사용, Hyperliquid만 30일 고정 |
| 4 | **oiSnapshot** | **동작** | 코인 단위 통일, Tooltip도 `(Coin)` 표기 |
| 5 | **oiHistory** | **부분** | Binance/Bybit 2개만. OKX/Gate/Bitget/Hyperliquid 제외(아래 7장) |
| 6 | **fundingRate** | **동작** | Annual/8hrs 토글. Hyperliquid 1h→8h 환산 |
| 7 | **liquidations** | **동작(백엔드 의존)** | NestJS + DB 경유. Binance/Bybit WS + OKX/Gate REST |
| 8 | **cvd** | **부분** | Binance 단독. OI Norm 토글 UI만 존재(계산 미구현) |
| 9 | **basis3m** | **동작(백엔드 의존)** | Binance COIN-M 분기 선물, BTC/ETH만 |
| 10 | **avgReturnByHour** | **동작** | Binance 단독, 카테고리 차트 |
| 11 | **avgReturnByDay** | **동작** | Binance 단독, 카테고리 차트 |
| 12 | **cumReturnBySession** | **부분** | Binance 단독. period 미반영(1h×720 고정), 다운샘플링 없음 |

---

## 2. 지표별 실제 거래소 지원 현황

지원 거래소는 `packages/shared` 의 `INDICATOR_EXCHANGE_SUPPORT` 상수로 단일 관리한다.

| # | 지표 | 지원 거래소 | 개수 | 비고 |
|---|------|-----------|:----:|------|
| 1 | price | Binance, Bybit, OKX, Gate, Bitget, Hyperliquid | 6 | 기간별 동적 interval |
| 2 | volume24h | Binance, Bybit, OKX, Gate, Bitget, Hyperliquid | 6 | USDT 단위 정규화 |
| 3 | volumeHistory | Binance, Bybit, OKX, Gate, Bitget, Hyperliquid | 6 | Hyperliquid 30일 고정 |
| 4 | oiSnapshot | Binance, Bybit, OKX, Gate, Bitget, Hyperliquid | 6 | 코인 단위 통일 |
| 5 | **oiHistory** | **Binance, Bybit** | **2** | OKX/Gate/Bitget/Hyperliquid 제외 |
| 6 | fundingRate | Binance, Bybit, OKX, Gate, Bitget, Hyperliquid | 6 | Hyperliquid 1h→8h 환산 |
| 7 | liquidations | Binance, Bybit (WS), OKX, Gate (REST) | 4 | NestJS 백엔드 필수, Bitget/Hyperliquid 미지원 |
| 8 | cvd | Binance | 1 | taker buy/sell 데이터 보유 거래소 한정 |
| 9 | basis3m | Binance | 1 | COIN-M 분기 선물, BTC/ETH만 |
| 10 | avgReturnByHour | Binance | 1 | 1시간봉 기반 |
| 11 | avgReturnByDay | Binance | 1 | 1시간봉 기반 |
| 12 | cumReturnBySession | Binance | 1 | APAC/EU/US 세션 |

> `basis3m` 지원 거래소는 과거 `['binance','okx']`로 선언됐으나, 백엔드가 Binance COIN-M만 수집하므로 실제 구현에 맞춰 `['binance']`로 정정했다.

---

## 3. 해결된 주요 이슈 (1차 검증 → 수정 완료)

1차 기능 검증에서 "차트가 이상하게 나오는" 원인으로 지목됐던 항목 대부분이 후속 커밋에서 수정됐다.

### 3.1 X축 날짜 포맷 기간별 분기 — 해결

이전: 시계열 차트가 `1d`만 시간(HH:mm), 그 외는 날짜(M/d)로 표시 → `1w`에서 24개 연속 "5/21" 같은 중복 발생.

해결: `period` prop을 차트 컴포넌트에 전달하여 데이터 범위(span)에 따라 포맷을 분기한다 (`price-chart.tsx`, `oi-history-chart.tsx` 등의 `isShortRange` 분기). 1d→HH:mm, 단기→M/d HH:mm, 장기→M/d.

### 3.2 mergeTimeSeries 동적 버킷 — 해결

이전: `BUCKET_MS = 3_600_000` (고정 1시간) → 1d에서 15분 캔들 4개가 1버킷으로 압축(해상도 손실), 장기에서 빈 버킷 대량 발생.

해결: `fetch-indicator.ts`의 `PERIOD_BUCKET_MS`로 기간별 버킷 크기를 동적 설정한다.

| 기간 | 버킷 |
|------|------|
| 1d | 15분 |
| 1w | 1시간 |
| 1m | 4시간 |
| 3m | 12시간 |
| 6m / 1y | 1일 |

### 3.3 OI 값 단위 통일 — 해결

이전: 거래소마다 OI 단위가 USD(Binance `sumOpenInterestValue`, Gate `open_interest_usd`)와 코인(Bybit `openInterest`)으로 혼재 → Y축 auto-scale이 큰 값 기준이 되어 작은 라인이 바닥에 깔림.

해결: OI Snapshot/History 모두 **코인 단위로 통일**한다. Binance는 `sumOpenInterest`(코인), Bybit는 `openInterest`(코인)를 사용하고, 코인 변환이 불가능한 Gate(계약 수)·OKX(불명확)는 OI History에서 제외한다(7장).

### 3.4 Gate.io Volume 3.3조 버그 — 해결

이전: Gate candlestick의 `v`(계약 수)에 `c`(close)를 곱해 캔들당 $3.3조 같은 비정상 값 발생.

해결: `normalizer.ts`에서 Gate volumeHistory는 `sum` 필드(실제 USDT 거래대금)를 사용한다.

### 3.5 oiSnapshot Tooltip 단위 표기 — 해결

이전: 코인 단위 값인데 Tooltip에 `$` 접두사 표시.

해결: `oi-snapshot-chart.tsx` Tooltip을 `Open Interest (Coin)`으로 표기.

### 3.6 3M Basis 엔드포인트(fapi→dapi) — 해결

이전: `basis-collector.service.ts`가 USD-M(`fapi.binance.com`)을 사용 → `CURRENT_QUARTER` 심볼 0건 조회 → 데이터 미수집.

원인: 분기 선물(Quarterly Futures)은 **COIN-M(`dapi.binance.com`)에만 존재**한다. USD-M에는 없다.

해결: `dapi.binance.com`으로 전환 + 심볼 형식 `BTCUSD_YYMMDD`(USD), `quoteAsset === 'USD'` 필터 적용.

| 항목 | 수정 후 (dapi) |
|------|---------------|
| exchangeInfo URL | `dapi.binance.com/dapi/v1/exchangeInfo` |
| 선물 가격 URL | `dapi.binance.com/dapi/v1/ticker/price` |
| 심볼 형식 | `BTCUSD_260626` (USD) |
| quoteAsset 필터 | `quoteAsset === 'USD'` |
| 스팟 가격 URL | `api.binance.com/api/v3/ticker/price?symbol=${base}USDT` (변경 없음) |

### 3.7 거래소별 라인 누락(connectNulls) — 해결

이전: 거래소별 interval 불일치로 특정 버킷에 데이터가 없으면 라인이 끊겨 "중간부터 나오는" 현상.

해결: 시계열 병합 시 누락 버킷을 `null`로 채워 `connectNulls`가 라인을 이어 그리도록 처리.

---

## 4. 남은 미해결 이슈

| # | 항목 | 영향 | 상태 |
|---|------|------|:----:|
| 1 | **Hyperliquid 기간 미반영** | volumeHistory/price 등에서 항상 30일/1h 고정 (`url-builder.ts`의 `buildHyperliquidBody`가 period별 interval/startTime 미매핑) | OPEN |
| 2 | **CVD OI Norm 토글 미구현** | Dollars/OI Norm 토글 UI는 있으나 OI 정규화 계산 로직 없음 | OPEN |
| 3 | **cumReturnBySession 다운샘플링/기간** | 1h×720 고정, period 미반영, mergeTimeSeries 미적용 | OPEN |
| 4 | **OI Changes / CVD 시계열 미반환(백엔드)** | Phase 2 서비스가 단일 집계값만 반환 → 시계열 라인 차트로는 부적합 (phase2-code-review P1-5/P1-6) | OPEN |
| 5 | **MAX(timestamp) 거래소별 미분리(백엔드)** | 거래소별 수집 시차로 일부 거래소 OI 누락 가능 (phase2-code-review P1-3) | OPEN |

> 1~3번은 미완성 기능(Hyperliquid 기간, CVD 모드, 세션 차트 정밀화), 4~5번은 Phase 2 백엔드 데이터 구조 한계다. 모두 `phase2-code-review.md` 8장 우선순위와 연동된다.

---

## 5. NestJS 백엔드 의존 지표 (Liquidations / 3M Basis)

12개 지표 중 **Liquidations와 3M Basis**는 거래소 API 직접 호출이 아닌 **NestJS 백엔드(`apps/api`) + MySQL DB**를 경유한다. 백엔드가 실행 중이지 않으면 해당 차트만 빈 상태가 된다.

### 5.1 Liquidations 데이터 흐름

```
[Binance/Bybit WebSocket + OKX/Gate REST 폴링]
  → NestJS LiquidationCollectorService → MySQL `liquidation`
  → NestJS LiquidationController (GET /liquidations)
  → Next.js Route Handler (/api/futures-dashboard/liquidations)
  → LiquidationsPanel (chart-grid.tsx) → LiquidationsChart
```

파이프라인 코드는 완성돼 있고 데이터 형태(`{timestamp, exchange, longUsd, shortUsd}`)도 양쪽 일치한다. 데이터가 안 나온다면 코드 버그가 아니라 **운영 상태** 문제일 가능성이 높다:

1. NestJS(`apps/api`)가 실행되지 않음 — 다른 지표는 거래소 직접 호출이라 동작하지만 Liquidations만 빈 차트
2. NestJS는 실행 중이나 DB에 데이터 미축적 (WS 연결 실패 / 최근 시작) → "청산 데이터 수집 중..." 표시
3. `API_BASE` 환경변수 불일치 — 프로덕션은 nginx가 `/api/backend/` → NestJS로 프록시

확인:
```
docker ps | grep api                                   # NestJS 실행 상태
# 브라우저 네트워크 탭: /api/futures-dashboard/liquidations?coin=BTC&period=1d
SELECT COUNT(*) FROM liquidation;                       # DB 적재 여부
```

### 5.2 3M Basis 데이터 흐름

```
[Binance COIN-M 분기 선물 가격 + Spot 가격]
  → NestJS BasisCollectorService → MySQL `basis_snapshot`
  → NestJS BasisService (연환산 계산) → Phase2Controller (GET /phase2/basis)
  → Next.js Route Handler (/api/futures-dashboard/basis) → useBasis → Basis3mChart
```

과거 `fapi`(USD-M) 사용으로 분기 심볼 0건 조회되던 버그는 `dapi`(COIN-M) 전환으로 해결됐다(3.6). `useBasis` 훅은 `enabled: ['BTC','ETH'].includes(symbol)`로 미지원 코인의 불필요한 호출을 차단한다.

---

## 6. 거래소별 OI History 지원 현황 및 단위 문제

OI History 차트는 거래소 간 비교를 위해 **코인 단위**로 통일했고, 코인 단위 변환이 불가능한 거래소는 제외했다.

| 거래소 | OI 히스토리 API | 지원 | 단위 | 제외 사유 |
|--------|:---:|:---:|------|----------|
| **Binance** | `/futures/data/openInterestHist` | O | 코인 (`sumOpenInterest`) | - |
| **Bybit** | `/v5/market/open-interest` | O | 코인 (`openInterest`) | - |
| OKX | `/api/v5/rubik/stat/contracts/open-interest-volume` | X | 불명확 | 기간 파라미터 무시, 항상 ~24시간만 반환 |
| Gate.io | `/api/v4/futures/usdt/contract_stats` | X | USD (`open_interest_usd`) / 계약 수 | 코인 변환에 필요한 `quanto_multiplier`가 동일 API에 없음 → 단위 불일치로 Y축 스케일 붕괴 |
| Bitget | - | X | - | OI 히스토리 전용 API 없음 |
| Hyperliquid | - | X | - | OI 히스토리 전용 API 없음 (`candleSnapshot`에 OI 미포함) |

### 향후 확장: Phase 2 서버 기반 OI History

`apps/api`의 Phase 2 모듈(`funding_oi_snapshot`)이 1시간마다 6개 거래소 OI를 **USD 단위로 통일**하여 DB에 저장 중이다. 데이터가 충분히 축적되면(24시간+) 거래소 공개 히스토리 API 대신 **자체 DB 기반 OI 히스토리**로 전환하여 6개 거래소 전부를 일관된 단위로 표시할 수 있다.

| 데이터 소스 | 거래소 수 | 단위 | 비고 |
|------------|:--------:|------|------|
| 거래소 API 직접 (현재) | 2 (Binance, Bybit) | 코인 | 즉시 사용 가능 |
| Phase 2 서버 DB (향후) | 6 (전체) | USD | 서버 배포 후 축적 필요 |

---

## 7. 참고: OKX Kline limit

이전 검토에서 OKX Kline limit 100 초과를 지적했으나, 현재 코드는 모든 기간에서 limit을 100 미만으로 설정해 초과 문제는 없다. 대신 데이터 밀도가 다른 거래소보다 낮은 트레이드오프가 있다.

| 기간 | OKX bar | OKX limit | API max | 초과? |
|------|---------|-----------|---------|:-----:|
| 1d | 15m | 96 | 100 | X |
| 1w | 2H | 84 | 100 | X |
| 1m | 8H | 90 | 100 | X |
| 3m | 1D | 90 | 100 | X |
| 6m | 2D | 90 | 100 | X |
| 1y | 1W | 52 | 100 | X |
