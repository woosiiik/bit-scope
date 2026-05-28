# 멀티 거래소 선물 대시보드 기능 리뷰

> 리뷰일: 2026-05-28
> 리뷰 방식: 4개 영역 병렬 기능 검증 (OI/Volume 파이프라인, Price/Kline 파이프라인, 12개 지표 E2E, 차트 렌더링/축)
> 초점: 코드 품질이 아닌 **기능 동작 정합성** — 각 차트가 올바른 데이터를 올바른 형태로 표시하는지

---

## 1. 12개 지표 동작 상태 종합

| # | 지표 | 판정 | 핵심 문제 |
|---|------|:----:|-----------|
| 1 | **price** | **동작** | X축 포맷 문제(1w/1m에서 날짜 중복), Hyperliquid 30일 고정 |
| 2 | **volume24h** | **동작** | - |
| 3 | **volumeHistory** | **부분** | Hyperliquid 코인 단위, 거래소별 interval 불일치, X축 포맷 |
| 4 | **oiSnapshot** | **부분** | Tooltip에 `$` 표시인데 실제 코인 단위 |
| 5 | **oiHistory** | **고장** | 거래소별 단위 불일치(USD vs 코인), 시간 범위 불일치, X축 포맷 |
| 6 | **fundingRate** | **동작** | Hyperliquid 1h→8h 환산 정확 |
| 7 | **liquidations** | **동작** | 백엔드(WebSocket+DB) 의존, X축 포맷 문제 |
| 8 | **cvd** | **부분** | OI Norm 토글 미구현, Binance 단독 |
| 9 | **basis3m** | **동작** | 백엔드(DB) 의존, BTC/ETH만, X축 포맷 문제 |
| 10 | **avgReturnByHour** | **동작** | Binance 단독, 카테고리 차트라 X축 문제 없음 |
| 11 | **avgReturnByDay** | **동작** | Binance 단독, 카테고리 차트라 X축 문제 없음 |
| 12 | **cumReturnBySession** | **부분** | period selector 무효, 720포인트 다운샘플링 없음, X축 포맷 |

---

## 2. 근본 원인 분석: 차트가 이상하게 나오는 이유

### 원인 1: X축 날짜 포맷이 기간에 맞지 않음 (가장 직접적 원인)

**영향**: price, oiHistory, volumeHistory, cvd, liquidations, basis3m, cumReturnBySession (7개 차트)

대부분의 시계열 차트가 이 포맷을 사용:
```typescript
// 1d에서만 시간(HH:mm), 그 외는 날짜(M/d)
if (isShortRange) return `${d.getHours()}:${d.getMinutes()}`;
return `${d.getMonth()+1}/${d.getDate()}`;
```

| 기간 | 캔들 간격 | 포맷 | 결과 |
|------|-----------|------|------|
| **1d** | 15분 | HH:mm | **정상** |
| **1w** | 1시간 | M/d | **24개 연속 "5/21" → 사용자 보고 증상과 정확히 일치** |
| **1m** | 4시간 | M/d | 6개 연속 같은 날짜 |
| **3m+** | 12시간~1일 | M/d | 경미하거나 정상 |

`liquidations`, `basis3m`, `cumReturnBySession`은 더 심각 — 무조건 날짜만 표시하고 interval 제한도 없음.

---

### 원인 2: 거래소별 시간 범위 불일치 (데이터가 부분적으로만 나오는 이유)

**영향**: oiHistory, volumeHistory, price

같은 기간을 선택해도 거래소마다 반환하는 시간 범위가 다름:

#### oiHistory — 1w 기간

| 거래소 | interval | 데이터 범위 | 문제 |
|--------|----------|-----------|------|
| Binance | 1h, 168개 | 7일 | 정상 |
| Bybit | 4h, 42개 | 7일 | 밀도 낮음 (1/4) |
| **OKX** | **고정 ~24h** | **1일** | **항상 1일만** — 리서치 버그 |
| **Gate** | **5분, 2000개** | **~7일** | 1m 이상에서 7일만 |

#### volumeHistory — 1w 기간

| 거래소 | interval | 데이터 범위 | 문제 |
|--------|----------|-----------|------|
| Binance | 1h, 168개 | 7일 | 정상 |
| Bybit | 1h, 168개 | 7일 | 정상 |
| OKX | **2H, 84개** | 7일 | 밀도 절반 |
| Gate | 1h, 168개 | 7일 | 정상 |
| Bitget | 1H, 168개 | 7일 | 정상 |
| **Hyperliquid** | **1h 고정, ~720개** | **30일** | **항상 30일** |

**사용자 보고: "OKX만 24시간 나오고 나머지는 중간부터"** — OKX oiHistory가 항상 ~24시간만 반환하므로, 7일 범위 차트에서 OKX는 맨 끝에만 선이 그려지고, 다른 거래소는 7일 전체에 걸쳐 선이 그려져 "나머지는 중간부터 나온다"는 현상이 설명됨.

**사용자 보고: "Gate는 08:30까지만"** — Gate oiHistory는 5분 간격 2000개(~7일)인데, mergeTimeSeries의 1시간 버킷 변환 과정에서 타임스탬프 매핑이 다른 거래소와 어긋나면 특정 시점 이후 데이터가 누락될 수 있음.

---

### 원인 3: mergeTimeSeries의 고정 1시간 버킷

**영향**: 모든 시계열 차트

```typescript
const BUCKET_MS = 3_600_000; // 고정 1시간
```

모든 기간에서 1시간 버킷을 사용하므로:

| 기간 | 캔들 간격 | 버킷 vs 캔들 | 결과 |
|------|-----------|-------------|------|
| **1d** | 15분 | 1h > 15m | **4개 캔들이 1개 버킷으로 → 해상도 75% 손실** |
| **1w** | 1시간 | 1h = 1h | 정상 |
| **1m** | 4시간 | 1h < 4h | 빈 버킷 발생 (3/4가 비어 있음) |
| **3m** | 12시간 | 1h ≪ 12h | 빈 버킷 대량 발생 (11/12 비어 있음) |
| **6m/1y** | 1일 | 1h ≪ 24h | 빈 버킷 대량 (23/24 비어 있음) |

**사용자 보고: "1D에서 16:30부터 차트 나옴"** — 1D 기간에서 15분 캔들이 1시간 버킷으로 압축되면, 수집 시점에 따라 첫 데이터 포인트가 특정 시각부터 시작할 수 있음. 또한 거래소별로 캔들 시작 시각이 다르면(UTC 00:00 vs UTC 08:00) 같은 시간대의 데이터가 다른 버킷에 배치되어 "중간부터 나오는" 현상 발생.

---

### 원인 4: OI 값 단위 불일치 (Y축이 이상한 이유)

**영향**: oiHistory

| 거래소 | normalizer 필드 | 단위 | BTC 예시 값 |
|--------|----------------|------|-----------|
| **Binance** | `sumOpenInterestValue` | **USD** | ~$10,000,000,000 |
| **Bybit** | `openInterest` | **코인** | ~166,666 BTC |
| **OKX** | rubik `item[1]` | 불명확 | ? |
| **Gate** | `open_interest_usd` 우선 | **USD** | ~$2,000,000,000 |

Binance가 $100억이고 Bybit가 166,666이면, Y축이 Binance 기준으로 auto-scale되어 Bybit 라인은 바닥에 납작하게 깔림. 사실상 Binance만 보이는 차트가 됨.

---

## 3. 거래소별 데이터 범위 상세 (모든 기간)

### oiHistory

| 기간 | Binance | Bybit | OKX | Gate |
|------|---------|-------|-----|------|
| **1d** | 15min×96=24h | 5min×200=16.7h | **~24h 고정** | 5min×288=24h |
| **1w** | 1h×168=7d | 4h×42=7d | **~24h 고정** | 5min×2000=6.9d |
| **1m** | 4h×180=30d | 1d×30=30d | **~24h 고정** | 5min×2000=**6.9d** |
| **3m** | 1d×90=90d | 1d×90=90d | **~24h 고정** | 5min×2000=**6.9d** |
| **6m** | 1d×180=180d | - | **~24h 고정** | 5min×2000=**6.9d** |

**OKX는 모든 기간에서 ~24시간만 반환**. Gate는 1m 이상에서 ~7일만 반환.

### volumeHistory / price (Kline 기반)

| 기간 | Binance | Bybit | OKX | Gate | Bitget | Hyperliquid |
|------|---------|-------|-----|------|--------|-------------|
| **1d** | 15m×96 | 15m×96 | 15m×96 | 15m×96 | 15m×96 | **1h×720=30d** |
| **1w** | 1h×168 | 1h×168 | **2H×84** | 1h×168 | 1H×168 | **1h×720=30d** |
| **1m** | 4h×180 | 4h×180 | **8H×90** | 4h×180 | 4H×180 | **1h×720=30d** |
| **3m** | 12h×180 | 12h×180 | **1D×90** | 8h×270 | 12H×180 | **1h×720=30d** |
| **1y** | 1d×365 | D×365 | **1W×52** | 1d×365 | 1D×365 | **1h×720=30d** |

**Hyperliquid는 모든 기간에서 30일/1h 고정**. OKX는 데이터 밀도가 다른 거래소의 절반~1/7.

---

## 4. 수정 우선순위

### 즉시 수정 (사용자 직접 체감)

#### 1. X축 포맷을 기간에 맞게 분기
- `period` prop을 차트 컴포넌트에 전달
- 1d→"HH:mm", 1w→"M/d HH:mm", 1m→"M/d HH:mm", 3m+→"M/d"
- liquidations, basis3m, cumReturnBySession에도 interval 제한 적용

#### 2. mergeTimeSeries 버킷 크기를 기간별 동적 설정
- 1d→15분, 1w→1시간, 1m→4시간, 3m→12시간, 6m/1y→1일
- 또는 가장 큰 interval에 맞춰 동적으로 결정

#### 3. OKX oiHistory 엔드포인트 교체
- 현재 `rubik/stat/contracts/open-interest-volume`는 ~24시간 고정
- OKX Kline 기반으로 OI 히스토리를 계산하거나, 지원 거래소에서 제외

#### 4. Hyperliquid period 파라미터 반영
- `buildHyperliquidBody`에 period별 interval/startTime 매핑 추가
- 1d→15m, 1w→1h, 1m→4h 등

### 단기 수정 (데이터 정확도)

#### 5. oiHistory 단위 통일
- 모든 거래소를 USD 단위로 통일 (코인 × 현재가)
- 또는 모든 거래소를 코인 단위로 통일

#### 6. Gate oiHistory interval 개선
- 5분 고정 + limit 2000 → 1m 이상에서 7일만 반환
- interval을 기간에 맞게 조정 (1m→1h, 3m→4h 등)

#### 7. volumeHistory Hyperliquid 단위 변환
- `v` (코인 단위) → `v * c` (USDT 환산)

#### 8. oiSnapshot Tooltip 단위 표시 수정
- `$` 접두사 제거 또는 코인 심볼 표시

### 중기 개선

#### 9. cumReturnBySession 다운샘플링 + period 반영
#### 10. CVD OI Norm 모드 구현 또는 토글 제거
#### 11. OKX Kline 밀도 개선 (interval을 다른 거래소와 동일하게, 페이지네이션)

---

## 5. 참고: API limit 초과 여부 검증

이전 리뷰에서 OKX Kline limit 100 초과를 지적했으나, 현재 코드에서는 **모든 기간에서 100 미만으로 설정**되어 있어 limit 초과 문제는 없음. 대신 데이터 밀도가 다른 거래소보다 낮은 트레이드오프가 있음.

| 기간 | OKX bar | OKX limit | API max | 초과? |
|------|---------|-----------|---------|:-----:|
| 1d | 15m | 96 | 100 | X |
| 1w | 2H | 84 | 100 | X |
| 1m | 8H | 90 | 100 | X |
| 3m | 1D | 90 | 100 | X |
| 6m | 2D | 90 | 100 | X |
| 1y | 1W | 52 | 100 | X |

---

## 6. 거래소별 OI History 지원 현황 및 단위 문제 (2026-05-28 확정)

### 현재 OI History 지원 상태

| 거래소 | OI 히스토리 API | 지원 상태 | 단위 | 제외 사유 |
|--------|:---:|:---:|------|----------|
| **Binance** | `/futures/data/openInterestHist` | **포함** | 코인 (`sumOpenInterest`) | - |
| **Bybit** | `/v5/market/open-interest` | **포함** | 코인 (`openInterest`) | - |
| OKX | `/api/v5/rubik/stat/contracts/open-interest-volume` | **제외** | 불명확 | 항상 ~24시간만 반환 (기간 파라미터 무시) |
| Gate.io | `/api/v4/futures/usdt/contract_stats` | **제외** | USD (`open_interest_usd`) | 다른 거래소와 단위 불일치 (USD vs 코인). 코인 단위 변환에 필요한 가격 정보가 동일 API에 없음 |
| Bitget | - | **제외** | - | OI 히스토리 전용 API 자체가 없음 |
| Hyperliquid | - | **제외** | - | OI 히스토리 전용 API 없음. `metaAndAssetCtxs`는 현재 스냅샷만 제공, `candleSnapshot`에 OI 미포함 |

### 단위 통일 문제

OI History 차트에서 거래소 간 비교를 위해 **코인 단위**로 통일했다:

- **Binance**: `sumOpenInterest` (코인) — `sumOpenInterestValue` (USD)도 제공하지만 코인 단위 사용
- **Bybit**: `openInterest` (코인) — 가격을 곱하지 않은 원본 값
- **Gate.io**: `open_interest_usd` (USD) — 코인 단위 변환 불가 → **제외**
  - Gate의 `open_interest`는 **계약 수** (코인 수가 아님). 코인으로 변환하려면 `quanto_multiplier`가 필요하나 `contract_stats` API에 미포함
  - 결과: Gate OI가 ~46억으로 표시되어 다른 거래소 라인이 바닥에 깔리는 문제 발생 → 제외

### Phase 2 서버 수집으로 해결 가능

`apps/api`의 Phase 2 모듈(`funding_oi_snapshot` 테이블)이 **1시간마다 6개 거래소의 OI를 USD 단위로 통일**하여 DB에 저장하고 있다.
서버 데이터가 충분히 축적되면(최소 24시간 이상), 거래소 공개 API 히스토리 대신 **자체 DB 기반 OI 히스토리**로 전환하여 6개 거래소 전부를 USD 단위로 일관되게 보여줄 수 있다.

| 데이터 소스 | 거래소 수 | 단위 | 기간 범위 | 비고 |
|------------|:--------:|------|----------|------|
| 거래소 API 직접 (현재) | 2개 (Binance, Bybit) | 코인 | API가 제공하는 만큼 | 즉시 사용 가능 |
| Phase 2 서버 DB (향후) | **6개** (전체) | **USD** | **축적 시간에 비례** | 서버 배포 후 데이터 축적 필요 |
