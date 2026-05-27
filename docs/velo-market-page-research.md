# Velo.xyz/market 데이터 무료 구현 가능성 조사

> 조사일: 2026-05-27
> 참고: [velo.xyz/market](https://velo.xyz/market) 에서 제공하는 마켓 스크리너/차트를 기반으로 조사
> 관련: [선물 마켓 지표 조사](./futures-market-indicators-research.md) (개별 지표 거래소 API 상세)

## 1. 개요

velo.xyz/market은 크립토 선물 시장의 **마켓 와이드 스크리너**로, 250+ 코인에 대한 가격/OI/펀딩/청산/CVD 등을 멀티 거래소 집계하여 제공한다. Binance, Bybit, OKX, Deribit, Hyperliquid 5개 거래소 데이터를 통합한다.

본 문서는 velo.xyz/market의 각 섹션을 분석하고, 동일한 데이터를 거래소 무료 공개 API로 직접 구현할 수 있는지를 조사한다.

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
| **Small Cap** | 소형주 | 시가총액 $1B 미만 (변동이 크고 리스크가 높은 코인) |

#### 섹터/카테고리 분류 탭

| 탭 | 의미 | 대표 코인 예시 |
|---|---|---|
| **DeFi** | 탈중앙화 금융 프로토콜 토큰 | AAVE, UNI, MKR, 1INCH, JUP, CRV, COMP, SNX |
| **L1** | 레이어 1 블록체인 네이티브 토큰 | BTC, ETH, SOL, AVAX, APT, BNB, SUI, NEAR, ADA |
| **L2** | 레이어 2 스케일링 솔루션 토큰 | ARB, OP, ZK, POL, STRK, MNT |
| **Metaverse** | 메타버스/가상세계/게이밍 토큰 | SAND, MANA, AXS, GALA, ENJ, RONIN |
| **Meme** | 밈 코인 | DOGE, SHIB, PEPE, BONK, WIF, POPCAT, FLOKI |
| **Dino** | 2017년 이전 출시된 오래된 코인 ("공룡 코인"). 다수의 시장 사이클을 생존한 베테랑 코인 | BTC, ETH, LTC, XRP, XLM, DOGE, XMR, ZEC, DASH, ETC |
| **AI** | AI/머신러닝 관련 프로젝트 토큰 | FET, NEAR, RENDER, TAO |
| **TradFi** | 전통 금융 자산의 무기한 선물 (주식, 원자재, 외환). 크립토 거래소에서 전통 금융 자산을 24/7 거래 가능하게 한 새로운 카테고리 | TSLA, NVDA, AAPL, GOOGL, AMZN, META, MSFT, SPX, 금, 원유 |

이것들은 본질적으로 **같은 테이블 데이터를 다른 정렬/필터로 보여주는 뷰**이다.

#### Velo vs BitScope 필터 구조 비교

Velo는 **단일 탭 그룹**으로 모든 필터를 같은 depth에 배치한다. 한 번에 하나만 선택 가능하며, 조합 필터링(예: "Large Cap + DeFi")은 불가능하다.

```
Velo: [Top Gainers] [Top Losers] [Top Volume] [New Listings] [Large Cap] [Mid Cap] [Small Cap] [DeFi] [L1] [L2] [Meme] ...
→ 한 번에 하나만 활성화
```

BitScope에서는 **3개 독립 탭 그룹**으로 분리하여 AND 조합 필터링을 지원한다:

```
BitScope:
  정렬:    [Top Gainers] [Top Losers] [Top Volume] [New Listings]
  시가총액: [All] [Large] [Mid] [Small]
  섹터:    [All] [DeFi] [L1] [L2] [Metaverse] [Meme] [Dino] [AI]
→ 3개 그룹에서 각각 하나씩 선택 → AND 조합 (예: "Top Gainers + Large Cap + DeFi")
```

| | Velo | BitScope |
|---|---|---|
| 필터 구조 | 단일 선택 (1개 탭 그룹) | 3중 조합 (정렬 × 시가총액 × 섹터) |
| "Large Cap + DeFi" | 불가능 | 가능 |
| "Top Gainers + Meme" | 불가능 | 가능 |
| UI 복잡도 | 단순 (1줄) | 약간 복잡 (3줄, ⓘ 도움말 제공) |
| 분석 유연성 | 낮음 | 높음 |

BitScope 방식이 분석 유연성이 높으므로 현재 구조를 유지한다.

### 데이터 소스 (거래소 벌크 Ticker API)

모든 거래소가 **1번 호출로 전체 코인 ticker**를 무료 제공한다 (인증 불필요):

| 거래소 | 엔드포인트 | 포함 데이터 | 비고 |
|---|---|---|---|
| Binance | `GET /fapi/v1/ticker/24hr` (symbol 생략) | 가격, 변화율, 거래량 | Weight 40, 2400/min |
| Bybit | `GET /v5/market/tickers?category=linear` | 가격, 변화율, 거래량, OI, 펀딩 | 공개 |
| OKX | `GET /api/v5/market/tickers?instType=SWAP` | 가격, 변화율, 거래량 | 공개 |
| Gate.io | `GET /api/v4/futures/usdt/tickers` | 가격, 거래량, OI, 펀딩 | 공개 |
| Bitget | `GET /api/v2/mix/market/tickers?productType=USDT-FUTURES` | 가격, 거래량, 펀딩, OI | 공개 |
| Hyperliquid | `POST /info` `{"type":"metaAndAssetCtxs"}` | 가격, OI, 펀딩, 거래량 | 공개 |

### New Listings 감지

거래소 `exchangeInfo` (Binance) 또는 `instruments` (Bybit/OKX) API를 주기적으로 호출하여 이전 목록과 비교하면 신규 상장을 감지할 수 있다.

### 시가총액 분류 (Large / Mid / Small Cap)

시가총액은 거래소 선물 API에 포함되지 않으므로 별도 소스가 필요하다:

| 방법 | 장점 | 단점 |
|---|---|---|
| **CoinGecko `/coins/markets` API** | 자동 분류, 600+ 카테고리 지원 | 무료 10,000 calls/월 제한 |
| **하드코딩 (정적 매핑)** | API 호출 없음, 빠름 | 수동 업데이트 필요 |
| **하이브리드** | 서버에서 주기적으로(1일 1회) CoinGecko 조회 → DB 캐싱 | 가장 합리적 |

일반적 기준: Large Cap > $10B, Mid Cap $1B~$10B, Small Cap < $1B.

### 섹터/카테고리 분류 (DeFi, L1, L2, Metaverse, Meme, Dino, AI)

구현 방법:

| 방법 | 설명 |
|---|---|
| **정적 매핑 (추천)** | 코인-섹터 매핑 테이블을 직접 관리. Velo도 자체 분류 사용. 선물 상장 코인이 250개 수준이므로 수동 관리 가능 |
| **CoinGecko Categories API** | `/coins/categories`로 600+ 카테고리 자동 분류. 단, 무료 호출 제한 있음 |

Dino 코인은 공식 기준이 없는 커뮤니티 분류이므로, 일반적으로 **2017년 이전 출시 + 여전히 활발히 거래되는 코인**으로 정의하여 직접 목록을 관리한다.

### TradFi (전통 금융 자산 선물)

TradFi는 크립토 거래소에서 전통 금융 자산(주식, 원자재, 외환)을 무기한 선물로 거래하는 새로운 카테고리이다.

#### Velo의 TradFi 페이지

Velo의 TradFi 페이지(`velo.xyz/tradfi`)는 **CME(시카고상품거래소)** 의 크립토 선물/옵션 데이터를 보여준다:
- BTC/ETH CME 선물 OI, 거래량
- CME 차월물 연환산 베이시스
- GBTC/ETHE 프리미엄 (시장가 vs NAV)
- 데이터 갱신: 매일 오후 10:30 ET

#### 거래소별 TradFi 자산 지원 현황

| 거래소 | TradFi 자산 | 데이터 API |
|---|---|---|
| **Hyperliquid** | HIP-3로 주식(TSLA, NVDA, AAPL, GOOGL, AMZN, META, MSFT, PLTR 등), 원자재(금, 은, 원유), 외환(EUR/USD, GBP/USD) 지원 | 기존 `/info` API 동일, asset ID로 구분 |
| **Binance** | Pre-IPO 무기한 선물 (SPCXUSDT, OPENAIUSDT 등) | 기존 선물 API 동일 |
| **Bybit** | TradFi 무기한 선물 (미국 주식, 글로벌 ETF) | 기존 V5 API 동일 |
| **OKX** | Pre-IPO 무기한 선물 (OpenAI, SpaceX, Anthropic) | 기존 V5 API 동일 |

#### TradFi 데이터 무료 취득 가능 여부

- **거래소의 TradFi 선물 데이터**: 기존 크립토 선물과 동일한 공개 API로 조회 가능 → **무료**
- **CME 데이터 (Velo TradFi 페이지)**: CME는 별도 유료 데이터 피드이므로 직접 구현은 어려움. 다만 BitScope에서는 CME보다 **거래소 TradFi 선물 데이터**에 집중하는 것이 합리적

### 구현 가능 여부: **O (모든 거래소 무료, 섹터 분류는 정적 매핑으로 관리)**

---

## 3. 차트/위젯 섹션 상세 분석

### 3.1 Return Buckets (수익률 분포)

#### 의미

선택 기간(1d, 1w, 1m 등) 동안 각 코인의 수익률을 **구간별(bucket)**로 분류한 히스토그램. 예: -10%~-5% 구간에 15개 코인, +5%~+10% 구간에 8개 코인. 마우스 오버 시 해당 구간에 속하는 코인 목록이 표시된다.

#### 활용

- 시장 전체의 수익률 분포를 한눈에 파악 ("대부분 코인이 빠졌나, 올랐나")
- 극단적 분포 → 시장 과열/공포 판단
- 특정 기간의 시장 건강도 진단

#### 데이터 소스

벌크 ticker API에서 전 코인 가격 변화율을 가져온 후, **프론트엔드에서 구간 분류**하면 된다. 추가 API 호출 불필요.

#### 구현 가능 여부: **O (가장 쉬움, ticker 데이터 → 프론트엔드 계산)**

---

### 3.2 Price Changes (가격 변화 차트)

#### 의미

각 코인의 **누적 가격 변화율(%)** 을 시계열로 보여주는 차트. 여러 코인을 동시에 비교하여 상대적 성과를 파악할 수 있다. 워치리스트로 필터링 가능.

#### 활용

- 특정 기간 동안 코인 간 상대 성과 비교
- 모멘텀 강한 코인 발견
- 섹터별 흐름 파악

#### 데이터 소스

| 거래소 | 엔드포인트 | 인증 | 비고 |
|---|---|:---:|---|
| Binance | `GET /fapi/v1/klines?interval=1h` | 불필요 | 최대 1500개 캔들, weight 2 |
| Bybit | `GET /v5/market/kline?category=linear` | 불필요 | - |
| OKX | `GET /api/v5/market/candles` | 불필요 | - |
| Gate.io | `GET /api/v4/futures/usdt/candlesticks` | 불필요 | - |
| Bitget | Kline API | 불필요 | - |
| Hyperliquid | `POST /info` `{"type":"candleSnapshot"}` | 불필요 | 최대 5000개 |

#### 제약 사항

코인 수가 많으면 API 호출 횟수가 급증한다. 250개 코인 × 6개 거래소 = 1500 호출. 서버에서 주기적으로 수집/캐싱하는 것이 합리적이다.

#### 구현 가능 여부: **O (무료, 코인 다수 시 서버 캐싱 필요)**

---

### 3.3 Open Interest Changes (OI 변화 차트)

#### 의미

각 코인의 **미결제약정(OI) 누적 변화율(%)** 을 코인 단위로 표시. 달러 기준이 아닌 코인 기준으로 표시하여 가격 변동 효과를 제거한다.

#### 활용

- OI 급증 코인 = 새로운 포지션 대량 진입 → 큰 움직임 예고
- OI 감소 = 포지션 정리 중 → 추세 약화 가능
- 거래소별 OI 비교로 포지션 쏠림 파악

#### 데이터 소스 (현재 OI 스냅샷 - 벌크)

대부분 거래소의 ticker API에 현재 OI가 포함되어 있다:

| 거래소 | 벌크 현재 OI | 개별 OI 히스토리 |
|---|:---:|---|
| Binance | X (개별만, `GET /fapi/v1/openInterest`, weight 1) | `GET /futures/data/openInterestHist` (5m/1h/1d) |
| Bybit | O (ticker에 포함) | `GET /v5/market/open-interest` (개별 심볼) |
| OKX | O (`GET /api/v5/public/open-interest?instType=SWAP` 벌크) | - |
| Gate.io | O (ticker에 `total_size` 포함) | - |
| Bitget | O (ticker에 포함) | `GET /api/v2/mix/market/open-interest` |
| Hyperliquid | O (metaAndAssetCtxs에 포함) | - |

#### 누적 변화율 계산

서버에서 주기적으로(예: 5분~1시간) OI 스냅샷을 DB에 저장하고, `(현재 OI - 기준시점 OI) / 기준시점 OI × 100%`으로 계산한다.

#### 구현 가능 여부: **O (무료, 서버에서 주기적 스냅샷 저장 필요)**

---

### 3.4 Funding APR Heatmap (펀딩 비율 히트맵)

#### 의미

코인 × 시간 축의 히트맵으로 펀딩 비율의 시간별 변화를 시각화. 값은 모든 지원 거래소의 **OI 가중 평균 펀딩 비율**. 8시간 기준 또는 연환산(APR)으로 표시 가능.

- 빨간색 = 높은 양의 펀딩 (롱 과열)
- 파란색/초록색 = 음의 펀딩 (숏 과열)

#### 활용

- 펀딩 과열 코인 한눈에 파악
- 시간대별 펀딩 변화 추이로 시장 심리 변화 추적
- 차익거래(Funding Arbitrage) 기회 발견

#### OI 가중 평균 계산

```
가중 평균 Funding = Σ(거래소i의 Funding × 거래소i의 OI) / Σ(거래소i의 OI)
```

#### 데이터 소스

| 거래소 | 현재 펀딩 (벌크) | 펀딩 히스토리 |
|---|:---:|---|
| Binance | `GET /fapi/v1/premiumIndex` (전 코인, weight 10) | `GET /fapi/v1/fundingRate` (개별, 최근 1000건) |
| Bybit | O (ticker에 포함) | `GET /v5/market/funding/history` (개별) |
| OKX | `GET /api/v5/public/funding-rate` | `GET /api/v5/public/funding-rate-history` |
| Gate.io | O (ticker에 포함) | - |
| Bitget | O (ticker에 포함, 벌크 가능) | 히스토리 API 있음 |
| Hyperliquid | O (metaAndAssetCtxs에 포함) | - |

#### 구현 방법

서버에서 주기적으로(예: 1시간) 모든 거래소의 펀딩 + OI를 수집 → OI 가중 평균 계산 → DB 저장. 프론트에서 히트맵으로 시각화.

#### 구현 가능 여부: **O (무료, 서버에서 주기적 수집 + OI 가중 평균 계산 필요)**

---

### 3.5 OI-Normalized CVD (OI 정규화 누적 거래량 델타)

#### 의미

CVD(Cumulative Volume Delta) = 시장가 매수량 - 시장가 매도량의 누적합. 이것을 해당 코인의 총 OI로 나누어 정규화한 값. OI가 큰 코인(BTC)과 작은 코인을 동일 선상에서 비교할 수 있다. 모든 지원 거래소의 데이터를 합산.

#### 활용

- CVD 상승 → 시장가 매수 우세 → 매수 압력
- CVD 하락 → 시장가 매도 우세 → 매도 압력
- 가격과 CVD의 다이버전스 → 추세 전환 신호
- OI 정규화로 코인 간 공정 비교

#### 계산 방법

```
CVD = Σ (Taker Buy Volume - Taker Sell Volume)
Normalized CVD = CVD / Aggregated OI (전 거래소 합산)
```

#### 데이터 소스

| 거래소 | Taker Buy/Sell 데이터 | 정확도 |
|---|---|:---:|
| Binance | `GET /futures/data/takerlongshortRatio` (buyVol, sellVol) | 정확 |
| Binance | Kline의 `takerBuyQuoteVol` 필드 | 정확 |
| Bybit | Kline에 taker 정보 포함 | 근사 |
| OKX | Kline 기반 계산 | 근사 |
| Gate.io | Kline 기반 계산 | 근사 |
| Hyperliquid | Kline 기반 계산 | 근사 |

Binance의 `takerlongshortRatio` API는 **개별 심볼만** 지원하며 최근 30일 데이터만 제공한다.

#### 구현 방법

서버에서 주기적으로:
1. 각 거래소 Kline에서 taker buy volume 추출 (Binance는 전용 API 활용)
2. taker sell volume = total volume - taker buy volume
3. delta = buy - sell 누적
4. 전 거래소 CVD 합산 / 전 거래소 OI 합산으로 정규화

#### 구현 가능 여부: **O (무료, 가장 복잡. Binance는 정확, 나머지 근사. 서버 누적 계산 필수)**

---

### 3.6 Liquidations Heatmap (청산 히트맵)

#### 의미

코인 × 시간 축으로 강제 청산량을 히트맵으로 표시. 모든 지원 거래소의 청산 합계. 롱/숏 분리 가능, 달러/코인 단위 선택 가능.

#### 활용

- 대규모 롱 청산 → 가격 급락 시 연쇄 청산 (Long Squeeze)
- 대규모 숏 청산 → 가격 급등 시 연쇄 청산 (Short Squeeze)
- 청산 집중 시점 파악 → 변동성 예측

#### 데이터 소스

| 거래소 | 청산 데이터 | 방식 | 비고 |
|---|:---:|---|---|
| Binance | **O** | WebSocket `!forceOrder@arr` | 실시간 전 코인, 1초 간격 |
| Bybit | **O** | WebSocket `allLiquidation` | 실시간, 500ms 주기 |
| OKX | **O** | `GET /api/v5/public/liquidation-orders` | REST 히스토리 |
| Gate.io | **O** | `GET /api/v4/futures/usdt/liq_orders` | REST 히스토리 |
| Bitget | **X** | 공개 API 없음 | 직접 제공 안함 |
| Hyperliquid | **X** | 공개 API 없음 | 직접 제공 안함 |

#### 구현 방법

`apps/api`에서 Binance/Bybit WebSocket에 상시 연결하여 실시간 청산 이벤트를 수집 → DB 적재. OKX/Gate는 REST API로 주기적 폴링. 프론트에서 시간/코인 축 히트맵으로 시각화.

#### 구현 가능 여부: **△ (Binance/Bybit/OKX/Gate 가능, Bitget/Hyperliquid 불가. WebSocket 상시 수집 필요)**

---

### 3.7 Market Volume (시장 거래량)

#### 의미

선택한 코인들의 **총 선물 거래량(달러)**을 거래소별로 그룹화하여 보여주는 바 차트. 어느 거래소에 거래량이 집중되는지 파악할 수 있다.

#### 데이터 소스

각 거래소 벌크 ticker API에서 `quoteVolume` (Binance), `turnover24h` (Bybit), `volCcy24h` (OKX) 등의 필드를 합산한다. 별도 API 불필요.

#### 구현 가능 여부: **O (무료, ticker 데이터 합산으로 즉시 가능)**

---

### 3.8 Total Open Interest (총 미결제약정)

#### 의미

선택한 코인들의 **총 달러 OI**를 거래소별로 그룹화. 시장에 얼마나 많은 포지션이 열려있는지, 어느 거래소에 집중되는지 파악.

#### 데이터 소스

ticker API에 포함된 OI 데이터를 거래소별로 합산. 시계열이 필요하면 서버에서 주기적 스냅샷 저장.

#### 구현 가능 여부: **O (무료, ticker 데이터 합산으로 즉시 가능)**

---

### 3.9 Sector Performance (섹터 성과)

#### 의미

6개 크립토 섹터의 상대 성과를 비교하는 차트. 각 기간 시작점을 0%로 리베이스하여 상대 비교한다.

#### 섹터 구성 (Velo 기준)

| 섹터 | 대표 코인 |
|---|---|
| **DeFi** | AAVE, 1INCH, JUP, MKR, UNI |
| **Gaming** | GALA, AXS, RONIN, SAND |
| **Layer 1** | BTC, ETH, AVAX, APT, SOL, BNB, SUI |
| **Layer 2** | ARB, OP, ZK, POL, STRK, MNT |
| **AI** | FET, NEAR, RENDER, TAO |
| **Memecoins** | PEPE, BONK, SHIB, DOGE, WIF, POPCAT |

#### 계산 방법

```
섹터 성과 = 해당 섹터 코인들의 평균 수익률
기간 시작점을 0%로 리베이스하여 상대 비교
```

#### 데이터 소스

- **직접 구현**: 섹터-코인 매핑을 하드코딩 + ticker 가격 변화율로 섹터 평균 계산. 이미 ticker에서 가져오는 데이터를 그룹핑하면 되므로 추가 API 호출 불필요.
- **대안**: CoinGecko `/coins/categories` API (무료 10,000 calls/월). 600+ 카테고리 제공.

#### 구현 가능 여부: **O (무료, 코인 분류 + 평균 계산으로 간단)**

---

## 4. 구현 가능성 종합

### 무료 구현 가능 여부

| # | 데이터 | 무료? | 난이도 | 서버 수집 | 비고 |
|---|---|:---:|:---:|:---:|---|
| 1 | **스크리너 테이블** (Gainers/Losers/Volume) | O | 낮음 | X | 벌크 ticker 1회 호출 |
| 2 | **Return Buckets** (수익률 분포) | O | 낮음 | X | ticker → 프론트 계산 |
| 3 | **Market Volume** (거래소별 거래량) | O | 낮음 | △ | 시계열은 서버 수집 |
| 4 | **Total Open Interest** (거래소별 OI) | O | 낮음 | △ | 시계열은 서버 수집 |
| 5 | **Sector Performance** (섹터 성과) | O | 낮음 | X | 코인 분류 + 평균 |
| 6 | **Price Changes** (가격 변화 차트) | O | 낮음 | △ | Kline, 코인 多면 캐싱 |
| 7 | **OI Changes** (OI 변화 차트) | O | 중간 | O | 스냅샷 주기 저장 |
| 8 | **Funding Heatmap** (펀딩 히트맵) | O | 중간 | O | 주기적 수집 + OI 가중 |
| 9 | **CVD (OI-Normalized)** | O | 높음 | O | taker 데이터 수집/누적 |
| 10 | **Liquidations Heatmap** (청산 히트맵) | △ | 높음 | O | WebSocket 상시 수집, Bitget/HL 불가 |

### 구현 우선순위 제안

**Phase 1 (낮은 난이도 - 프론트엔드 중심, 서버 수집 불필요):**
- 스크리너 테이블 (Top Gainers/Losers/Volume/Large Cap)
- Return Buckets
- Sector Performance
- Market Volume / Total OI (현재 스냅샷)

**Phase 2 (중간 난이도 - 서버 주기적 수집 필요):**
- Price Changes (멀티 코인 Kline 캐싱)
- OI Changes (스냅샷 주기 저장)
- Funding Heatmap (OI 가중 평균 계산)

**Phase 3 (높은 난이도 - 실시간 수집/상시 연결):**
- OI-Normalized CVD (taker 데이터 누적 계산)
- Liquidations Heatmap (WebSocket 상시 연결)

### API 호출 비용 추정 (Phase 1 기준)

Phase 1은 6개 거래소의 벌크 ticker API만 필요:
- 호출 빈도: 1분마다 갱신 가정
- 총 호출: 6회/분 × 60분 × 24시간 = **8,640 calls/day**
- 모든 거래소 무료, rate limit 내

---

## 5. 결론

**Velo Market 페이지의 거의 모든 데이터를 무료 거래소 공개 API로 구현할 수 있다.**

- 스크리너 테이블, Return Buckets, Sector Performance는 **벌크 ticker API만으로 즉시 구현 가능**
- 히트맵/시계열 데이터(Funding, OI, CVD)는 `apps/api`의 **cron + DB 적재**로 점진적 히스토리 축적
- 청산 히트맵만 일부 거래소(Bitget, Hyperliquid) 데이터 부재로 완전한 커버리지 불가

---

## Appendix A: 구현 결과 현행화 (2026-05-27)

> 본 리서치 이후 실제 구현을 완료하면서 변경/확인된 사항을 기록한다.

### Phase 1 구현 완료 현황

| # | 항목 | 구현 상태 | 페이지 | 비고 |
|---|------|:--------:|--------|------|
| 1 | **스크리너 테이블** | 구현 완료 | `/market-screener` | Top Gainers/Losers/Volume/New Listings + Large/Mid/Small Cap + 7개 섹터 필터 |
| 2 | **Return Buckets** | 구현 완료 | `/market-screener` | 24h 수익률 분포 히스토그램, ±Infinity 극단값 포함 |
| 3 | **Market Volume** | 구현 완료 | `/market-screener` | 6개 거래소별 24h 거래량 바 차트 |
| 4 | **Total Open Interest** | 구현 완료 | `/market-screener` | 5개 거래소 OI 바 차트 (Binance OI는 벌크 API 없어 미포함) |
| 5 | **Sector Performance** | 구현 완료 | `/market-screener` | 7개 섹터 (DeFi, L1, L2, Metaverse, Meme, Dino, AI) 평균 수익률 |
| 6 | **New Listings** | 구현 완료 | `/market-screener` | Binance/Bybit exchangeInfo에서 30일 이내 신규 상장 감지, NEW 배지 |
| 7 | **Kline Changes** | 구현 완료 | `/market-screener` | 상위 50개 코인 1w/1m 가격 변화율 (Binance Kline 기반) |

### Phase 2/3 미구현 항목

| # | 항목 | 상태 | 비고 |
|---|------|:----:|------|
| 6 | **Price Changes** (멀티 코인 시계열) | 미구현 | 250코인 × 6거래소 = 1500 API 호출, 서버 캐싱 필요 |
| 7 | **OI Changes** (OI 변화 시계열) | 미구현 | 서버에서 주기적 OI 스냅샷 저장 필요 |
| 8 | **Funding Heatmap** | 미구현 | 주기적 수집 + OI 가중 평균 계산 필요 |
| 9 | **CVD (OI-Normalized)** | 미구현 | taker 데이터 누적 계산 필수 |
| 10 | **Liquidations Heatmap** | 부분 구현 | WebSocket 수집은 `apps/api`에 구현 완료, 히트맵 시각화는 미구현 |

### 구현 중 발견된 주요 이슈

#### 1000x 접두사 코인 (P0 이슈)
Binance/Bybit에서 `1000PEPEUSDT`, `1000SHIBUSDT` 등을 사용하여 `1000PEPE`와 `PEPE`가 별도 코인으로 집계되는 문제 발생.
**해결**: `symbol-normalizer.ts`에서 1000x 접두사 제거 + 가격 보정(×1000) 적용.

#### OKX/Bitget 에러 응답 패턴 (P0 이슈)
OKX(`code !== "0"`)와 Bitget(`code !== "00000"`)은 에러 시에도 HTTP 200을 반환.
**해결**: `response.json()` 후 `code` 필드 별도 체크 추가.

#### Binance OI 벌크 API 부재
Binance 벌크 ticker(`/fapi/v1/ticker/24hr`)에 OI 미포함. 개별 심볼당 `/fapi/v1/openInterest` 호출 필요(250+ 호출).
**현재**: Binance OI = 0으로 표시, 나머지 5개 거래소 OI로 비교. Phase 2에서 상위 50개 코인 개별 보충 예정.

#### OKX 벌크 ticker에 OI/펀딩 미포함
OKX 벌크 ticker에 OI와 펀딩이 없어 별도 벌크 API 2개 추가 호출로 보충:
- `/api/v5/public/open-interest?instType=SWAP` (OI)
- `/api/v5/public/funding-rate` (펀딩)

#### 섹터 매핑 커버리지
초기 ~70개 → 120+개로 확대. 250+ 코인 중 미분류 코인(~130개)은 섹터 필터에서 제외되고 'All' 탭에서만 표시.

### 아키텍처 결정 사항

| 결정 | 내용 |
|------|------|
| 데이터 수집 | 단일 Route Handler `/api/market-screener/tickers`에서 6개 거래소 벌크 ticker 병렬 호출 |
| 심볼 정규화 | `symbol-normalizer.ts`에서 거래소별 포맷 통일 (1000x 접두사 처리 포함) |
| 집계 방식 | 가격=거래량 가중평균, 거래량/OI=합산, 펀딩=OI 가중평균 |
| 분류 방식 | 시가총액/섹터 정적 매핑 (`packages/shared` TypeScript 상수) |
| 캐싱 | 서버 InMemoryCache 30초 TTL, 클라이언트 TanStack Query 30초 staleTime / 60초 refetchInterval |
| 에러 처리 | Promise.allSettled + 부분 장애 허용 (일부 거래소 실패 시 나머지로 서비스) |
- Velo의 유료($199/월) 가치는 **수년간 축적된 히스토리**에 있으며, 실시간 + 최근 히스토리는 자체 구현으로 충분

---

## 6. 참고 자료

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
- [Hyperliquid API - Info Endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)
- [Hyperliquid API - metaAndAssetCtxs](https://docs.chainstack.com/reference/hyperliquid-info-meta-and-asset-ctxs)
- [CoinGecko API](https://www.coingecko.com/en/api)
- [Crypto Sectors Performance - TradingView Indicator](https://www.tradingview.com/script/aaTSlBeJ-Crypto-Sectors-Performance-Daveatt/)
