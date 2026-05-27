# 선물 마켓 지표 조사 및 구현 가능성 분석

> 조사일: 2026-05-27
> 참고: [velo.xyz/futures](https://velo.xyz/futures/) 에서 제공하는 선물 지표를 기반으로 조사

## 1. 개요

velo.xyz는 크립토 선물 시장 데이터를 집계/시각화하는 서비스로, Binance, Bybit, OKX, Deribit, Hyperliquid 5개 거래소의 데이터를 통합 제공한다.

### Velo API 비용

| 구분 | 접근 가능 범위 | 비용 |
|------|-------------|------|
| 무료 (인증 없음) | `/futures` 상품 목록만 조회 가능 | 무료 |
| 유료 API | `/rows` 실제 데이터 조회 (1분~ 해상도) | **$199/월** |

- API Base: `https://api.velo.xyz/api/v1`
- 인증: Basic Auth (`api:api_key`)
- 응답 형식: CSV
- 제한: 요청당 최대 22,500 values

**결론: Velo API의 실제 데이터는 유료이므로, 각 거래소 공개 API로 직접 구현하는 것이 합리적이다.**

---

## 2. 지표별 상세 분석

### 2.1 24h Volume (24시간 거래량)

#### 의미
최근 24시간 동안 해당 코인의 총 선물 거래량 (달러 기준). 거래소별로 분리하여 보여주면 어느 거래소에 유동성이 집중되어 있는지 파악할 수 있다.

#### 활용
- 거래량 급등 → 큰 가격 변동의 선행 지표
- 거래소별 거래량 비교 → 유동성 집중도 파악
- 특정 코인의 거래량 순위 변화 → 관심도/모멘텀 파악

#### 데이터 소스 (거래소 공개 API)
| 거래소 | 엔드포인트 | 인증 | 비고 |
|--------|-----------|:----:|------|
| Binance | `GET /fapi/v1/ticker/24hr` | 불필요 | `quoteVolume` 필드 |
| Bybit | `GET /v5/market/tickers?category=linear` | 불필요 | `turnover24h` 필드 |
| OKX | `GET /api/v5/market/ticker?instId=BTC-USDT-SWAP` | 불필요 | `volCcy24h` 필드 |
| Gate.io | `GET /api/v4/futures/usdt/contracts/{contract}` | 불필요 | `trade_size` 필드 |
| Bitget | `GET /api/v2/mix/market/ticker?productType=USDT-FUTURES` | 불필요 | `usdtVolume` 필드 |
| Hyperliquid | `POST /info` type: `metaAndAssetCtxs` | 불필요 | `dayNtlVlm` 필드 |

#### 구현 가능 여부: **O (모든 거래소 무료)**

---

### 2.2 Price (가격)

#### 의미
해당 코인의 현재 선물 가격 (마크 프라이스 또는 최종 체결가). 거래소별로 비교하면 가격 괴리(스프레드)를 파악할 수 있다.

#### 활용
- 거래소 간 가격 차이 → 차익거래 기회 포착
- 마크 프라이스 vs 인덱스 프라이스 괴리 → 시장 과열/공포 판단

#### 데이터 소스
각 거래소의 ticker API에서 `lastPrice` 또는 `markPrice` 사용. 24h Volume과 동일한 엔드포인트에서 함께 제공.

#### 구현 가능 여부: **O (모든 거래소 무료)**

---

### 2.3 Open Interest (미결제 약정)

#### 의미
현재 시장에 열려 있는 선물 계약의 총 규모 (달러 기준). 청산되지 않고 유지 중인 포지션의 합계.

#### 활용
- **OI 증가 + 가격 상승** → 신규 롱 진입, 강한 상승 추세
- **OI 증가 + 가격 하락** → 신규 숏 진입, 강한 하락 추세
- **OI 감소 + 가격 변동** → 포지션 청산 중, 추세 약화
- 거래소별 OI 비교 → 어디서 포지션이 쌓이고 있는지 파악

#### 데이터 소스 (거래소 공개 API)
| 거래소 | 엔드포인트 | 인증 | 비고 |
|--------|-----------|:----:|------|
| Binance | `GET /fapi/v1/openInterest` | 불필요 | 현재 OI 스냅샷 |
| Binance | `GET /futures/data/openInterestHist` | 불필요 | OI 히스토리 (5m/1h/1d) |
| Bybit | `GET /v5/market/open-interest?category=linear` | 불필요 | `openInterest` 필드 |
| OKX | `GET /api/v5/public/open-interest?instType=SWAP` | 불필요 | `oi`, `oiCcy` 필드 |
| Gate.io | `GET /api/v4/futures/usdt/contracts/{contract}` | 불필요 | `position_size` 필드 |
| Bitget | `GET /api/v2/mix/market/open-interest?productType=USDT-FUTURES` | 불필요 | `amount` 필드 |
| Hyperliquid | `POST /info` type: `metaAndAssetCtxs` | 불필요 | `openInterest` 필드 |

#### 구현 가능 여부: **O (모든 거래소 무료)**

---

### 2.4 Funding Rate (펀딩 비율)

#### 의미
무기한 선물(perpetual) 가격을 현물 가격에 수렴시키기 위한 주기적 수수료. 일반적으로 8시간마다 적용.

- **Funding Rate > 0** → 롱이 숏에게 수수료 지불 (롱 과다 = 시장 과열)
- **Funding Rate < 0** → 숏이 롱에게 수수료 지불 (숏 과다 = 시장 공포)
- **APR 환산** → `Funding Rate × 3 × 365` (8시간 기준 연환산)

#### 활용
- 극단적 양의 펀딩 → 과열, 숏 진입 고려
- 극단적 음의 펀딩 → 과매도, 롱 진입 고려
- 거래소별 펀딩 비교 → 차익거래(Funding Arbitrage) 기회

#### 데이터 소스 (거래소 공개 API)
| 거래소 | 엔드포인트 | 인증 | 비고 |
|--------|-----------|:----:|------|
| Binance | `GET /fapi/v1/fundingRate` | 불필요 | 히스토리 제공 |
| Binance | `GET /fapi/v1/premiumIndex` | 불필요 | 현재 + 예측 펀딩 |
| Bybit | `GET /v5/market/funding/history?category=linear` | 불필요 | 히스토리 제공 |
| OKX | `GET /api/v5/public/funding-rate?instId=BTC-USDT-SWAP` | 불필요 | 현재 + 다음 펀딩 |
| OKX | `GET /api/v5/public/funding-rate-history` | 불필요 | 히스토리 제공 |
| Gate.io | `GET /api/v4/futures/usdt/contracts/{contract}` | 불필요 | `funding_rate` 필드 |
| Bitget | `GET /api/v2/mix/market/current-fund-rate?productType=USDT-FUTURES` | 불필요 | 현재 펀딩 |
| Hyperliquid | `POST /info` type: `metaAndAssetCtxs` | 불필요 | `funding` 필드 |

#### 구현 가능 여부: **O (모든 거래소 무료)**

---

### 2.5 Liquidations (청산)

#### 의미
강제 청산(Force Liquidation)된 포지션의 규모. 롱 청산 / 숏 청산을 구분하여 보여준다.

#### 활용
- **대규모 롱 청산** → 가격 급락 시 연쇄 청산 (Long Squeeze)
- **대규모 숏 청산** → 가격 급등 시 연쇄 청산 (Short Squeeze)
- 청산 집중 가격대 → 지지/저항선 파악
- 거래소별 청산 비교 → 레버리지 쏠림도 파악

#### 데이터 소스
| 거래소 | 엔드포인트 | 인증 | 비고 |
|--------|-----------|:----:|------|
| Binance | `GET /futures/data/globalLongShortAccountRatio` 등 | 불필요 | 집계 데이터 |
| Binance | WebSocket `forceOrder` 스트림 | 불필요 | 실시간 개별 청산 |
| Bybit | WebSocket `liquidation` 토픽 | 불필요 | 실시간 개별 청산 |
| OKX | `GET /api/v5/public/liquidation-orders` | 불필요 | 히스토리 제공 |
| Gate.io | `GET /api/v4/futures/usdt/liq_orders` | 불필요 | 청산 주문 히스토리 |
| Bitget | 공개 API 없음 | - | 직접 제공하지 않음 |
| Hyperliquid | 공개 API 없음 | - | 직접 제공하지 않음 |

#### 구현 가능 여부: **△ (Binance/Bybit/OKX/Gate는 가능, Bitget/Hyperliquid 불가)**

---

### 2.6 CVD - Cumulative Volume Delta (누적 거래량 델타)

#### 의미
**Taker Buy Volume - Taker Sell Volume의 누적 합계** (달러 기준).

시장가 매수(Taker Buy)와 시장가 매도(Taker Sell)의 차이를 시간순으로 누적한 값. 시장의 공격적인 매수/매도 압력을 측정하는 지표.

#### 활용
- **CVD 상승** → 시장가 매수가 우세 → 매수 압력 강함
- **CVD 하락** → 시장가 매도가 우세 → 매도 압력 강함
- **가격 상승 + CVD 하락** → 약세 다이버전스 (상승 모멘텀 약화)
- **가격 하락 + CVD 상승** → 강세 다이버전스 (하락 모멘텀 약화)
- OI 대비 정규화(CVD/OI)하면 포지션 규모 대비 실제 매수/매도 강도를 비교 가능

#### 계산 방법
```
CVD = Σ (Taker Buy Volume - Taker Sell Volume)

각 캔들/구간에서:
- Taker Buy Volume = 매수 체결량 (시장가 매수가 오더북을 소비)
- Taker Sell Volume = 매도 체결량 (시장가 매도가 오더북을 소비)
```

#### 데이터 소스
| 거래소 | 엔드포인트 | 인증 | 비고 |
|--------|-----------|:----:|------|
| Binance | `GET /futures/data/takerlongshortRatio` | 불필요 | Buy/Sell 비율 + 볼륨 |
| Binance | `GET /fapi/v1/klines` | 불필요 | `takerBuyQuoteVol` 필드로 계산 가능 |
| Bybit | `GET /v5/market/kline?category=linear` | 불필요 | Kline에 taker 정보 포함 |
| OKX | `GET /api/v5/market/candles` | 불필요 | 캔들 데이터로 근사 계산 |
| Gate.io | `GET /api/v4/futures/usdt/candlesticks` | 불필요 | 캔들 데이터 |
| Hyperliquid | `POST /info` type: `candleSnapshot` | 불필요 | 캔들 데이터 |

#### 구현 가능 여부: **O (Binance는 정확한 taker 데이터 제공, 나머지는 Kline 기반 근사)**

---

### 2.7 3 Month Annualized Basis (3개월 연환산 베이시스)

#### 의미
**3개월 만기 선물과 현물 가격 차이를 연환산한 수치**. 선물 시장의 전반적인 낙관/비관 정도를 측정하는 핵심 지표.

#### 계산 방법
```
Basis = ((선물 가격 - 현물 가격) / 현물 가격) × (365 / 만기까지 남은 일수) × 100%
```

#### 활용
- **Basis > 0 (Contango)** → 선물 > 현물, 시장이 상승을 기대
- **Basis < 0 (Backwardation)** → 선물 < 현물, 시장이 하락을 기대
- **정상 범위**: 5~15% APR
- **과열 신호**: 20%+ APR
- **극도의 공포**: 마이너스
- BTC/ETH 등 분기 만기 선물이 있는 코인만 계산 가능

#### 데이터 소스
| 거래소 | 엔드포인트 | 인증 | 비고 |
|--------|-----------|:----:|------|
| Binance | Quarterly 선물 + Spot 가격 조합 | 불필요 | `BTCUSDT_250627` 등 분기 상품 |
| OKX | `GET /api/v5/market/ticker?instId=BTC-USD-250627` | 불필요 | 만기 선물 가격 |
| Deribit | 전용 API | 불필요 | 가장 유동성 높은 만기 선물 |
| Bybit | 분기 선물 미지원 (무기한만) | - | 계산 불가 |

#### 구현 가능 여부: **△ (Binance/OKX 분기 선물로 계산 가능, BTC/ETH만 해당)**

---

### 2.8 1m Average Return By Hour (UTC) (시간대별 평균 수익률)

#### 의미
**각 UTC 시간대(0~23시)별 1분봉 평균 수익률**. 하루 중 어느 시간대에 가격이 오르고 내리는 경향이 있는지를 통계적으로 보여준다.

#### 계산 방법
```
1. 일정 기간(예: 30일)의 1분봉 데이터 수집
2. 각 캔들을 UTC 시간(0~23)으로 분류
3. 각 시간대별 1분 수익률 = (close - open) / open
4. 시간대별 평균 계산
```

#### 활용
- **미국장 오픈(UTC 13~14시, 한국 22~23시)** 에 변동성 집중 여부 확인
- **아시아장 오픈(UTC 0~1시, 한국 09~10시)** 패턴 확인
- 특정 시간대에 일관된 상승/하락 패턴 → 시간 기반 전략 수립
- 예: "UTC 15시에 평균적으로 +0.02% → 이 시간대 매수 경향"

#### 데이터 소스
| 거래소 | 엔드포인트 | 인증 | 비고 |
|--------|-----------|:----:|------|
| Binance | `GET /fapi/v1/klines?interval=1m` | 불필요 | 최대 1500개 캔들 |
| Bybit | `GET /v5/market/kline?interval=1&category=linear` | 불필요 | 1분봉 |
| OKX | `GET /api/v5/market/candles?bar=1m` | 불필요 | 1분봉 |
| 기타 | 각 거래소 Kline API | 불필요 | 동일 패턴 |

#### 구현 가능 여부: **O (모든 거래소 1분봉 Kline API 무료 제공, 서버에서 집계)**

주의: 30일간 1분봉 = 43,200개 캔들. API 호출 횟수를 고려하여 백엔드에서 주기적으로 집계/캐싱 필요.

---

### 2.9 Cumulative Return By Session (세션별 누적 수익률)

#### 의미
**지역별 거래 세션 동안의 가격 변화를 누적한 수치**. 어느 지역(아시아/유럽/미국)의 트레이더가 상승/하락을 주도하는지 파악.

#### 세션 구분
| 세션 | UTC 시간 | 해당 지역 |
|------|---------|----------|
| **APAC** | 00:00 ~ 08:00 | 아시아/태평양 (한국, 일본, 중국, 호주) |
| **EU** | 08:00 ~ 16:00 | 유럽 (런던, 프랑크푸르트, 취리히) |
| **US** | 16:00 ~ 24:00 | 미국 (뉴욕, 시카고) |

#### 계산 방법
```
1. 각 세션 시작 시점의 가격을 기준(0%)으로 설정
2. 세션 동안의 가격 변화를 누적
3. Cumulative Return = (현재가 - 세션시작가) / 세션시작가 × 100%
4. 일정 기간(예: 7일, 30일) 동안 세션별 누적 수익률을 합산
```

#### 활용
- **"최근 BTC 상승은 미국장에서 주도"** → US 세션 누적 +3%, APAC -1%
- **지역별 매수/매도 경향 파악** → 기관 자금 흐름 추정
- **세션 전환 시점의 변동성 예측**

#### 데이터 소스
1분봉 또는 1시간봉 Kline 데이터를 세션별로 분류하여 계산. 별도 API 불필요.

| 거래소 | 엔드포인트 | 인증 |
|--------|-----------|:----:|
| Binance | `GET /fapi/v1/klines?interval=1h` | 불필요 |
| 기타 | 각 거래소 Kline API | 불필요 |

#### 구현 가능 여부: **O (Kline API로 계산 가능, 서버에서 집계)**

---

## 3. 구현 가능성 종합

### 거래소 공개 API로 직접 구현 가능한 지표

| # | 지표 | Binance | Bybit | OKX | Gate | Bitget | Hyperliquid | 난이도 |
|---|------|:------:|:-----:|:---:|:----:|:-----:|:-----------:|:-----:|
| 1 | **24h Volume** | O | O | O | O | O | O | 낮음 |
| 2 | **Price** | O | O | O | O | O | O | 낮음 |
| 3 | **Open Interest** | O | O | O | O | O | O | 낮음 |
| 4 | **Funding Rate** | O | O | O | O | O | O | 낮음 |
| 5 | **Liquidations** | O | O | O | O | X | X | 중간 |
| 6 | **CVD** | O (정확) | △ | △ | △ | △ | △ | 중간 |
| 7 | **3M Basis** | O | X | O | X | X | X | 중간 |
| 8 | **Avg Return/Hour** | O | O | O | O | O | O | 중간 |
| 9 | **Return/Session** | O | O | O | O | O | O | 중간 |

### 구현 우선순위 제안

**Phase 1 (낮은 난이도 - 즉시 가능):**
- 24h Volume, Price, OI, Funding Rate → 거래소별 비교 차트
- 현재 Binance 단일 거래소 기반인 지표를 멀티 거래소로 확장

**Phase 2 (중간 난이도 - 백엔드 집계 필요):**
- CVD (Binance taker 데이터 기반)
- Liquidations (Binance/Bybit/OKX WebSocket)
- Average Return By Hour / By Session (Kline 히스토리 집계)

**Phase 3 (추가 연구 필요):**
- 3 Month Annualized Basis (Binance/OKX 분기 선물 조합)

---

## 4. 참고 자료

- [Velo API Docs](https://docs.velo.xyz/api/http)
- [Velo Futures Page Docs](https://docs.velo.xyz/web-app/futures)
- [Velo Node.js SDK](https://github.com/velodataorg/velo-node)
- [Binance Futures API](https://binance-docs.github.io/apidocs/futures/en/)
- [Bybit V5 API](https://bybit-exchange.github.io/docs/v5/intro)
- [OKX V5 API](https://www.okx.com/docs-v5/en/)

---

## Appendix A: Velo의 비즈니스 모델 분석

### 데이터 파이프라인 구조

```
거래소 공개 API (무료)  →  Velo 서버 (수집/집계/저장)  →  Velo API/웹앱 ($199/월)
```

Velo는 거래소 데이터를 직접 생산하는 것이 아니라, 각 거래소의 **무료 공개 API**에서 데이터를 수집하여 가공/보관 후 유료로 제공하는 데이터 집계 서비스이다.

### Velo가 제공하는 부가 가치

1. **히스토리 축적**: 2021년부터 6개 거래소의 1분 해상도 데이터를 지속 수집/보관 (수년간의 장기 히스토리가 핵심 자산)
2. **정규화**: 거래소마다 다른 응답 형식을 통일된 CSV 포맷으로 변환
3. **파생 지표 계산**: CVD, Basis, 세션별 수익률 등 원본 데이터에서 직접 제공하지 않는 지표를 산출
4. **편의성**: 깔끔한 API + 시각화 웹앱으로 즉시 사용 가능

### 유료($199/월)의 핵심 가치: 히스토리

| 구독 | 히스토리 범위 |
|------|-------------|
| 월간 구독 | 최근 **3개월** |
| 연간 구독 | **전체** (2021년~) |

- 실시간 데이터 자체는 거래소에서 무료로 가져올 수 있음
- 수년간 축적된 1분봉 히스토리를 직접 쌓으려면 서버 인프라 + 시간 필요
- Velo의 과금 포인트는 "이미 쌓아놓은 과거 데이터에 대한 접근권"

### BitScope에서의 대안 전략

| 영역 | Velo 의존 | BitScope 자체 구현 |
|------|----------|------------------|
| **실시간 데이터** | 불필요 | 동일한 거래소 무료 API 사용 |
| **최근 히스토리 (수일~수주)** | 불필요 | 대부분 거래소가 Kline 히스토리 API 제공 |
| **장기 히스토리 (수개월~수년)** | 직접 쌓기 어려우면 필요 | `apps/api` cron으로 주기적 수집 → DB 적재하여 점진적 축적 |
| **파생 지표 (CVD, Basis 등)** | 불필요 | 계산 로직만 구현하면 됨 |
| **멀티 거래소 정규화** | 불필요 | 이미 BitScope에 구현되어 있음 |

### 결론

- **실시간 + 최근 히스토리 기반 차트**는 Velo 없이 충분히 직접 구현 가능
- 수년간의 장기 히스토리가 필요하지 않다면 Velo에 비용을 낼 이유 없음
- `apps/api`에서 cron으로 데이터를 주기적으로 수집하면 히스토리도 점진적으로 쌓을 수 있음
- Velo와 동일한 데이터를 거래소 무료 API로 직접 수집하는 것은 기술적으로 완전히 가능하며, BitScope의 기존 인프라(NestJS cron + MySQL)로 바로 적용 가능
