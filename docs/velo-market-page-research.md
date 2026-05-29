# Velo.xyz/market 데이터 무료 구현 가능성 조사 및 구현 현황

> 최초 조사: 2026-05-27 / 최종 갱신: 2026-05-29
> 참고: [velo.xyz/market](https://velo.xyz/market) 의 마켓 스크리너/차트
> 관련: [선물 마켓 지표 조사](./futures-market-indicators-research.md) (개별 지표 거래소 API 상세)

## 1. 개요

velo.xyz/market은 크립토 선물 시장의 **마켓 와이드 스크리너**로, 250+ 코인에 대한 가격/OI/펀딩/청산/CVD 등을 멀티 거래소 집계하여 제공한다. Binance, Bybit, OKX, Deribit, Hyperliquid 데이터를 통합한다.

본 문서는 velo.xyz/market의 각 섹션을 분석하고, 동일한 데이터를 거래소 무료 공개 API로 직접 구현할 수 있는지 조사하며, **BitScope `/market-screener` 페이지의 실제 구현 현황**을 함께 기록한다.

**결론 요약: Velo Market 페이지의 거의 모든 데이터를 무료 거래소 공개 API로 구현했다.** 스크리너 테이블·Return Buckets·Sector Performance·Market Volume·Total OI는 벌크 ticker로 즉시 구현, 시계열/히트맵(Price Changes·OI Changes·Funding Heatmap·CVD)은 `apps/api` cron + DB 적재로 구현했다. 청산 히트맵만 일부 거래소(Bitget·Hyperliquid) 데이터 부재로 완전 커버리지가 불가능하며, BitScope에서는 청산을 별도의 선물 대시보드(`/futures-dashboard`)에서 다룬다.

---

## 2. 상단 스크리너 탭

Velo Market 상단에는 250+ 코인 테이블이 있고, 프리셋 필터/탭으로 빠르게 정렬할 수 있다.

### 탭 설명

#### 정렬 기반 탭

| 탭 | 의미 |
|---|---|
| **New Listings** | 최근 거래소에 새로 상장된 선물 코인 목록 |
| **Top Gainers** | 선택 기간 동안 가격 상승률이 가장 높은 코인 |
| **Top Losers** | 선택 기간 동안 가격 하락률이 가장 큰 코인 |
| **Top Volume** | 24시간 선물 거래량이 가장 큰 코인 |

#### 시가총액 분류 탭

| 탭 | 의미 | 기준 |
|---|---|---|
| **Large Cap** | 대형주 | 시가총액 $10B 이상 (BTC, ETH, SOL, BNB, XRP 등) |
| **Mid Cap** | 중형주 | 시가총액 $1B ~ $10B (AAVE, ARB, SUI 등) |
| **Small Cap** | 소형주 | 시가총액 $1B 미만 |

#### 섹터/카테고리 분류 탭

| 탭 | 의미 | 대표 코인 예시 |
|---|---|---|
| **DeFi** | 탈중앙화 금융 프로토콜 토큰 | AAVE, UNI, MKR, 1INCH, JUP, CRV, COMP, SNX |
| **L1** | 레이어 1 블록체인 네이티브 토큰 | BTC, ETH, SOL, AVAX, APT, BNB, SUI, NEAR, ADA |
| **L2** | 레이어 2 스케일링 솔루션 토큰 | ARB, OP, ZK, POL, STRK, MNT |
| **Metaverse** | 메타버스/가상세계/게이밍 토큰 | SAND, MANA, AXS, GALA, ENJ, RONIN |
| **Meme** | 밈 코인 | DOGE, SHIB, PEPE, BONK, WIF, POPCAT, FLOKI |
| **Dino** | 2017년 이전 출시된 오래된 코인 ("공룡 코인") | BTC, ETH, LTC, XRP, XLM, DOGE, XMR, ZEC, DASH, ETC |
| **AI** | AI/머신러닝 관련 프로젝트 토큰 | FET, NEAR, RENDER, TAO |
| **TradFi** | 전통 금융 자산의 무기한 선물 (주식, 원자재, 외환) | TSLA, NVDA, AAPL, GOOGL, AMZN, META, MSFT, SPX, 금, 원유 |

### Velo vs BitScope 필터/레이아웃 구조

Velo는 **단일 탭 그룹**으로 모든 필터를 같은 depth에 배치한다. 한 번에 하나만 선택 가능하며, 조합 필터링(예: "Large Cap + DeFi")은 불가능하다.

BitScope는 **3개 독립 탭 그룹**으로 분리하여 AND 조합 필터링을 지원하고, 추가로 화면 자체를 **Charts / Table 두 탭**으로 나눴다(2026-05-29 개편).

```
BitScope /market-screener
  [Charts] [Table]                       ← 상위 뷰 전환 탭
  시가총액: [All] [Large] [Mid] [Small]   ← Charts·Table 공용
  섹터:    [All] [DeFi] [L1] [L2] [Metaverse] [Meme] [Dino] [AI]  ← Charts·Table 공용
  정렬:    [Top Gainers] [Top Losers] [Top Volume] [New Listings]  ← Table 뷰에서만 표시
```

- **Charts 탭(기본)**: 10개 차트 그리드. 시가총액/섹터 필터가 차트 데이터에 적용된다. 정렬 탭은 의미가 없어 숨긴다.
- **Table 탭**: 정렬 탭 + 시가총액/섹터 필터 + 200행 테이블.
- 시가총액·섹터 필터는 두 탭이 공유하므로, 같은 필터 조건으로 차트와 테이블을 오가며 볼 수 있다.

| | Velo | BitScope |
|---|---|---|
| 필터 구조 | 단일 선택 (1개 탭 그룹) | 3중 조합 (정렬 × 시가총액 × 섹터) |
| 차트/테이블 | 한 화면 혼합 | Charts/Table 탭 분리 |
| "Large Cap + DeFi" | 불가능 | 가능 |
| 분석 유연성 | 낮음 | 높음 |

### 데이터 소스 (거래소 벌크 Ticker API)

모든 거래소가 **1번 호출로 전체 코인 ticker**를 무료 제공한다 (인증 불필요):

| 거래소 | 엔드포인트 | 포함 데이터 |
|---|---|---|
| Binance | `GET /fapi/v1/ticker/24hr` (symbol 생략) | 가격, 변화율, 거래량 (**OI 미포함**) |
| Bybit | `GET /v5/market/tickers?category=linear` | 가격, 변화율, 거래량, OI, 펀딩 |
| OKX | `GET /api/v5/market/tickers?instType=SWAP` | 가격, 변화율, 거래량 (**OI/펀딩 미포함**) |
| Gate.io | `GET /api/v4/futures/usdt/tickers` | 가격, 거래량, OI, 펀딩 |
| Bitget | `GET /api/v2/mix/market/tickers?productType=USDT-FUTURES` | 가격, 거래량, 펀딩, OI |
| Hyperliquid | `POST /info` `{"type":"metaAndAssetCtxs"}` | 가격, OI, 펀딩, 거래량 |

**구현 시 보충 호출**: Binance 벌크 ticker에는 OI가 없어 별도 처리가 필요하고(Total OI 차트에서 Binance 바는 0/생략), OKX 벌크 ticker에는 OI·펀딩이 없어 `/api/v5/public/open-interest?instType=SWAP`, `/api/v5/public/funding-rate`를 추가 호출해 보충한다.

### New Listings 감지

거래소 `exchangeInfo`(Binance) / `instruments`(Bybit/OKX) API를 주기적으로 호출하여 이전 목록과 비교해 신규 상장을 감지한다. **현재 구현은 Binance/Bybit exchangeInfo 기준 30일 이내 상장을 NEW 배지로 표시한다** (OKX 감지는 미구현).

### 시가총액 분류 (Large / Mid / Small Cap)

시가총액은 거래소 선물 API에 없으므로 별도 소스가 필요하다. 일반 기준은 Large > $10B, Mid $1B~$10B, Small < $1B.

| 방법 | 장점 | 단점 |
|---|---|---|
| CoinGecko `/coins/markets` API | 자동 분류 | 무료 10,000 calls/월 제한 |
| **하드코딩 (정적 매핑)** | 빠름 | 수동 업데이트 |
| 하이브리드 | 합리적 | 서버 캐싱 필요 |

**현재 구현**: 정적 매핑(`packages/shared` 상수)을 사용한다. 시가총액 매핑은 ~71개 코인이며, 매핑에 없는 코인은 시가총액 필터에서 'All'로만 노출된다(아래 8장 참조).

### 섹터/카테고리 분류

정적 매핑 테이블을 직접 관리한다. Dino는 공식 기준이 없는 커뮤니티 분류로 "2017년 이전 출시 + 여전히 활발히 거래"로 정의한다. **현재 섹터 매핑은 ~121개 코인**이며, 7개 섹터(DeFi, L1, L2, Metaverse, Meme, Dino, AI)로 분류한다.

### TradFi (전통 금융 자산 선물)

TradFi는 크립토 거래소에서 전통 금융 자산(주식/원자재/외환)을 무기한 선물로 거래하는 카테고리다. 거래소의 TradFi 선물 데이터(Hyperliquid HIP-3, Binance/Bybit/OKX Pre-IPO 선물 등)는 기존 공개 API로 무료 조회 가능하다. 단, Velo TradFi 페이지가 보여주는 **CME 데이터는 유료**이므로 별도 다룬다 ([Velo TradFi 조사](./velo-tradfi-research.md) 참조). **BitScope 스크리너에는 아직 TradFi 전용 분류를 구현하지 않았다.**

---

## 3. 차트/위젯 섹션 상세 분석 및 구현 현황

BitScope `/market-screener` Charts 탭에는 **10개 차트**가 있다. Velo 원본 위젯 4개(Return Buckets, Market Volume, Total OI, Sector Performance)와 추가 구현 6개(Price Changes, Funding Rate, OI Changes, Dominance, Funding Heatmap, Normalized CVD)로 구성된다.

### 3.1 Return Buckets (수익률 분포) — 구현 완료

선택 기간 동안 각 코인의 수익률을 구간별 히스토그램으로 분류. 마우스 오버 시 구간 코인 목록 표시.

- **데이터 소스**: 벌크 ticker 변화율 → 프론트 구간 분류 (추가 API 불필요)
- **구현 상태**: 24h 변화율 분포 히스토그램(±Infinity 극단값 포함) 구현 완료
- **남은 작업**: 기간 선택기(1w/1m) UI는 있으나 kline 데이터가 차트에 전달되지 않아 항상 24h 사용. 툴팁에 코인 수만 표시(심볼+수익률 목록 미표시)

### 3.2 Price Changes (가격 변화 차트) — 구현 완료

각 코인의 누적 가격 변화율(%)을 시계열로 비교.

- **데이터 소스**: 각 거래소 Kline API. 250코인 × 6거래소 = 1500 호출이라 서버 캐싱 필요
- **구현 상태**: 상위 코인 1d/1w/1m 가격 변화율 라인 차트 구현. 기간 전환 정상 동작
- **남은 작업**: `slice(0,20)` 후 정렬 → 전체 Top20이 아닌 임의 20개를 정렬하는 순서 이슈

### 3.3 Open Interest Changes (OI 변화 차트) — 구현 완료(서버 의존)

각 코인의 OI 누적 변화율(%)을 표시. 가격 변동 효과 제거를 위해 코인 단위 기준.

- **데이터 소스**: 서버에서 주기적 OI 스냅샷 저장 후 `(현재 OI − 기준 OI)/기준 OI × 100%`
- **구현 상태**: Phase 2 서버(`funding_oi_snapshot`) 기반 구현. 데이터 부족 시 ticker 폴백
- **남은 작업**: 백엔드가 시계열이 아닌 단일 변화율만 반환 (phase2-code-review P1-5)

### 3.4 Funding APR Heatmap (펀딩 히트맵) — 구현 완료(서버 의존)

코인 × 시간 히트맵. 값은 모든 지원 거래소의 **OI 가중 평균 펀딩 비율**.

```
가중 평균 Funding = Σ(거래소 Funding × 거래소 OI) / Σ(거래소 OI)
```

- **구현 상태**: Phase 2 서버 수집 + 커스텀 SVG 히트맵. OI 가중 평균 계산
- **남은 작업**: 하드코딩 RGB 색상(다크 모드 대비), 로딩 스켈레톤 미적용

### 3.5 OI-Normalized CVD — 구현 완료(서버 의존)

CVD(시장가 매수 − 매도 누적합)를 OI로 정규화. OI가 큰 코인과 작은 코인을 동일 선상에서 비교.

```
CVD = Σ(Taker Buy − Taker Sell)
Normalized CVD = CVD / Aggregated OI
```

- **데이터 소스**: Binance `takerBuyQuoteVol`(정확), 나머지 Kline 근사
- **구현 상태**: Phase 2 서버(`taker_volume_snapshot`, Binance) 기반 구현
- **남은 작업**: 분자(Binance CVD)와 분모(전 거래소 OI) 범위 불일치, 시계열 미반환 (phase2-code-review P1-6/P2-2)

### 3.6 Liquidations Heatmap (청산 히트맵) — 스크리너 미포함

청산은 BitScope에서 마켓 스크리너가 아닌 **선물 대시보드(`/futures-dashboard`)의 Liquidations 패널**로 구현했다. Binance/Bybit WebSocket + OKX/Gate REST 폴링으로 수집하며 Bitget/Hyperliquid는 데이터 부재로 미지원이다. 상세는 [선물 대시보드 기능 리뷰](./futures-dashboard-functional-review.md) 5장 참조.

### 3.7 Market Volume (시장 거래량) — 구현 완료

선택 코인들의 총 선물 거래량(달러)을 거래소별 바 차트로 표시.

- **데이터 소스**: 벌크 ticker의 `quoteVolume`/`turnover24h`/`volCcy24h` 등 합산 (추가 API 불필요)
- **구현 상태**: 6개 거래소별 24h 거래량 바 차트 구현 완료

### 3.8 Total Open Interest (총 미결제약정) — 구현 완료

선택 코인들의 총 OI를 거래소별 바 차트로 표시.

- **구현 상태**: 5개 거래소 OI 바 차트 구현. **Binance는 벌크 ticker에 OI가 없어 미포함(0)**

### 3.9 Sector Performance (섹터 성과) — 구현 완료

크립토 섹터의 상대 성과 비교. 기간 시작점을 0%로 리베이스.

- **데이터 소스**: 섹터-코인 매핑 + ticker 변화율로 섹터 평균 (추가 API 불필요)
- **구현 상태**: 7개 섹터(DeFi, L1, L2, Metaverse, Meme, Dino, AI) 평균 수익률 구현. (Velo는 6개 섹터에 Gaming 명칭 사용 — BitScope는 Metaverse+Dino 포함 7개)
- **남은 작업**: 기간 선택기 미구현(항상 24h). 툴팁에 코인 수/구성 목록 미표시

---

## 4. 무료 구현 가능성 및 구현 현황 종합

| # | 데이터 | 무료? | 서버 수집 | 구현 상태 | 비고 |
|---|---|:---:|:---:|:--------:|---|
| 1 | 스크리너 테이블 (Gainers/Losers/Volume/New) | O | X | **완료** | 벌크 ticker 1회 호출 |
| 2 | Return Buckets | O | X | **완료** | 기간 전환/툴팁 미완성 |
| 3 | Market Volume | O | △ | **완료** | 거래소별 24h 합산 |
| 4 | Total Open Interest | O | △ | **완료** | Binance OI 미포함 |
| 5 | Sector Performance | O | X | **완료** | 기간 선택기 미구현 |
| 6 | Price Changes | O | △ | **완료** | slice-then-sort 이슈 |
| 7 | OI Changes | O | O | **완료** | 서버 시계열 미반환 |
| 8 | Funding Heatmap | O | O | **완료** | OI 가중 평균 |
| 9 | CVD (OI-Normalized) | O | O | **완료** | Binance 단독, 시계열 미반환 |
| 10 | Dominance (추가) | O | X | **완료** | CoinGecko + ticker, 3-모드 토글 |
| 11 | Liquidations Heatmap | △ | O | 선물 대시보드 | Bitget/Hyperliquid 불가 |

> 원래 Phase 1(즉시)/Phase 2(서버 수집)/Phase 3(실시간) 우선순위로 계획했으며, Phase 1·2와 Phase 3의 CVD까지 모두 구현 완료했다. 청산 히트맵은 선물 대시보드로 분리 구현했다.

### API 호출 비용 추정

벌크 ticker는 6개 거래소 무료, rate limit 내. 1분 갱신 기준 6회/분 × 1440분 = 8,640 calls/day.

---

## 5. 데이터 파이프라인 및 집계 검증

### 집계 공식 (검증 완료, 정확)

| 항목 | 공식 | 구현 |
|------|------|------|
| 가격 | 거래량 가중평균 | `Σ(price × volume) / Σ(volume)` |
| 거래량 | 합산 | `Σ(volume24h)` |
| OI | 합산 | `Σ(openInterest)` |
| 펀딩비율 | OI 가중평균 | `Σ(funding × OI) / Σ(OI)` (OI=0 폴백) |
| change24h | 거래량 가중평균 | 합리적 |

### 심볼 정규화 (검증 완료)

| 패턴 | 구현 |
|------|:---:|
| Binance/Bybit `BTCUSDT` → `BTC` | O |
| OKX `BTC-USDT-SWAP` → `BTC` | O |
| Gate `BTC_USDT` → `BTC` | O |
| Bitget `BTCUSDT` → `BTC` | O |
| Hyperliquid `BTC` → `BTC` | O |
| `1000PEPE → PEPE` 등 11개 1000x 코인 | O (접두사 제거 + 가격 ×1000 보정) |
| USDT-마진만 필터링 | O (6개 거래소 모두) |

### 거래소별 데이터 정확성

| 거래소 | 종합 | 비고 |
|--------|:----:|------|
| Binance | 85% | 벌크 ticker에 OI 없어 Total OI에서 0 |
| Bybit | 90% | 1000x 코인 OI는 priceMultiplier 적용으로 개선. 원본 OI 단위 기준 추가 검증 권장 |
| OKX | 95% | OI/펀딩 별도 벌크 API 보충 |
| Gate.io | 95% | - |
| Bitget | 95% | - |
| Hyperliquid | 95% | - |

---

## 6. 현재 구현 현황 요약 및 남은 과제

### 구현 완료

- Charts/Table 탭 분리 + 시가총액/섹터 공용 필터 (정렬 탭은 Table 전용)
- 스크리너 테이블 (Top Gainers/Losers/Volume/New Listings)
- 10개 차트 (위 3장)
- 멀티 거래소 벌크 ticker 병렬 수집 + 심볼 정규화 + 집계
- Phase 2 서버 수집(OI Changes/Funding Heatmap/CVD)

### 구현 중 발견된 주요 이슈와 처리

| 이슈 | 처리 |
|------|------|
| 1000x 접두사 코인(`1000PEPE` 등 별도 집계) | `symbol-normalizer.ts`에서 접두사 제거 + 가격 ×1000 보정 |
| OKX/Bitget 에러 시 HTTP 200 반환 | `code` 필드 별도 체크 (`code !== "0"` / `"00000"`) |
| Binance 벌크 ticker OI 미포함 | Total OI에서 Binance 0 처리. (Phase 2는 상위 코인 개별 보충) |
| OKX 벌크 ticker OI/펀딩 미포함 | `open-interest`, `funding-rate` 벌크 API 2개 추가 호출 |

### 남은 과제

| 항목 | 내용 |
|------|------|
| Return Buckets 기간 전환 | PeriodTabs UI는 있으나 kline 데이터 미전달 → 항상 24h |
| Sector Performance 기간 선택기 | UI 자체 없음 → 항상 24h |
| Return Buckets / Sector 툴팁 | 코인 목록(심볼+수익률) 미표시 |
| 마지막 갱신 시간 / stale 경고 | 미표시 |
| 기본 정렬 탭 | 현재 `topVolume` (요구사항은 Top Gainers) |
| 테이블 행 | `slice(0, 200)` 하드코딩 — 250+ 가상 스크롤 미구현 |
| 코인 매핑 | 섹터 ~121개, 시가총액 ~71개 (목표 250+) |
| 검색 | 심볼만 지원 (코인 이름 검색 미지원) |
| 다크 모드 색상 | Funding Heatmap/Dominance 일부 하드코딩 색상 |

### 아키텍처 결정

| 결정 | 내용 |
|------|------|
| 데이터 수집 | `/api/market-screener/tickers`에서 6개 거래소 벌크 ticker 병렬 호출 |
| 심볼 정규화 | `symbol-normalizer.ts` (1000x 처리 포함) |
| 집계 방식 | 가격=거래량 가중평균, 거래량/OI=합산, 펀딩=OI 가중평균 |
| 분류 방식 | 시가총액/섹터 정적 매핑 (`packages/shared` 상수) |
| 캐싱 | 서버 InMemoryCache 30초 + 클라이언트 TanStack Query 30초 staleTime / 60초 refetchInterval |
| 에러 처리 | `Promise.allSettled` + 부분 장애 허용 |

> Velo의 유료($199/월) 가치는 **수년간 축적된 히스토리**에 있으며, 실시간 + 최근 히스토리는 자체 구현으로 충분하다.

---

## 7. 참고 자료

- [Velo Market Page](https://velo.xyz/market)
- [Velo Market Docs](https://docs.velo.xyz/web-app/market)
- [Velo Data GitBook - Market Page](https://velodata.gitbook.io/velo-data/market-page)
- [Binance Futures API - 24hr Ticker](https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/24hr-Ticker-Price-Change-Statistics)
- [Binance Futures API - Premium Index](https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Mark-Price)
- [Binance Futures API - Open Interest](https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Open-Interest)
- [Binance Futures API - Liquidation Streams](https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-market-streams/Liquidation-Order-Streams)
- [Binance Futures API - Taker Buy/Sell Volume](https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Taker-BuySell-Volume)
- [Bybit V5 API - Tickers](https://bybit-exchange.github.io/docs/v5/market/tickers)
- [Bybit V5 API - All Liquidation](https://bybit-exchange.github.io/docs/v5/websocket/public/all-liquidation)
- [OKX V5 API](https://www.okx.com/docs-v5/en/)
- [Gate.io Futures API](https://www.gate.com/docs/futures/api/index.html)
- [Bitget API - All Tickers](https://www.bitget.com/api-doc/contract/market/Get-All-Symbol-Ticker)
- [Hyperliquid API - metaAndAssetCtxs](https://docs.chainstack.com/reference/hyperliquid-info-meta-and-asset-ctxs)
- [CoinGecko API](https://www.coingecko.com/en/api)
