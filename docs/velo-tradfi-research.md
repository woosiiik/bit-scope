# Velo.xyz/tradfi 데이터 조사 및 무료 구현 가능성 분석

> 조사일: 2026-05-27
> 참고: [velo.xyz/tradfi](https://velo.xyz/tradfi) 에서 제공하는 TradFi 데이터를 기반으로 조사
> 관련: [Velo Market 페이지 조사](./velo-market-page-research.md)

## 1. 개요

velo.xyz/tradfi는 **CME(시카고상품거래소) 크립토 파생상품**과 **미국 Spot ETF** 데이터를 시각화하는 페이지이다. 크립토 시장에 유입되는 기관 자금 흐름을 추적하는 데 특화되어 있다.

데이터 갱신: 매일 오후 10:30 ET (CME 장 마감 후)

---

## 2. 지원 코인

CME에 선물/옵션이 상장되고, Spot ETF가 승인된 코인만 지원한다. 2026년 5월 기준 4개:

| 코인 | CME 선물 | CME 옵션 | Spot ETF | 비고 |
|---|:---:|:---:|:---:|---|
| **BTC** | O | O | O (11개+) | 2017년 CME 선물 상장 |
| **ETH** | O | O | O (9개+) | 2021년 CME 선물 상장 |
| **SOL** | O | O | O | 2025년 10월 CME 선물 + ETF 동시 |
| **XRP** | O | O | O | 2025~2026년 순차 승인 |

---

## 3. 차트/섹션 상세 분석

### 3.1 CME Open Interest (CME 미결제약정)

#### 의미

CME 비트코인/이더리움 **선물 + 옵션**의 합산 미결제약정. 코인 단위 또는 달러 단위로 표시. CME OI는 기관 투자자의 포지션 규모를 나타내는 핵심 지표이다.

- CME 계약 단위: 1 CME BTC 선물 = 5 BTC, Micro BTC = 0.1 BTC

#### 활용

- CME OI 증가 → 기관 자금 유입, 시장 성숙도 증가
- CME OI가 전체 BTC 선물 OI에서 차지하는 비중 → 기관 vs 개인 비율 추정
- ETF 승인/만기일 전후 OI 변화 → 이벤트 영향 분석

#### 데이터 소스

| 소스 | 접근 방식 | 무료? | 비고 |
|---|---|:---:|---|
| CME Group 웹사이트 | 일별 보고서 (Volume & OI Reports) | O (웹) | 프로그래밍 접근 불가 |
| CME Real-Time API | REST/WebSocket | X | $0.50/GB + ILA 수수료 |
| CoinGlass 웹 | 웹 대시보드 | O (웹) | API는 $29/월~ |
| CoinGlass API | `/api/open-interest/exchange-history` | X | $29/월~ |

#### 무료 구현 가능 여부: **X (CME 공식 API 유료, 제3자 API도 유료)**

---

### 3.2 CME Volume (CME 거래량)

#### 의미

CME 선물/옵션의 합산 거래량. 기관 투자자의 일별 거래 활동 수준을 보여준다.

#### 활용

- 거래량 급증 → 기관의 적극적 포지셔닝
- 만기일(매월 마지막 금요일) 전후 거래량 패턴 분석
- OI 대비 거래량 비율 → 포지션 회전율

#### 데이터 소스

CME OI와 동일한 소스에서 함께 제공.

| 소스 | 무료? |
|---|:---:|
| CME Daily Exchange Volume Report (웹) | O (웹) |
| CME API | X |
| CoinGlass API | X ($29/월~) |

#### 무료 구현 가능 여부: **X (OI와 동일한 제약)**

---

### 3.3 CME Basis (CME 연환산 베이시스)

#### 의미

**차월물 CME 선물의 연환산 프리미엄**. CME 선물 정산가와 Coinbase 현물가의 차이를 연환산한 값. 기관 투자자의 낙관/비관 정도를 나타내는 핵심 지표.

#### 계산 방법

```
Basis(%) = ((CME 선물 정산가 - Coinbase 현물가) / Coinbase 현물가) × (365 / 만기까지 남은 일수) × 100
```

#### 활용

- **정상 범위**: 5~15% APR
- **과열 신호**: 20%+ APR → 기관의 강한 낙관
- **극도의 공포**: 마이너스 → Backwardation
- Cash-and-Carry 차익거래의 수익률 지표

#### 데이터 소스

| 소스 | 접근 방식 | 무료? | 비고 |
|---|---|:---:|---|
| CryptoQuant | 웹 차트 (cme-futures-annualized-basis) | O (웹) | API는 유료 |
| CoinGlass | 웹 대시보드 (Basis 페이지) | O (웹) | API는 $29/월~ |
| Coinalyze | 웹 (Bitcoin futures basis) | O (웹) | - |
| **직접 계산** | CME 선물가 + Coinbase 현물가 | △ | CME 선물가 취득이 문제 |

**직접 계산 시 필요한 데이터:**
- CME 선물 정산가: CME 웹에서 일별 공개되나 프로그래밍 접근 어려움
- Coinbase 현물가: Coinbase API로 무료 취득 가능

#### 무료 구현 가능 여부: **△ (계산 로직은 단순하나, CME 선물가 프로그래밍 취득이 제약)**

---

### 3.4 GBTC/ETHE Premium (그레이스케일 프리미엄/디스카운트)

#### 의미

그레이스케일 신탁(GBTC, ETHE)의 **시장가 vs NAV(순자산가치)** 괴리율. ETF 전환 이후에도 소폭의 프리미엄/디스카운트가 발생한다.

#### 계산 방법

```
Premium(%) = ((시장가 - NAV) / NAV) × 100
Implied Price = 신탁 프리미엄 × Coinbase 현물가
```

#### 활용

- 프리미엄 → 시장에서 NAV보다 비싸게 거래 (기관 수요 과열)
- 디스카운트 → NAV보다 싸게 거래 (매도 압력, 상환 가능성)
- ETF 전환 후 프리미엄이 0에 수렴하는 추이 추적

#### 데이터 소스

| 소스 | 접근 방식 | 무료? | 비고 |
|---|---|:---:|---|
| YCharts | 웹 차트 (2015년~ 히스토리) | O (웹) | API는 유료 |
| CoinGlass | 웹 (Grayscale Premium 페이지) | O (웹) | API `/api/grayscale/premium-history` $29/월~ |
| CryptoQuant | 웹 차트 | O (웹) | API는 유료 |
| The Block | 주간 평균 차트 | O (웹) | - |

#### 무료 구현 가능 여부: **X (웹에서 무료 열람은 가능하나, 프로그래밍 API 접근은 모두 유료)**

---

### 3.5 ETF Flows 테이블 (Spot ETF 자금 유출입)

#### 의미

**미국 Spot BTC/ETH ETF의 일별 자금 순유입/유출 데이터** (백만 달러 단위). 기관 자금의 크립토 시장 유출입을 추적하는 가장 직접적인 지표.

#### BTC Spot ETF 목록

| 티커 | 운용사 | AUM (2026.05 기준) | 비용 비율 |
|---|---|---|---|
| **IBIT** | BlackRock (iShares Bitcoin Trust) | ~$70.6B | 0.25% |
| **GBTC** | Grayscale Bitcoin Trust | ~$14.9B | 1.50% |
| **FBTC** | Fidelity Wise Origin Bitcoin Fund | - | 0.25% |
| **ARKB** | ARK 21Shares Bitcoin ETF | - | - |
| **BITB** | Bitwise Bitcoin ETF | - | - |
| **HODL** | VanEck Bitcoin ETF | - | 0.20% |
| **BRRR** | CoinShares Bitcoin ETF | ~$544M | - |
| **EZBC** | Franklin Bitcoin ETF | - | - |
| **BTCO** | Invesco Galaxy Bitcoin ETF | - | - |
| **BTC** | Grayscale Bitcoin Mini ETF | - | 0.15% |

#### ETH Spot ETF 목록

| 티커 | 운용사 |
|---|---|
| **ETHA** | BlackRock (iShares Ethereum Trust) |
| **ETHE** | Grayscale Ethereum Trust |
| **FETH** | Fidelity Ethereum Fund |
| **ETHV** | VanEck Ethereum ETF |
| **ETHW** | Bitwise Ethereum ETF |
| **QETH** | Invesco Galaxy Ethereum ETF |

#### SOL / XRP Spot ETF

2025~2026년에 순차 승인. CoinGlass API에도 SOL/XRP ETF Flows 엔드포인트가 존재.

#### 테이블 구조

```
| Date       | Total  | IBIT  | GBTC   | FBTC  | ARKB | BITB | ... |
|------------|--------|-------|--------|-------|------|------|-----|
| 2026-05-27 | +245.3 | +180.2| -45.1  | +62.5 | +20.3| +15.8| ... |
| 2026-05-26 | -120.7 | +50.0 | -100.3 | -30.2 | -15.5| -10.0| ... |
```

- 양수(+) = 해당 ETF에 자금 유입 (신규 매수)
- 음수(-) = 자금 유출 (환매/매도)
- Total = 전체 ETF 합산
- **BTC 가격과 ETF 순유입의 상관관계가 매우 높음** → 가격 예측 핵심 지표

#### 활용

- 연속 순유입 → 기관 매집, 강세 신호
- 연속 순유출 → 기관 매도, 약세 신호
- 특정 ETF(GBTC)의 대규모 유출 → 차익실현 또는 수수료 이동
- IBIT 유입 규모 → BlackRock 기관 고객의 크립토 수요 척도

#### 데이터 소스

| 소스 | 접근 방식 | 무료? | 데이터 범위 | 비고 |
|---|---|:---:|---|---|
| **Farside Investors** | 웹 (farside.co.uk/btc/) | O (웹) | 2024.01~ | 업계 표준 소스, API 없음 |
| **CoinGlass** | 웹 (coinglass.com/etf/bitcoin) | O (웹) | 2024.01~ | API는 $29/월~ |
| **CoinGlass API** | `/api/bitcoin/etf/flow-history` | X | 2024.01~ | $29/월 (Hobbyist) |
| **Bitbo** | 웹 (bitbo.io/treasuries/etf-flows/) | O (웹) | - | API 없음 |
| **WalletPilot** | 웹 (walletpilot.com) | O (웹) | - | 매 거래일 장 마감 후 갱신 |
| **The Block** | 웹 차트 | O (웹) | - | 일별/온체인 플로우 |

#### 무료 구현 가능 여부: **X (무료 API가 존재하지 않음. 웹 열람만 무료)**

---

## 4. 무료 구현 가능성 종합

### 전체 요약

| # | 데이터 | 무료 웹 열람 | 무료 API | 유료 API 최저가 | 직접 계산 |
|---|---|:---:|:---:|---|:---:|
| 1 | **CME OI** | O | X | CoinGlass $29/월 | X |
| 2 | **CME Volume** | O | X | CoinGlass $29/월 | X |
| 3 | **CME Basis** | O | X | CoinGlass $29/월 | △ (CME 선물가 취득 제약) |
| 4 | **GBTC/ETHE Premium** | O | X | CoinGlass $29/월 | X |
| 5 | **ETF Flows** | O | X | CoinGlass $29/월 | X |

### 핵심 제약: 데이터 원천이 전통 금융

거래소 선물 데이터(Binance, Bybit 등)와 달리, TradFi 데이터의 원천은 **CME, SEC, ETF 운용사**이다:

- **CME 데이터**: CME Group이 유료로 판매하는 시장 데이터. 무료 공개 API 없음.
- **ETF Flows**: ETF 운용사가 SEC에 제출하는 보고서 + 거래소 데이터에서 역산. 개인이 직접 수집하기 어려움.
- **Grayscale Premium**: NAV는 그레이스케일이 일별 공개, 시장가는 주식 시장 데이터 필요.

이 모든 데이터는 **Farside, CoinGlass, CryptoQuant** 같은 중간 데이터 제공자가 수집/가공하여 제공하며, 프로그래밍 접근(API)은 전부 유료이다.

### 대안 검토

| 대안 | 장점 | 단점 |
|---|---|---|
| **CoinGlass Hobbyist ($29/월)** | ETF Flows + CME 데이터 + OI/Funding 등 통합 | 월 비용 발생 |
| **웹 스크래핑** | 무료 | 불안정, 차단 위험, ToS 위반 가능 |
| **수동 입력** | 무료, 정확 | 비현실적 (매일 수작업) |
| **구현 보류** | 비용 없음 | 기능 제공 불가 |

---

## 5. 결론

**Velo TradFi 페이지의 데이터는 무료 프로그래밍 구현이 사실상 불가능하다.**

- 거래소 선물 데이터(Market 페이지)와 달리, TradFi 데이터의 원천은 전통 금융 기관(CME, SEC, ETF 운용사)이며, 이들은 무료 공개 API를 제공하지 않는다.
- 프로그래밍 접근이 가능한 유일한 경로는 **CoinGlass API ($29/월~)** 같은 유료 데이터 집계 서비스이다.
- 웹에서 무료로 열람은 가능하므로, 당장은 **외부 링크 연결**(CoinGlass, Farside 등)로 대응하고, 추후 비용 대비 가치를 판단하여 API 구독 여부를 결정하는 것이 합리적이다.

---

## 6. 참고 자료

### Velo 공식
- [Velo TradFi Page](https://velo.xyz/tradfi)
- [Velo TradFi Docs](https://docs.velo.xyz/web-app/tradfi)

### ETF Flows 데이터
- [Farside Investors - BTC ETF Flows](https://farside.co.uk/btc/)
- [Farside Investors - All Data](https://farside.co.uk/bitcoin-etf-flow-all-data/)
- [CoinGlass - Bitcoin ETF](https://www.coinglass.com/etf/bitcoin)
- [CoinGlass - Ethereum ETF](https://www.coinglass.com/etf/ethereum)
- [CoinGlass API - ETF Flows History](https://docs.coinglass.com/reference/etf-flows-history)
- [CoinGlass API - ETF Premium/Discount](https://docs.coinglass.com/reference/bitcoin-etf-premium-discount-history)
- [Bitbo - ETF Flows](https://bitbo.io/treasuries/etf-flows/)

### CME 데이터
- [CME Bitcoin Futures](https://www.cmegroup.com/markets/cryptocurrencies/bitcoin/bitcoin.html)
- [CME XRP Futures](https://www.cmegroup.com/markets/cryptocurrencies/xrp/xrp.html)
- [CME SOL Futures](https://www.cmegroup.com/markets/cryptocurrencies/solana/solana.contractSpecs.html)
- [CME Volume & OI Reports](https://www.cmegroup.com/market-data/volume-open-interest.html)

### Grayscale Premium
- [CoinGlass - Grayscale Premium](https://www.coinglass.com/Grayscale)
- [CryptoQuant - CME Basis](https://cryptoquant.com/asset/btc/chart/derivatives/cme-futures-annualized-basis)
- [YCharts - GBTC Premium/Discount](https://ycharts.com/companies/GBTC/discount_or_premium_to_nav)

### ETF 목록
- [CoinMarketCap - Bitcoin ETF List](https://coinmarketcap.com/etf/bitcoin/)
- [CoinMarketCap - Ethereum ETF List](https://coinmarketcap.com/etf/ethereum/)
- [U.S. News - 11 Spot Bitcoin ETFs](https://money.usnews.com/investing/articles/new-spot-bitcoin-etfs-to-buy)
- [NerdWallet - Solana ETFs](https://www.nerdwallet.com/investing/learn/solana-etfs)
