# Velo Market Screener - 요구사항 문서

## 소개

BitScope에 '마켓 스크리너' 페이지를 신규 추가한다. velo.xyz/market과 유사하게, 250+ 선물 코인의 가격/OI/펀딩/거래량 등을 멀티 거래소(Binance, Bybit, OKX, Gate.io, Bitget, Hyperliquid) 6개 거래소에서 집계하여 테이블 + 차트로 제공하는 마켓 와이드 스크리너이다.

본 Phase 1은 **프론트엔드 중심 구현**으로, 서버 수집 없이 각 거래소의 벌크 ticker API(1회 호출로 전 코인 데이터)를 Next.js Route Handler에서 프록시하여 클라이언트에서 집계/시각화한다. 코인 분류(시가총액, 섹터)는 정적 매핑으로 관리한다.

### 참고 자료
- 리서치 문서: `docs/velo-market-page-research.md`
- 참고 사이트: [velo.xyz/market](https://velo.xyz/market)

### 대상 거래소
- Binance, Bybit, OKX, Gate.io, Bitget, Hyperliquid

---

## 요구사항

### 요구사항 1: 사이드바 메뉴 추가

**사용자 스토리:** BitScope 사용자로서, 사이드바에서 마켓 스크리너 메뉴를 클릭하여 해당 페이지에 빠르게 접근하고 싶다. 이를 통해 다른 기능과 동일한 내비게이션 경험을 유지할 수 있다.

#### 수락 기준

1. WHEN 사용자가 사이드바를 볼 때 THEN 시스템 SHALL "마켓" 섹션(`sectionMarket`)에 "마켓 스크리너" 메뉴 항목을 표시한다.
2. WHEN 사용자가 "마켓 스크리너" 메뉴를 클릭할 때 THEN 시스템 SHALL `/market-screener` 경로로 이동한다.
3. WHEN 사용자가 `/market-screener` 경로에 있을 때 THEN 시스템 SHALL 해당 메뉴 항목을 활성 상태(active)로 표시한다.
4. WHERE 하단 탭 네비게이션(모바일) THEN 시스템 SHALL 마켓 스크리너 메뉴를 포함하지 않아도 된다(데스크톱 사이드바 우선).

---

### 요구사항 2: 스크리너 테이블 - 기본 구조

**사용자 스토리:** 트레이더로서, 250+ 선물 코인의 주요 지표(가격, 변화율, 거래량, OI, 펀딩비율)를 한 테이블에서 한눈에 보고 싶다. 이를 통해 시장 전체를 빠르게 파악하고 거래 기회를 찾을 수 있다.

#### 수락 기준

1. WHEN 페이지가 로드될 때 THEN 시스템 SHALL 6개 거래소의 벌크 ticker API를 병렬 호출하여 전체 선물 코인 목록을 집계한다.
2. WHEN 데이터가 로드된 후 THEN 시스템 SHALL 다음 컬럼이 포함된 테이블을 표시한다: 코인명(심볼+이름), 가격(USD), 24h 변화율(%), 24h 거래량(USD), OI(USD), 펀딩비율(%).
3. WHEN 24h 변화율이 양수일 때 THEN 시스템 SHALL 해당 셀을 녹색(상승)으로 표시한다.
4. WHEN 24h 변화율이 음수일 때 THEN 시스템 SHALL 해당 셀을 빨간색(하락)으로 표시한다.
5. WHEN 여러 거래소에 동일 코인이 존재할 때 THEN 시스템 SHALL 거래소별 데이터를 하나의 행으로 집계(가격: 거래량 가중 평균, 거래량/OI: 합산)한다.
6. WHEN 사용자가 테이블 헤더 컬럼을 클릭할 때 THEN 시스템 SHALL 해당 컬럼 기준으로 오름차순/내림차순 정렬을 토글한다.
7. WHEN 사용자가 테이블의 코인 행을 클릭할 때 THEN 시스템 SHALL `/futures-dashboard?coin=XXX` 경로로 이동하여 해당 코인의 상세 대시보드를 표시한다.
8. WHEN 데이터 로딩 중일 때 THEN 시스템 SHALL 스켈레톤 UI를 표시하여 사용자에게 로딩 상태를 알린다.
9. WHEN 거래소 API 호출이 실패할 때 THEN 시스템 SHALL 실패한 거래소를 제외한 나머지 데이터로 테이블을 표시하고, 일부 거래소 데이터가 누락됨을 안내한다.

---

### 요구사항 3: 스크리너 테이블 - 정렬 탭 필터

**사용자 스토리:** 트레이더로서, 미리 정의된 정렬 탭(Top Gainers, Top Losers, Top Volume, New Listings)으로 빠르게 시장을 필터링하고 싶다. 이를 통해 특정 조건의 코인을 즉시 찾을 수 있다.

#### 수락 기준

1. WHEN 페이지가 로드될 때 THEN 시스템 SHALL "Top Gainers" 탭을 기본 선택 상태로 표시한다.
2. WHEN 사용자가 "Top Gainers" 탭을 선택할 때 THEN 시스템 SHALL 24h 변화율 기준 내림차순으로 상위 코인을 표시한다.
3. WHEN 사용자가 "Top Losers" 탭을 선택할 때 THEN 시스템 SHALL 24h 변화율 기준 오름차순으로 하위 코인을 표시한다.
4. WHEN 사용자가 "Top Volume" 탭을 선택할 때 THEN 시스템 SHALL 24h 거래량 기준 내림차순으로 상위 코인을 표시한다.
5. WHEN 사용자가 "New Listings" 탭을 선택할 때 THEN 시스템 SHALL 최근 거래소에 신규 상장된 코인 목록을 표시한다.
6. IF "New Listings" 데이터를 아직 수집하지 못한 경우 THEN 시스템 SHALL 해당 탭에 "데이터 준비 중" 안내 메시지를 표시한다.

---

### 요구사항 4: 스크리너 테이블 - 시가총액 탭 필터

**사용자 스토리:** 트레이더로서, 시가총액 기준(Large Cap, Mid Cap, Small Cap)으로 코인을 필터링하고 싶다. 이를 통해 투자 성향에 맞는 코인 그룹을 쉽게 탐색할 수 있다.

#### 수락 기준

1. WHEN 사용자가 "Large Cap" 탭을 선택할 때 THEN 시스템 SHALL 시가총액 $10B 이상인 코인만 표시한다.
2. WHEN 사용자가 "Mid Cap" 탭을 선택할 때 THEN 시스템 SHALL 시가총액 $1B ~ $10B인 코인만 표시한다.
3. WHEN 사용자가 "Small Cap" 탭을 선택할 때 THEN 시스템 SHALL 시가총액 $1B 미만인 코인만 표시한다.
4. WHERE 시가총액 분류 THEN 시스템 SHALL 정적 매핑(하드코딩) 데이터를 사용한다(Phase 1).
5. IF 특정 코인이 정적 매핑에 포함되지 않은 경우 THEN 시스템 SHALL 해당 코인을 "Uncategorized"로 분류하고 모든 시가총액 탭에서 표시하지 않되, 전체 보기(All) 시에는 표시한다.

---

### 요구사항 5: 스크리너 테이블 - 섹터 탭 필터

**사용자 스토리:** 트레이더로서, 섹터별(DeFi, L1, L2, Metaverse, Meme, Dino, AI)로 코인을 필터링하고 싶다. 이를 통해 관심 있는 섹터의 코인 동향을 집중적으로 파악할 수 있다.

#### 수락 기준

1. WHEN 사용자가 섹터 탭 중 하나를 선택할 때 THEN 시스템 SHALL 해당 섹터에 속하는 코인만 테이블에 표시한다.
2. WHERE 섹터 분류 THEN 시스템 SHALL 다음 7개 섹터를 제공한다: DeFi, L1, L2, Metaverse, Meme, Dino, AI.
3. WHERE 섹터 매핑 THEN 시스템 SHALL 정적 매핑(하드코딩) 데이터를 사용한다(Phase 1).
4. IF 하나의 코인이 여러 섹터에 속하는 경우(예: NEAR는 L1이자 AI) THEN 시스템 SHALL 해당 코인을 각 관련 섹터 탭에서 모두 표시한다.
5. IF 특정 코인이 어떤 섹터에도 분류되지 않은 경우 THEN 시스템 SHALL 해당 코인을 섹터 탭에서 제외하되, 전체 보기(All) 시에는 표시한다.

---

### 요구사항 6: 스크리너 테이블 - 탭 구조 및 조합

**사용자 스토리:** 트레이더로서, 정렬 탭, 시가총액 탭, 섹터 탭을 조합하여 원하는 조건으로 정밀하게 코인을 필터링하고 싶다.

#### 수락 기준

1. WHEN 페이지 상단에 탭 영역이 표시될 때 THEN 시스템 SHALL 3개 탭 그룹을 행(row)으로 제공한다: (1) 정렬 탭 (Top Gainers/Losers/Volume/New Listings), (2) 시가총액 탭 (All/Large/Mid/Small Cap), (3) 섹터 탭 (All/DeFi/L1/L2/Metaverse/Meme/Dino/AI).
2. WHEN 사용자가 여러 탭 그룹에서 동시에 선택할 때 THEN 시스템 SHALL 모든 선택된 필터를 AND 조건으로 결합하여 테이블을 표시한다.
3. WHEN 필터 적용 결과가 0건일 때 THEN 시스템 SHALL "해당 조건에 맞는 코인이 없습니다" 메시지를 표시한다.
4. WHERE 시가총액 탭과 섹터 탭 THEN 시스템 SHALL 각각 "All" 옵션을 기본값으로 제공하여 필터를 해제할 수 있게 한다.

---

### 요구사항 7: Return Buckets (수익률 분포 히스토그램)

**사용자 스토리:** 트레이더로서, 전체 선물 시장의 수익률 분포를 히스토그램으로 보고 싶다. 이를 통해 시장 전체의 건강 상태(과열/공포)를 한눈에 파악할 수 있다.

#### 수락 기준

1. WHEN 페이지가 로드될 때 THEN 시스템 SHALL 수익률 분포 히스토그램을 스크리너 테이블 하단 또는 옆에 표시한다.
2. WHEN 기간 선택기가 표시될 때 THEN 시스템 SHALL 1d, 1w, 1m 세 가지 기간 옵션을 제공한다.
3. WHEN 사용자가 기간을 선택할 때 THEN 시스템 SHALL 해당 기간 동안의 코인별 수익률을 구간별로 분류하여 히스토그램으로 표시한다.
4. WHERE 히스토그램 X축 THEN 시스템 SHALL 수익률 구간을 표시한다(예: -30% ~ +30%, 5% 단위).
5. WHERE 히스토그램 Y축 THEN 시스템 SHALL 해당 구간에 속하는 코인 수를 표시한다.
6. WHEN 사용자가 히스토그램 막대 위에 마우스를 올릴 때(hover) THEN 시스템 SHALL 해당 구간에 속하는 코인 목록을 툴팁으로 표시한다.
7. WHERE 양의 수익률 구간 THEN 시스템 SHALL 녹색 계열 색상으로 막대를 표시한다.
8. WHERE 음의 수익률 구간 THEN 시스템 SHALL 빨간색 계열 색상으로 막대를 표시한다.
9. WHEN 1d 기간이 선택된 경우 THEN 시스템 SHALL 벌크 ticker의 24h 변화율 데이터를 사용하여 별도 API 호출 없이 계산한다.

---

### 요구사항 8: Market Volume (거래소별 총 거래량 바 차트)

**사용자 스토리:** 트레이더로서, 6개 거래소별 총 선물 거래량을 비교하고 싶다. 이를 통해 어느 거래소에 거래가 집중되는지 파악할 수 있다.

#### 수락 기준

1. WHEN 페이지가 로드될 때 THEN 시스템 SHALL 거래소별 24h 총 선물 거래량(USD)을 바 차트로 표시한다.
2. WHERE 바 차트 THEN 시스템 SHALL 6개 거래소(Binance, Bybit, OKX, Gate.io, Bitget, Hyperliquid)를 각각 다른 색상으로 구분하여 표시한다.
3. WHEN 사용자가 바 차트의 특정 거래소 막대 위에 마우스를 올릴 때 THEN 시스템 SHALL 해당 거래소의 정확한 거래량(USD) 수치를 툴팁으로 표시한다.
4. WHERE 거래량 데이터 THEN 시스템 SHALL 각 거래소 벌크 ticker API의 quoteVolume(또는 동등 필드)을 전 코인 합산하여 계산한다.

---

### 요구사항 9: Total Open Interest (거래소별 총 OI 바 차트)

**사용자 스토리:** 트레이더로서, 6개 거래소별 총 미결제약정(OI)을 비교하고 싶다. 이를 통해 어느 거래소에 포지션이 집중되어 있는지 파악할 수 있다.

#### 수락 기준

1. WHEN 페이지가 로드될 때 THEN 시스템 SHALL 거래소별 현재 총 OI(USD)를 바 차트로 표시한다.
2. WHERE 바 차트 THEN 시스템 SHALL 6개 거래소를 각각 다른 색상으로 구분하여 표시한다.
3. WHEN 사용자가 바 차트의 특정 거래소 막대 위에 마우스를 올릴 때 THEN 시스템 SHALL 해당 거래소의 정확한 OI(USD) 수치를 툴팁으로 표시한다.
4. WHERE OI 데이터 THEN 시스템 SHALL 각 거래소 벌크 ticker API의 OI 필드를 전 코인 합산하여 계산한다.
5. IF 특정 거래소의 벌크 ticker API에 OI가 포함되지 않은 경우(예: Binance는 별도 API 필요) THEN 시스템 SHALL 가능한 데이터 소스를 사용하거나 해당 거래소를 "데이터 없음"으로 표시한다.

---

### 요구사항 10: Sector Performance (섹터별 성과 비교 차트)

**사용자 스토리:** 트레이더로서, 주요 크립토 섹터(DeFi, L1, L2, Gaming, AI, Meme)의 평균 수익률을 비교하고 싶다. 이를 통해 어떤 섹터가 강세/약세인지 파악하고 섹터 로테이션 전략에 활용할 수 있다.

#### 수락 기준

1. WHEN 페이지가 로드될 때 THEN 시스템 SHALL 6개 섹터(DeFi, L1, L2, Gaming, AI, Meme)의 평균 수익률을 비교 차트로 표시한다.
2. WHEN 기간 선택기가 표시될 때 THEN 시스템 SHALL 1d, 1w, 1m 세 가지 기간 옵션을 제공한다.
3. WHEN 사용자가 기간을 선택할 때 THEN 시스템 SHALL 해당 기간의 섹터별 평균 수익률을 재계산하여 표시한다.
4. WHERE 섹터별 평균 수익률 계산 THEN 시스템 SHALL 해당 섹터에 속하는 코인들의 수익률을 단순 산술 평균으로 계산한다.
5. WHEN 사용자가 차트의 특정 섹터 위에 마우스를 올릴 때 THEN 시스템 SHALL 해당 섹터의 평균 수익률과 포함된 코인 수를 툴팁으로 표시한다.
6. WHERE 양의 수익률 섹터 THEN 시스템 SHALL 녹색 계열로, 음의 수익률 섹터 SHALL 빨간색 계열로 표시한다.

---

### 요구사항 11: 데이터 수집 및 집계 (Next.js Route Handler)

**사용자 스토리:** 시스템으로서, 6개 거래소의 벌크 ticker API를 효율적으로 호출하여 클라이언트에 집계된 데이터를 제공하고 싶다. 이를 통해 CORS 문제 없이 안정적으로 데이터를 전달할 수 있다.

#### 수락 기준

1. WHEN 클라이언트가 마켓 스크리너 데이터를 요청할 때 THEN 시스템 SHALL Next.js Route Handler(`/api/market-screener/tickers`)를 통해 6개 거래소 벌크 ticker API를 병렬 호출한다.
2. WHEN 6개 거래소 API를 호출할 때 THEN 시스템 SHALL `Promise.allSettled`를 사용하여 일부 실패에도 나머지 데이터를 반환한다.
3. WHEN 응답 데이터를 정규화할 때 THEN 시스템 SHALL 각 거래소의 서로 다른 응답 포맷을 통일된 스키마로 변환한다(코인 심볼, 가격, 24h변화율, 24h거래량, OI, 펀딩비율).
4. WHERE 코인 심볼 정규화 THEN 시스템 SHALL 각 거래소의 심볼 형식(예: BTCUSDT, BTC-USDT-SWAP, BTC_USDT)을 통일된 형식(예: BTC)으로 변환한다.
5. WHEN 동일 코인에 대해 여러 거래소 데이터가 존재할 때 THEN 시스템 SHALL 거래소별 데이터를 개별 보존하면서 집계 데이터(가중 평균 가격, 합산 거래량/OI)도 함께 제공한다.
6. WHEN Route Handler가 호출될 때 THEN 시스템 SHALL 응답에 적절한 Cache-Control 헤더(예: `s-maxage=30, stale-while-revalidate=60`)를 설정하여 불필요한 중복 호출을 방지한다.

---

### 요구사항 12: 거래소별 API 호출 상세

**사용자 스토리:** 시스템으로서, 각 거래소의 고유한 API 엔드포인트와 응답 포맷에 맞게 데이터를 수집하고 싶다.

#### 수락 기준

1. WHERE Binance THEN 시스템 SHALL `GET /fapi/v1/ticker/24hr`(symbol 파라미터 생략)을 호출하여 전 코인 ticker를 가져온다.
2. WHERE Bybit THEN 시스템 SHALL `GET /v5/market/tickers?category=linear`를 호출하여 전 코인 ticker(OI, 펀딩 포함)를 가져온다.
3. WHERE OKX THEN 시스템 SHALL `GET /api/v5/market/tickers?instType=SWAP`를 호출하여 전 코인 ticker를 가져온다.
4. WHERE Gate.io THEN 시스템 SHALL `GET /api/v4/futures/usdt/tickers`를 호출하여 전 코인 ticker(OI, 펀딩 포함)를 가져온다.
5. WHERE Bitget THEN 시스템 SHALL `GET /api/v2/mix/market/tickers?productType=USDT-FUTURES`를 호출하여 전 코인 ticker(OI, 펀딩 포함)를 가져온다.
6. WHERE Hyperliquid THEN 시스템 SHALL `POST /info`에 `{"type":"metaAndAssetCtxs"}` body를 전송하여 전 코인 메타 + 컨텍스트 데이터를 가져온다.
7. WHEN 각 거래소 API 호출 시 THEN 시스템 SHALL 인증 없이(공개 API) 호출하며, 각 거래소의 rate limit을 준수한다.

---

### 요구사항 13: 정적 매핑 데이터 관리

**사용자 스토리:** 개발자로서, 코인의 시가총액 분류와 섹터 분류를 정적 매핑 파일로 관리하고 싶다. 이를 통해 외부 API 의존 없이 안정적으로 분류 데이터를 제공할 수 있다.

#### 수락 기준

1. WHERE 정적 매핑 파일 THEN 시스템 SHALL `packages/shared` 또는 적절한 공유 위치에 코인 분류 매핑 데이터를 관리한다.
2. WHERE 시가총액 매핑 THEN 시스템 SHALL 각 코인 심볼을 `large`, `mid`, `small` 중 하나로 분류한다.
3. WHERE 섹터 매핑 THEN 시스템 SHALL 각 코인 심볼을 하나 이상의 섹터(`DeFi`, `L1`, `L2`, `Metaverse`, `Meme`, `Dino`, `AI`)로 분류한다.
4. WHEN 새로운 코인이 거래소에 상장될 때 THEN 개발자 SHALL 정적 매핑 파일을 수동으로 업데이트한다(Phase 1 범위).
5. WHERE 매핑 데이터 THEN 시스템 SHALL TypeScript 상수 객체(`Record<string, ...>`)로 관리하여 타입 안전성을 보장한다.

---

### 요구사항 14: 클라이언트 상태 관리 및 갱신

**사용자 스토리:** 트레이더로서, 마켓 스크리너 데이터가 자동으로 주기적으로 갱신되어 최신 시장 상황을 확인하고 싶다.

#### 수락 기준

1. WHEN 페이지가 로드될 때 THEN 시스템 SHALL TanStack Query를 사용하여 데이터를 fetch하고 캐싱한다.
2. WHILE 사용자가 페이지에 머무르는 동안 THEN 시스템 SHALL 30초~60초 주기로 데이터를 자동 refetch한다.
3. WHEN 데이터가 refetch될 때 THEN 시스템 SHALL 이전 데이터를 유지하면서 백그라운드에서 갱신(stale-while-revalidate 패턴)한다.
4. WHEN 사용자가 브라우저 탭을 다시 활성화할 때 THEN 시스템 SHALL 자동으로 최신 데이터를 refetch한다.
5. WHEN 데이터 갱신 시 가격 변동이 발생한 경우 THEN 시스템 SHALL 변동된 셀에 짧은 하이라이트 애니메이션(flash)을 적용하여 변동을 시각적으로 알린다.

---

### 요구사항 15: 페이지 레이아웃 및 반응형 디자인

**사용자 스토리:** 사용자로서, 다양한 화면 크기에서 마켓 스크리너를 편리하게 사용하고 싶다.

#### 수락 기준

1. WHEN 데스크톱(lg 이상) 화면에서 볼 때 THEN 시스템 SHALL 스크리너 테이블을 상단에, 하단에 차트 위젯들(Return Buckets, Market Volume, Total OI, Sector Performance)을 2x2 그리드로 배치한다.
2. WHEN 태블릿(md) 화면에서 볼 때 THEN 시스템 SHALL 차트 위젯들을 2열 그리드로 표시한다.
3. WHEN 모바일(sm 이하) 화면에서 볼 때 THEN 시스템 SHALL 차트 위젯들을 1열로 스택하여 표시한다.
4. WHERE 테이블 THEN 시스템 SHALL 수평 스크롤을 지원하여 모바일에서도 모든 컬럼을 확인할 수 있게 한다.
5. WHERE 기존 BitScope 디자인 THEN 시스템 SHALL 기존 테마(다크 모드 포함)와 일관된 스타일을 적용한다.

---

### 요구사항 16: 검색 기능

**사용자 스토리:** 트레이더로서, 특정 코인을 이름이나 심볼로 빠르게 검색하고 싶다.

#### 수락 기준

1. WHEN 테이블 상단에 검색 입력란이 표시될 때 THEN 시스템 SHALL 코인 심볼 또는 이름으로 검색할 수 있는 텍스트 입력란을 제공한다.
2. WHEN 사용자가 검색어를 입력할 때 THEN 시스템 SHALL 입력 즉시(debounce 300ms) 테이블을 필터링하여 매칭되는 코인만 표시한다.
3. WHEN 검색어가 비어있을 때 THEN 시스템 SHALL 현재 선택된 탭 필터에 맞는 전체 코인을 표시한다.
4. WHERE 검색 THEN 시스템 SHALL 대소문자를 구분하지 않고 매칭한다.

---

## 비기능 요구사항

### NFR-1: 성능

1. WHEN 페이지가 최초 로드될 때 THEN 시스템 SHALL 3초 이내에 스크리너 테이블의 첫 화면을 표시한다(스켈레톤 포함).
2. WHEN 6개 거래소 API를 병렬 호출할 때 THEN 시스템 SHALL 5초 이내에 모든 응답을 수신하거나, 타임아웃(5초)된 거래소를 제외하고 결과를 반환한다.
3. WHEN 250+ 코인 데이터를 테이블에 렌더링할 때 THEN 시스템 SHALL 가상화(virtualization) 또는 페이지네이션을 적용하여 렌더링 성능을 유지한다.
4. WHERE 탭/필터 전환 THEN 시스템 SHALL 100ms 이내에 테이블 데이터를 재필터링하여 표시한다.

### NFR-2: 에러 핸들링 및 복원력

1. WHEN 개별 거래소 API가 실패할 때 THEN 시스템 SHALL 나머지 거래소 데이터로 서비스를 계속 제공한다(Graceful Degradation).
2. WHEN 모든 거래소 API가 실패할 때 THEN 시스템 SHALL 에러 메시지와 재시도 버튼을 표시한다.
3. WHEN API 호출이 타임아웃될 때 THEN 시스템 SHALL 5초 후 해당 거래소를 실패로 처리한다.

### NFR-3: 접근성

1. WHERE 테이블 THEN 시스템 SHALL 시맨틱 HTML 테이블 요소(`<table>`, `<thead>`, `<tbody>`, `<th>`, `<td>`)를 사용한다.
2. WHERE 차트 THEN 시스템 SHALL 적절한 ARIA 레이블과 색상 대비(WCAG AA 기준)를 유지한다.
3. WHERE 탭 네비게이션 THEN 시스템 SHALL 키보드 탐색(Tab, Enter, Arrow keys)을 지원한다.

### NFR-4: 국제화

1. WHERE 모든 UI 텍스트 THEN 시스템 SHALL 기존 i18n 시스템을 활용하여 한국어/영어 전환을 지원한다.
2. WHERE 숫자 포맷 THEN 시스템 SHALL 큰 숫자를 축약 표기(예: $1.2B, $340M)하고, 소수점은 적절한 자릿수로 표시한다.

### NFR-5: 기술 스택 준수

1. WHERE 프론트엔드 THEN 시스템 SHALL Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, shadcn/ui를 사용한다.
2. WHERE 차트 THEN 시스템 SHALL Recharts 라이브러리를 사용한다.
3. WHERE 데이터 fetch THEN 시스템 SHALL TanStack Query를 사용한다.
4. WHERE API 프록시 THEN 시스템 SHALL Next.js Route Handler를 사용한다.
