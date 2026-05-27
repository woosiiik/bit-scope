# 멀티 거래소 선물 대시보드 - 요구사항 문서

## 소개

BitScope 프로젝트에 **멀티 거래소 선물 대시보드** 페이지를 신규 추가한다. [velo.xyz/futures](https://velo.xyz/futures)와 유사한 형태로, 하나의 코인을 선택하면 6개 거래소(Binance, Bybit, OKX, Gate.io, Bitget, Hyperliquid)의 선물 핵심 지표를 **3x4 그리드(총 12개) 차트 패널**로 한눈에 비교할 수 있다.

기존 '선물 마켓 데이터' 메뉴(Binance 단일 거래소 기반, `/futures`)는 그대로 유지하며, 새 메뉴를 사이드바에서 기존 메뉴 위에 배치한다.

데이터는 각 거래소의 공개(무료) API에서 직접 수집하며, Velo API는 사용하지 않는다. 기술 스택은 Next.js Route Handler(CORS 프록시) + Recharts(차트) + TanStack Query(데이터 캐싱)를 사용하여 기존 아키텍처와 일관성을 유지한다.

### 대상 거래소

| 거래소 | ID | 비고 |
|---|---|---|
| Binance | `binance` | 코인 리스트 기준 거래소 |
| Bybit | `bybit` | |
| OKX | `okx` | |
| Gate.io | `gate` | |
| Bitget | `bitget` | Liquidation 미지원 가능 |
| Hyperliquid | `hyperliquid` | Liquidation 미지원 가능, POST /info 방식 |

---

## 요구사항

### 요구사항 1: 코인 선택기

**사용자 스토리:** 사용자로서, 상단 셀렉터에서 코인을 선택하여 해당 코인의 멀티 거래소 선물 지표를 조회하고 싶다. 이를 통해 특정 코인에 대한 여러 거래소의 데이터를 한 번에 비교할 수 있다.

#### 수용 기준

1. WHEN 사용자가 멀티 거래소 선물 대시보드 페이지에 진입한다 THEN 시스템은 Binance 선물 상장 코인 리스트를 기반으로 코인 목록을 로드하여 상단 셀렉터에 표시 SHALL 한다.
2. WHEN 코인 목록 로드가 완료된다 THEN 시스템은 기본값으로 BTCUSDT를 선택 SHALL 한다.
3. WHEN 사용자가 셀렉터에서 다른 코인을 선택한다 THEN 시스템은 12개 차트 패널 전체의 데이터를 선택된 코인으로 갱신 SHALL 한다.
4. WHEN 사용자가 셀렉터에 검색어를 입력한다 THEN 시스템은 코인 심볼(baseAsset)을 기준으로 목록을 필터링 SHALL 한다.
5. IF Binance 선물 코인 리스트 API 호출에 실패한다 THEN 시스템은 `packages/shared`에 정의된 `FUTURES_COINS` 상수 목록을 폴백으로 사용 SHALL 한다.
6. WHEN 사용자가 코인을 선택한다 THEN 시스템은 URL 쿼리 파라미터(`?coin=BTC`)에 선택된 코인을 반영하여 북마크 및 공유가 가능하게 SHALL 한다.

---

### 요구사항 2: 3x4 그리드 차트 레이아웃

**사용자 스토리:** 사용자로서, 12개의 차트 패널이 논리적으로 그룹핑된 3x4 그리드 레이아웃으로 표시되길 원한다. 이를 통해 관련 지표를 인접하게 비교할 수 있다.

#### 수용 기준

1. WHEN 대시보드 페이지가 로드된다 THEN 시스템은 12개 차트를 3열 x 4행 그리드로 배치 SHALL 한다.
2. WHERE 그리드 레이아웃 THEN 시스템은 다음 논리적 그룹 및 배치 순서를 따라야 SHALL 한다:
   - **1행 (가격/거래량 개요):** Price | 24h Volume | Volume (히스토리)
   - **2행 (미결제약정):** OI Snapshot | Open Interest (히스토리) | Funding Rate
   - **3행 (유동성/흐름):** Liquidations | CVD Dollars | 3M Annualized Basis
   - **4행 (수익률 분석):** 1m Avg Return By Hour | Avg Return By Day | Cumulative Return By Session
3. WHEN 화면 너비가 768px 미만이다 THEN 시스템은 그리드를 1열 레이아웃으로 변경 SHALL 한다.
4. WHEN 화면 너비가 768px 이상 1280px 미만이다 THEN 시스템은 그리드를 2열 레이아웃으로 변경 SHALL 한다.
5. WHEN 화면 너비가 1280px 이상이다 THEN 시스템은 그리드를 3열 레이아웃으로 표시 SHALL 한다.

---

### 요구사항 3: 24h Volume 차트 패널

**사용자 스토리:** 사용자로서, 선택한 코인의 24시간 거래량을 거래소별로 비교하고 싶다. 이를 통해 어떤 거래소에 유동성이 집중되어 있는지 파악할 수 있다.

#### 수용 기준

1. WHEN 코인이 선택되어 있다 THEN 시스템은 6개 거래소의 24시간 선물 거래량(USDT 기준)을 막대 차트로 표시 SHALL 한다.
2. WHEN 데이터 로드가 완료된다 THEN 시스템은 거래소별로 고유한 색상을 부여하여 시각적으로 구분 SHALL 한다.
3. WHEN 사용자가 막대 위에 마우스를 올린다 THEN 시스템은 해당 거래소명과 정확한 거래량 수치를 툴팁으로 표시 SHALL 한다.
4. IF 특정 거래소에서 24h Volume 데이터를 가져올 수 없다 THEN 시스템은 해당 거래소의 막대를 생략하고 나머지 거래소만 표시 SHALL 한다.

---

### 요구사항 4: OI Snapshot 차트 패널

**사용자 스토리:** 사용자로서, 선택한 코인의 현재 미결제약정(Open Interest)을 거래소별로 비교하고 싶다. 이를 통해 포지션이 어디에 집중되어 있는지 알 수 있다.

#### 수용 기준

1. WHEN 코인이 선택되어 있다 THEN 시스템은 6개 거래소의 현재 OI(USDT 환산)를 막대 차트로 표시 SHALL 한다.
2. WHEN 데이터 로드가 완료된다 THEN 시스템은 OI 값을 USDT 금액 기준으로 정규화하여 표시 SHALL 한다.
3. IF 특정 거래소에서 OI 데이터를 제공하지 않는다 THEN 시스템은 해당 거래소를 생략하고 나머지를 표시 SHALL 한다.

---

### 요구사항 5: Funding Rate 차트 패널

**사용자 스토리:** 사용자로서, 선택한 코인의 펀딩비를 거래소별로 비교하고 싶다. 이를 통해 캐리 트레이드 기회나 시장 편향을 파악할 수 있다.

#### 수용 기준

1. WHEN 코인이 선택되어 있다 THEN 시스템은 6개 거래소의 현재 펀딩비를 거래소별로 비교하는 차트를 표시 SHALL 한다.
2. WHEN 사용자가 "Annual" 토글을 선택한다 THEN 시스템은 펀딩비를 연간 환산 값(8h rate x 3 x 365)으로 표시 SHALL 한다.
3. WHEN 사용자가 "8hrs" 토글을 선택한다 THEN 시스템은 펀딩비를 8시간 기준 원본 값으로 표시 SHALL 한다.
4. WHEN 페이지가 처음 로드된다 THEN 시스템은 기본값으로 "Annual" 토글을 선택 SHALL 한다.
5. WHEN 펀딩비가 양수이다 THEN 시스템은 해당 값을 녹색(profit 색상)으로 표시 SHALL 한다.
6. WHEN 펀딩비가 음수이다 THEN 시스템은 해당 값을 빨간색(loss 색상)으로 표시 SHALL 한다.

---

### 요구사항 6: Open Interest 히스토리 차트 패널

**사용자 스토리:** 사용자로서, 선택한 코인의 OI 변화 추이를 시간 경과에 따라 거래소별로 비교하고 싶다. 이를 통해 포지션 증감 트렌드를 파악할 수 있다.

#### 수용 기준

1. WHEN 코인이 선택되어 있다 THEN 시스템은 거래소별 OI 히스토리를 라인 차트로 표시 SHALL 한다.
2. WHEN 사용자가 기간 선택 옵션을 변경한다 THEN 시스템은 해당 기간(1d, 1w, 1m, 3m, 6m, 1y)에 맞는 데이터를 조회하여 차트를 갱신 SHALL 한다.
3. WHEN 각 거래소의 라인이 표시된다 THEN 시스템은 거래소별로 구분 가능한 고유 색상과 범례를 표시 SHALL 한다.
4. IF 특정 거래소가 요청된 기간의 히스토리 데이터를 지원하지 않는다 THEN 시스템은 해당 거래소의 라인을 제외하고 나머지를 표시 SHALL 한다.

---

### 요구사항 7: Price 차트 패널

**사용자 스토리:** 사용자로서, 선택한 코인의 가격 히스토리를 거래소별로 비교하고 싶다. 이를 통해 거래소간 가격 차이를 확인할 수 있다.

#### 수용 기준

1. WHEN 코인이 선택되어 있다 THEN 시스템은 거래소별 선물 가격 히스토리를 라인 차트로 표시 SHALL 한다.
2. WHEN 사용자가 기간 선택 옵션을 변경한다 THEN 시스템은 해당 기간(1d, 1w, 1m, 3m, 6m, 1y)에 맞는 데이터를 조회하여 차트를 갱신 SHALL 한다.
3. WHEN 각 거래소의 라인이 표시된다 THEN 시스템은 거래소별로 구분 가능한 고유 색상과 범례를 표시 SHALL 한다.

---

### 요구사항 8: 3 Month Annualized Basis 차트 패널

**사용자 스토리:** 사용자로서, BTC 또는 ETH의 3개월 연환산 베이시스(Futures-Spot 프리미엄)를 거래소별로 비교하고 싶다. 이를 통해 캐리 트레이드 수익 기회를 분석할 수 있다.

#### 수용 기준

1. IF 선택된 코인이 BTC 또는 ETH이다 THEN 시스템은 3개월 연환산 베이시스를 거래소별 라인 차트로 표시 SHALL 한다.
2. IF 선택된 코인이 BTC, ETH가 아니다 THEN 시스템은 차트 영역에 "이 코인은 3M Basis를 지원하지 않습니다" 메시지를 표시 SHALL 한다.
3. WHEN BTC 또는 ETH가 선택되어 있다 THEN 시스템은 각 거래소의 3개월 선물 가격과 현물 가격의 차이를 연환산 비율(%)로 계산하여 표시 SHALL 한다.
4. IF 특정 거래소가 3개월 만기 선물 상품을 제공하지 않는다 THEN 시스템은 해당 거래소를 차트에서 제외 SHALL 한다.

---

### 요구사항 9: Liquidations 차트 패널

**사용자 스토리:** 사용자로서, 선택한 코인의 청산 데이터를 롱/숏 분리하여 거래소별로 비교하고 싶다. 이를 통해 시장의 레버리지 리스크를 파악할 수 있다.

#### 수용 기준

1. WHEN 코인이 선택되어 있다 THEN 시스템은 거래소별 청산 데이터를 롱(상단)/숏(하단) 분리 막대 차트로 표시 SHALL 한다.
2. WHEN 사용자가 기간 선택 옵션을 변경한다 THEN 시스템은 해당 기간에 맞는 청산 데이터를 조회하여 차트를 갱신 SHALL 한다.
3. WHEN 롱 청산을 표시한다 THEN 시스템은 빨간색(loss 색상)으로 양수 방향에 표시 SHALL 한다.
4. WHEN 숏 청산을 표시한다 THEN 시스템은 녹색(profit 색상)으로 음수 방향에 표시 SHALL 한다.
5. IF 특정 거래소(예: Bitget, Hyperliquid)가 청산 데이터 API를 제공하지 않는다 THEN 시스템은 해당 거래소를 차트에서 제외하고 지원 거래소만 표시 SHALL 한다.

---

### 요구사항 10: Volume 히스토리 차트 패널

**사용자 스토리:** 사용자로서, 선택한 코인의 거래량 변화 추이를 시간 경과에 따라 거래소별로 비교하고 싶다. 이를 통해 유동성 흐름의 변화를 추적할 수 있다.

#### 수용 기준

1. WHEN 코인이 선택되어 있다 THEN 시스템은 거래소별 거래량 히스토리를 스택형 막대 차트로 표시 SHALL 한다.
2. WHEN 사용자가 기간 선택 옵션을 변경한다 THEN 시스템은 해당 기간(1d, 1w, 1m, 3m, 6m, 1y)에 맞는 데이터를 조회하여 차트를 갱신 SHALL 한다.
3. WHEN 각 거래소의 영역이 표시된다 THEN 시스템은 거래소별로 구분 가능한 고유 색상과 범례를 표시 SHALL 한다.

---

### 요구사항 11: CVD Dollars 차트 패널

**사용자 스토리:** 사용자로서, 선택한 코인의 누적 거래량 델타(CVD)를 거래소별로 비교하고 싶다. 이를 통해 매수/매도 압력의 방향을 파악할 수 있다.

#### 수용 기준

1. WHEN 코인이 선택되어 있다 THEN 시스템은 거래소별 CVD를 라인 차트로 표시 SHALL 한다.
2. WHEN 사용자가 "Dollars" 토글을 선택한다 THEN 시스템은 CVD를 USDT 금액 기준으로 표시 SHALL 한다.
3. WHEN 사용자가 "OI-normalized" 토글을 선택한다 THEN 시스템은 CVD를 해당 거래소의 OI 대비 비율(%)로 정규화하여 표시 SHALL 한다.
4. WHEN 사용자가 기간 선택 옵션을 변경한다 THEN 시스템은 해당 기간에 맞는 데이터를 조회하여 차트를 갱신 SHALL 한다.
5. WHEN 페이지가 처음 로드된다 THEN 시스템은 기본값으로 "Dollars" 토글을 선택 SHALL 한다.

---

### 요구사항 12: 1m Average Return By Hour 차트 패널

**사용자 스토리:** 사용자로서, 선택한 코인의 시간대별(UTC 0~23시) 평균 1분 수익률을 보고 싶다. 이를 통해 시간대별 시장 패턴을 파악할 수 있다.

#### 수용 기준

1. WHEN 코인이 선택되어 있다 THEN 시스템은 UTC 0시~23시까지의 시간대별 평균 1분 수익률을 막대 차트로 표시 SHALL 한다.
2. WHEN 수익률이 양수이다 THEN 시스템은 해당 막대를 녹색(profit 색상)으로 표시 SHALL 한다.
3. WHEN 수익률이 음수이다 THEN 시스템은 해당 막대를 빨간색(loss 색상)으로 표시 SHALL 한다.
4. WHEN 차트가 표시된다 THEN 시스템은 X축에 0~23 시간을 레이블로 표시 SHALL 한다.

---

### 요구사항 13: Average Return By Day 차트 패널

**사용자 스토리:** 사용자로서, 선택한 코인의 요일별 평균 수익률을 보고 싶다. 이를 통해 요일별 시장 패턴을 파악할 수 있다.

#### 수용 기준

1. WHEN 코인이 선택되어 있다 THEN 시스템은 월~일 요일별 평균 수익률을 막대 차트로 표시 SHALL 한다.
2. WHEN 수익률이 양수이다 THEN 시스템은 해당 막대를 녹색(profit 색상)으로 표시 SHALL 한다.
3. WHEN 수익률이 음수이다 THEN 시스템은 해당 막대를 빨간색(loss 색상)으로 표시 SHALL 한다.
4. WHEN 차트가 표시된다 THEN 시스템은 X축에 Mon~Sun 요일 레이블을 표시 SHALL 한다.

---

### 요구사항 14: Cumulative Return By Session 차트 패널

**사용자 스토리:** 사용자로서, 선택한 코인의 거래 세션별(APAC/EU/US) 누적 수익률을 보고 싶다. 이를 통해 어떤 시간대의 트레이더가 시장에 더 큰 영향을 미치는지 파악할 수 있다.

#### 수용 기준

1. WHEN 코인이 선택되어 있다 THEN 시스템은 3개 세션(APAC, EU, US)의 누적 수익률을 라인 차트로 표시 SHALL 한다.
2. WHERE 세션 시간대 정의:
   - APAC: UTC 00:00 ~ 08:00
   - EU: UTC 08:00 ~ 16:00
   - US: UTC 16:00 ~ 24:00
3. WHEN 각 세션의 라인이 표시된다 THEN 시스템은 세션별로 구분 가능한 고유 색상(예: APAC=파랑, EU=초록, US=빨강)과 범례를 표시 SHALL 한다.
4. WHEN 사용자가 기간 선택 옵션을 변경한다 THEN 시스템은 해당 기간에 맞는 데이터를 조회하여 차트를 갱신 SHALL 한다.

---

### 요구사항 15: 사이드바 네비게이션

**사용자 스토리:** 사용자로서, 사이드바에서 새로운 '멀티 거래소 선물' 메뉴를 쉽게 찾아 접근하고 싶다. 이를 통해 기존 '선물 마켓 데이터' 메뉴와 구분하여 사용할 수 있다.

#### 수용 기준

1. WHEN 사이드바가 렌더링된다 THEN 시스템은 '멀티 거래소 선물' 메뉴 항목을 '선물 마켓 데이터' 메뉴 위에 배치 SHALL 한다.
2. WHEN 사용자가 '멀티 거래소 선물' 메뉴를 클릭한다 THEN 시스템은 멀티 거래소 선물 대시보드 페이지로 이동 SHALL 한다.
3. WHILE 사용자가 멀티 거래소 선물 대시보드 페이지에 있다 THEN 시스템은 해당 사이드바 메뉴 항목을 활성(active) 상태로 표시 SHALL 한다.
4. WHEN 기존 '선물 마켓 데이터' 메뉴가 클릭된다 THEN 시스템은 기존 선물 마켓 데이터 페이지(`/futures`)로 정상적으로 이동 SHALL 한다.

---

### 요구사항 16: 거래소 API 프록시 및 데이터 수집

**사용자 스토리:** 개발자로서, 6개 거래소의 선물 공개 API를 Next.js Route Handler를 통해 프록시하고 싶다. 이를 통해 CORS 문제를 해결하고 Rate Limit을 관리할 수 있다.

#### 수용 기준

1. WHEN 클라이언트가 선물 지표 데이터를 요청한다 THEN 시스템은 Next.js Route Handler를 통해 각 거래소 API에 요청을 프록시 SHALL 한다.
2. WHEN 거래소 API 요청이 Rate Limit에 도달한다 THEN 시스템은 기존 `rate-limiter.ts`의 로직을 활용하여 요청을 제어 SHALL 한다.
3. WHEN 거래소 API 응답이 수신된다 THEN 시스템은 기존 `normalizer/` 패턴을 따라 거래소별 응답을 통일된 포맷으로 정규화 SHALL 한다.
   - 거래소별 심볼 포맷 변환: Binance(`BTCUSDT`), Bybit(`BTCUSDT`), OKX(`BTC-USDT-SWAP`), Gate.io(`BTC_USDT`), Bitget(`BTCUSDT`), Hyperliquid(`BTC`)
4. WHEN 동일한 데이터에 대한 반복 요청이 발생한다 THEN 시스템은 기존 `cache.ts`의 캐싱 메커니즘을 활용하여 불필요한 API 호출을 줄여야 SHALL 한다.
5. IF 특정 거래소 API 호출이 실패한다(타임아웃, 5xx 에러 등) THEN 시스템은 해당 거래소를 건너뛰고 나머지 거래소의 데이터를 정상적으로 표시 SHALL 한다.
6. WHEN 6개 거래소에 동시에 데이터를 요청한다 THEN 시스템은 병렬(Promise.allSettled)로 요청하여 응답 시간을 최소화 SHALL 한다.

---

### 요구사항 17: 기간 선택 컴포넌트

**사용자 스토리:** 사용자로서, 히스토리 차트에서 조회 기간을 선택하고 싶다. 이를 통해 단기(1일)부터 장기(1년)까지 다양한 시간대의 데이터를 확인할 수 있다.

#### 수용 기준

1. WHERE 기간 선택이 필요한 차트(OI 히스토리, Price, Liquidations, Volume 히스토리, CVD, Cumulative Return) THEN 시스템은 기간 선택 버튼 그룹(1d, 1w, 1m, 3m, 6m, 1y)을 차트 상단에 표시 SHALL 한다.
2. WHEN 사용자가 기간 버튼을 클릭한다 THEN 시스템은 해당 기간에 맞게 차트 데이터를 갱신 SHALL 한다.
3. WHEN 기간 선택 컴포넌트가 초기 로드된다 THEN 시스템은 기본값으로 "1m"(1개월)을 선택 SHALL 한다.
4. IF 특정 거래소가 요청된 기간의 히스토리 데이터를 지원하지 않는다 THEN 시스템은 해당 거래소의 데이터를 차트에서 제외하고 지원 가능한 거래소만 표시 SHALL 한다.

---

### 요구사항 18: 데이터 캐싱 및 성능

**사용자 스토리:** 사용자로서, 코인을 변경하거나 기간을 전환할 때 빠른 응답을 경험하고 싶다. 이를 통해 여러 코인/기간을 빠르게 탐색할 수 있다.

#### 수용 기준

1. WHEN 동일한 코인/기간 조합에 대해 반복 요청이 발생한다 THEN 시스템은 TanStack Query의 캐시를 활용하여 네트워크 요청 없이 즉시 데이터를 표시 SHALL 한다.
2. WHEN 스냅샷 데이터(24h Volume, OI Snapshot, Funding Rate)를 캐싱한다 THEN 시스템은 30초의 staleTime을 적용 SHALL 한다.
3. WHEN 히스토리 데이터(OI, Price, Volume 등)를 캐싱한다 THEN 시스템은 5분의 staleTime을 적용 SHALL 한다.
4. WHEN 12개 차트가 동시에 데이터를 로드한다 THEN 시스템은 각 차트를 독립적으로 로딩하여 먼저 완료된 차트부터 표시 SHALL 한다.
5. WHILE 차트 데이터가 로딩 중이다 THEN 시스템은 해당 차트 패널에 스켈레톤 로딩 UI를 표시 SHALL 한다.

---

### 요구사항 19: 에러 처리 및 부분 장애 대응

**사용자 스토리:** 사용자로서, 일부 거래소에 장애가 발생해도 나머지 거래소의 데이터를 정상적으로 볼 수 있길 원한다. 이를 통해 완전한 장애 상황에서도 유용한 정보를 얻을 수 있다.

#### 수용 기준

1. IF 6개 거래소 중 일부에서 에러가 발생한다 THEN 시스템은 에러가 발생한 거래소를 제외하고 성공한 거래소의 데이터만으로 차트를 렌더링 SHALL 한다.
2. WHEN 특정 거래소에서 에러가 발생한다 THEN 시스템은 해당 차트의 범례 또는 하단에 "OKX: 데이터 로드 실패"와 같은 알림을 표시 SHALL 한다.
3. IF 모든 거래소에서 에러가 발생한다 THEN 시스템은 차트 영역에 "데이터를 불러올 수 없습니다. 잠시 후 다시 시도해주세요." 메시지와 재시도 버튼을 표시 SHALL 한다.
4. WHEN 에러가 발생한 후 재시도 버튼을 클릭한다 THEN 시스템은 실패한 거래소에 대해서만 재요청 SHALL 한다.

---

### 요구사항 20: 거래소별 색상 및 범례 일관성

**사용자 스토리:** 사용자로서, 모든 차트에서 동일한 거래소가 동일한 색상으로 표시되길 원한다. 이를 통해 차트 간 비교가 직관적으로 가능하다.

#### 수용 기준

1. WHEN 차트에 거래소 데이터가 표시된다 THEN 시스템은 모든 12개 차트에서 다음 거래소별 고정 색상을 사용 SHALL 한다:
   - Binance: #F0B90B (노란색)
   - Bybit: #F7A600 (주황색)
   - OKX: #FFFFFF 또는 적절한 대비색
   - Gate.io: #2354E6 (파란색)
   - Bitget: #00C9A7 (민트색)
   - Hyperliquid: #6FFFE9 (시안색)
2. WHEN 차트에 범례가 표시된다 THEN 시스템은 거래소명과 해당 색상을 매칭하여 표시 SHALL 한다.
3. WHEN 다크 모드가 활성화되어 있다 THEN 시스템은 거래소 색상이 배경 대비 충분한 대비(contrast ratio 4.5:1 이상)를 유지하도록 조정 SHALL 한다.

---

## 비기능 요구사항

### NFR-1: 성능

1. WHEN 대시보드 페이지가 최초 로드된다 THEN 시스템은 첫 번째 차트가 3초 이내에 렌더링 완료되어야 SHALL 한다.
2. WHEN 12개 차트 전체가 로드된다 THEN 시스템은 모든 차트가 8초 이내에 렌더링 완료되어야 SHALL 한다.
3. WHEN 코인을 변경한다 THEN 시스템은 캐시된 데이터가 있는 경우 200ms 이내에 차트를 전환 SHALL 한다.

### NFR-2: 접근성

1. WHEN 차트가 표시된다 THEN 시스템은 각 차트에 적절한 ARIA 레이블을 포함 SHALL 한다.
2. WHEN 토글/버튼이 표시된다 THEN 시스템은 키보드 탭 네비게이션을 지원 SHALL 한다.

### NFR-3: 호환성

1. WHEN 사용자가 Chrome, Firefox, Safari, Edge 브라우저로 접속한다 THEN 시스템은 모든 차트가 정상적으로 표시 SHALL 한다.
2. WHEN 사용자가 모바일(360px 이상) 환경으로 접속한다 THEN 시스템은 1열 레이아웃으로 전환하여 스크롤 가능한 형태로 표시 SHALL 한다.

### NFR-4: 코드 품질

1. WHEN 새 코드를 작성한다 THEN 개발자는 기존 `apps/web/app/api/exchange/` 디렉토리의 프록시 패턴을 준수 SHALL 한다.
2. WHEN 새 코드를 작성한다 THEN 개발자는 기존 `packages/shared/src/constants/futures.ts`의 거래소 심볼 매핑 패턴을 재사용 SHALL 한다.
3. WHEN 공유 타입이나 상수가 필요하다 THEN 개발자는 `packages/shared`에 정의하여 재사용성을 보장 SHALL 한다.

### NFR-5: Rate Limit 및 API 안정성

1. WHEN 6개 거래소에 병렬 요청을 보낸다 THEN 시스템은 각 거래소별 Rate Limit(EXCHANGE_CONFIGS에 정의된 값)을 초과하지 않아야 SHALL 한다.
2. WHEN 거래소 API 호출이 실패한다 THEN 시스템은 최대 3회(RETRY_CONFIG.maxRetries)까지 지수 백오프로 재시도 SHALL 한다.

---

## 차트-거래소 지원 매트릭스 (참고)

| 차트 | Binance | Bybit | OKX | Gate.io | Bitget | Hyperliquid |
|---|---|---|---|---|---|---|
| 24h Volume | O | O | O | O | O | O |
| OI Snapshot | O | O | O | O | O | O |
| Funding Rate | O | O | O | O | O | O |
| OI History | O | O | O | O | O | O |
| Price | O | O | O | O | O | O |
| 3M Basis | O (BTC/ETH) | O (BTC/ETH) | O (BTC/ETH) | O (BTC/ETH) | - | - |
| Liquidations | O | O | O | O | - | - |
| Volume History | O | O | O | O | O | O |
| CVD Dollars | O | O | O | O | O | O |
| 1m Avg Return/Hour | O | O | O | O | O | O |
| Avg Return/Day | O | O | O | O | O | O |
| Cum Return/Session | O | O | O | O | O | O |

> 주: 위 매트릭스는 설계 단계에서 각 거래소 API 조사 후 확정된다. "-"는 해당 거래소에서 API를 제공하지 않아 지원이 불가능할 수 있음을 의미한다.
